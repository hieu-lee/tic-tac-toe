from __future__ import annotations

"""Simple cancellation registry for form processing tasks.

The frontend can request to *cancel* any ongoing processing for a particular
``form_path`` via the `/form/cancel` endpoint.  All backend endpoints that do
significant work on a form should call :pyfunc:`is_cancelled` **at the very
start** and abort early if cancellation has been requested.

At the moment this is implemented as an in-memory set protected by a thread
lock.  This is sufficient because the current FastAPI application runs inside
one Python process.  If the backend gets distributed across multiple worker
processes in the future, this logic should be replaced with a process-shared
store (e.g. Redis, database or file lock).
"""

import os
import threading
from typing import Set

__all__ = [
    "cancel",
    "is_cancelled",
    "clear",
    "list_cancelled",
]

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_cancelled: Set[str] = set()
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _normalise(path: str) -> str:
    """Return *path* resolved to an absolute, normalised form.

    This makes cancellation look-ups robust against different path spellings
    (relative vs absolute, symbolic links, redundant "./", …).
    """
    return os.path.abspath(os.path.expanduser(path))


def cancel(form_path: str) -> None:
    """Mark *form_path* as cancelled so future work aborts early."""
    norm = _normalise(form_path)
    with _lock:
        _cancelled.add(norm)


def is_cancelled(form_path: str) -> bool:
    """Return *True* if *form_path* has been cancelled by the client."""
    norm = _normalise(form_path)
    with _lock:
        return norm in _cancelled


def clear(form_path: str) -> None:
    """Remove *form_path* from the cancelled list (e.g. when work finishes)."""
    norm = _normalise(form_path)
    with _lock:
        _cancelled.discard(norm)


def list_cancelled() -> list[str]:
    """Return a list of all currently cancelled form paths (debug helper)."""
    with _lock:
        return list(_cancelled)
