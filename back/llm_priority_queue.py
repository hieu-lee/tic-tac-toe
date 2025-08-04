"""Priority queue system for LLM calls to ensure chatbot messages get priority.

Optimised version: 
- Uses a fixed pool of worker threads (``max_concurrent``) instead of spawning a new thread
  for every single task. This removes thread-creation overhead and eliminates busy-waiting
  that previously slowed down parallel throughput.
- Workers block on ``queue.get`` so there is no continual sleep/poll loop.
- Shutdown is handled by pushing sentinel ``None`` values into the queue allowing workers
  to exit promptly.
- The public API (``submit``, ``get_stats`` and the global helpers) remains unchanged.
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Callable, Dict, Optional

__all__ = [
    "Priority",
    "LLMTask",
    "LLMPriorityQueue",
    "get_llm_queue",
    "stop_llm_queue",
]

# Priority levels (lower number = higher priority)
class Priority(IntEnum):
    URGENT = 0  # For send_message calls
    HIGH = 1  # For interactive operations
    NORMAL = 2  # For batch operations
    LOW = 3  # For background tasks


@dataclass(order=True)
class LLMTask:
    priority: int
    task_id: str = field(compare=False)
    func: Callable = field(compare=False)
    args: tuple = field(compare=False, default_factory=tuple)
    kwargs: dict = field(compare=False, default_factory=dict)
    future: Future = field(compare=False, default_factory=Future)
    timestamp: float = field(default_factory=time.time, compare=False)


class LLMPriorityQueue:
    """Manages LLM calls with priority queueing using a pool of worker threads."""

    def __init__(self, max_concurrent: int = os.cpu_count()):
        self.queue: queue.PriorityQueue[LLMTask | None] = queue.PriorityQueue()
        # Dedicated queue that exclusively carries URGENT tasks so that they can always
        # be executed by a reserved worker thread.
        self.urgent_queue: queue.Queue[LLMTask | None] = queue.Queue()
        # Keep the main pool one core lower so that the reserved thread can always pick
        # up urgent work without waiting on non-urgent tasks.
        # NOTE: ``max_concurrent`` still reflects the TOTAL concurrency including the
        # urgent worker – only *max_concurrent-1* threads will process the normal
        # priority queue.

        self.max_concurrent = max_concurrent
        self.lock = threading.Lock()
        self.workers: list[threading.Thread] = []
        self.running = False
        self._task_counter = 0

    # ---------------------------------------------------------------------
    # Lifecycle management
    # ---------------------------------------------------------------------
    def start(self):
        """Start the worker threads (lazy-initialised on first call)."""
        if self.running:
            return

        self.running = True
        # ------------------------------------------------------------------
        # 1. Reserved urgent worker (always 1 thread)
        # ------------------------------------------------------------------
        urgent_thread = threading.Thread(
            target=self._urgent_worker,
            name="llm_worker_URGENT",
            daemon=True,
        )
        urgent_thread.start()
        self.workers.append(urgent_thread)

        # ------------------------------------------------------------------
        # 2. General workers (priority queue, max_concurrent - 1 threads)
        # ------------------------------------------------------------------
        general_worker_count = max(self.max_concurrent - 1, 0)
        for i in range(general_worker_count):
            t = threading.Thread(
                target=self._worker,
                name=f"llm_worker_{i}",
                daemon=True,
            )
            t.start()
            self.workers.append(t)
        logging.info(
            "LLM Priority Queue started with %s worker threads (max_concurrent=%s)",
            self.max_concurrent,
            self.max_concurrent,
        )

    def stop(self):
        """Gracefully stop all worker threads."""
        if not self.running:
            return

        self.running = False
        # ------------------------------------------------------------------
        # Signal all workers (both general and urgent) to shut down gracefully
        # ------------------------------------------------------------------
        sentinel = LLMTask(priority=int(1e9), task_id="__shutdown__", func=lambda: None)

        # 1) General workers → priority queue
        for _ in range(max(len(self.workers) - 1, 0)):
            self.queue.put(sentinel)

        # 2) Urgent worker → urgent queue (single sentinel is enough)
        self.urgent_queue.put(sentinel)

        # Wait for threads to finish
        for t in self.workers:
            t.join()
        logging.info("LLM Priority Queue stopped")

    # ------------------------------------------------------------------
    # Internal worker logic
    # ------------------------------------------------------------------
    def _worker(self):
        """Worker thread that processes tasks from the queue until stopped."""
        while True:
            task = self.queue.get()
            if getattr(task, "task_id", None) == "__shutdown__":
                # Graceful shutdown signal.
                self.queue.task_done()
                break
            self._execute_task(task)
            self.queue.task_done()

    def _urgent_worker(self):
        """Dedicated worker thread that only processes URGENT tasks."""
        while True:
            task = self.urgent_queue.get()
            if getattr(task, "task_id", None) == "__shutdown__":
                # Graceful shutdown signal.
                self.urgent_queue.task_done()
                break
            # The urgent queue should only contain URGENT priority tasks but we
            # keep the check for safety and future-proofing.
            if task.priority != Priority.URGENT:
                logging.debug("Unexpected non-urgent task encountered in urgent queue: %s", task.task_id)
            self._execute_task(task)
            self.urgent_queue.task_done()

    def _execute_task(self, task: LLMTask):
        """Execute a single task and handle its completion."""
        try:
            # Log high-priority tasks
            if task.priority <= Priority.HIGH:
                logging.info("Executing high-priority LLM task: %s", task.task_id)

            # Execute the function
            result = task.func(*task.args, **task.kwargs)
            task.future.set_result(result)
        except Exception as e:  # noqa: BLE001
            # Suppress noisy log output for expected cancellation
            if isinstance(e, RuntimeError) and str(e) == "LLM task cancelled":
                logging.info("LLM task %s was cancelled", task.task_id)
            else:
                logging.error("Error executing LLM task %s: %s", task.task_id, e)
            task.future.set_exception(e)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def submit(
        self,
        func: Callable,
        *args,
        priority: Priority = Priority.NORMAL,
        **kwargs,
    ) -> Future:
        """Submit a task to the queue with a given priority.

        Returns a ``Future`` that can be awaited for the result.
        """
        with self.lock:
            self._task_counter += 1
            task_id = f"task_{self._task_counter}_{priority.name}"

        task = LLMTask(
            priority=priority,
            task_id=task_id,
            func=func,
            args=args,
            kwargs=kwargs,
            future=Future(),
        )

        # Route the task to the appropriate queue so that URGENT tasks are always
        # handled by the dedicated urgent worker thread.
        if priority == Priority.URGENT:
            self.urgent_queue.put(task)
        else:
            self.queue.put(task)

        # Log urgent tasks
        if priority == Priority.URGENT:
            logging.info("Urgent LLM task queued: %s", task_id)

        return task.future

    def get_stats(self) -> Dict[str, Any]:
        """Get current queue statistics."""
        with self.lock:
            return {
                "queue_size": self.queue.qsize(),
                "urgent_queue_size": self.urgent_queue.qsize(),
                "worker_threads": len(self.workers),
                "max_concurrent": self.max_concurrent,
                "total_submitted": self._task_counter,
            }


# -------------------------------------------------------------------------
# Global helpers
# -------------------------------------------------------------------------

_llm_queue: Optional[LLMPriorityQueue] = None


def get_llm_queue() -> LLMPriorityQueue:
    """Get or create the global LLM priority queue."""
    global _llm_queue
    if _llm_queue is None:
        _llm_queue = LLMPriorityQueue()
        _llm_queue.start()
    return _llm_queue


def stop_llm_queue():
    """Stop the global LLM queue and clean up the singleton."""
    global _llm_queue
    if _llm_queue:
        _llm_queue.stop()
        _llm_queue = None
