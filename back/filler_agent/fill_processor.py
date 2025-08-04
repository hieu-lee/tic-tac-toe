"""
Fill entry processing for form filling.

This module handles detection and processing of fill entries (placeholder fields)
in forms, including context key inference and value filling.
"""

import os
import re
import json
import logging
from typing import Literal
from dataclasses import dataclass
from typing import List, Optional
from ..context_extraction.context_extractor import (
    context_read,
    mine_context_value,
)
from ..llm_client import query_gpt
from .output_schemas import FillEntryKeyModel
from .prompts import missing_key_inference_prompt

# -------------------------------------------------------
# Helper for debugging/analysis – log every LLM prompt
# -------------------------------------------------------


def log_prompt(prompt: str, file_path: str = "prompts.txt") -> None:
    """Append *prompt* to *file_path* separated by a divider for readability."""
    try:
        with open(file_path, "a", encoding="utf-8") as _f:
            _f.write(prompt.rstrip("\n") + "\n" + ("-" * 80) + "\n")
    except Exception as _e:
        logging.error("Failed to log prompt to %s: %s", file_path, _e)


@dataclass
class FillEntry:
    lines: str
    number_of_fill_spots: int
    context_keys: List[Optional[str]]
    filled_lines: str = ""


def detect_fill_entries(
    lines: List[str],
    placeholder_pattern: re.Pattern,
) -> List[FillEntry]:
    """Detect fill entries in the document lines."""
    entries: List[FillEntry] = []
    # Find indices with placeholders
    indices = [i for i, l in enumerate(lines) if placeholder_pattern.search(l)]
    # Group contiguous lines within window of 3
    groups = []
    if indices:
        indices.sort()
        for i in indices:
            start = max(i - 1, 0)
            end = min(i + 1, len(lines) - 1)
            match = placeholder_pattern.search(lines[i])
            match_starts_at_0 = match is not None and match.start() == 0
            if (not groups or groups[-1][-1] < start) and not match_starts_at_0:
                new_group = list(range(start, end + 1))
                groups.append(new_group)
            elif groups and groups[-1][-1] < end:
                new_group = list(range(groups[-1][-1] + 1, end + 1))
                groups[-1].extend(new_group)
    # For each group, analyse the placeholders one-by-one to assign context keys
    for group in groups:
        entry_lines = "\n".join(lines[i] for i in group)
        num_spots = len(placeholder_pattern.findall(entry_lines))

        context_keys: List[Optional[str]] = [None] * num_spots

        entries.append(
            FillEntry(
                lines=entry_lines,
                number_of_fill_spots=num_spots,
                context_keys=context_keys,
            )
        )
    return entries


def process_fill_entries(
    entries: List[FillEntry],
    context_dir: str,
    form_path: str | None,
    placeholder_pattern: re.Pattern,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
) -> List[FillEntry]:
    """Process fill entries by inferring missing context keys and filling values."""
    # Load or extract context data
    context_path = os.path.join(context_dir, "context_data.json")
    if os.path.exists(context_path):
        with open(context_path, "r", encoding="utf-8") as f:
            context_data = json.load(f)
    else:
        context_data = context_read(context_dir)
    missing_keys = []
    text_corpus_chunks: Optional[List[str]] = None
    img_corpus_chunks: Optional[List[str]] = None
    for entry in entries:
        logging.debug("\n--- Processing FillEntry ---")
        logging.debug("Original entry lines:\n%s", entry.lines)
        logging.debug("Initial context key guesses: %s", entry.context_keys)
        # Keep a working copy of the entry text that we progressively fill
        partial_filled = entry.lines

        # Iterate through placeholders sequentially (global order)
        total_placeholders = len(entry.context_keys)
        search_pos = 0  # position to start the next search in partial_filled

        for idx in range(total_placeholders):
            # Locate next placeholder occurrence from current position
            match = placeholder_pattern.search(partial_filled, search_pos)
            if not match:
                break  # safety – should not happen

            # Determine line context and index on that line
            before_match = partial_filled[: match.start()]
            line_start = before_match.rfind("\n") + 1  # -1 becomes 0 so +1
            line_end = partial_filled.find("\n", match.start())
            if line_end == -1:
                line_end = len(partial_filled)
            line_text = partial_filled[line_start:line_end]
            # If the placeholder is at the beginning of the line (after strip), also get the previous line
            if line_text.strip().startswith(
                partial_filled[match.start() : match.end()]
            ):
                # Get the previous line if it exists
                prev_line_start = (
                    before_match[: line_start - 1].rfind("\n") + 1
                    if line_start > 0
                    else 0
                )
                prev_line_end = line_start - 1 if line_start > 0 else 0
                previous_line = (
                    partial_filled[prev_line_start:prev_line_end].strip()
                    if prev_line_end > prev_line_start
                    else ""
                )
            else:
                previous_line = ""

            # Count placeholders before this one on the same line
            prefix_line = previous_line + line_text[: match.start() - line_start]
            idx_on_placeholder_context = len(
                list(placeholder_pattern.findall(prefix_line))
            )

            key = entry.context_keys[idx]

            # Helper to replace this specific placeholder with a value
            def _replace_current_placeholder(text: str, replacement: str) -> str:
                """Replace current match span in *text* with *replacement* and return new text."""
                return text[: match.start()] + replacement + text[match.end() :]

            value: str = ""
            if key and key != "null":
                value = context_data.get(key, "")

            if value:  # We have a value, replace directly
                logging.debug(
                    "Replacing placeholder %s with key '%s' value '%s'", idx, key, value
                )
                partial_filled = _replace_current_placeholder(partial_filled, value)
                search_pos = match.start() + len(value)  # continue after inserted value
                continue  # move to next placeholder

            # Key missing or has no value – need to infer
            placeholder_context = previous_line + "\n" + line_text
            placeholder_context = placeholder_context.strip()

            prompt = missing_key_inference_prompt(
                partial_filled,
                placeholder_context,
                idx_on_placeholder_context,
                placeholder_pattern.pattern,
                context_data,
            )

            # Log the prompt used for missing-key inference
            # log_prompt(prompt)

            response = query_gpt(
                prompt,
                provider=provider,
                cancel_id=form_path if form_path else context_dir,
                response_format=FillEntryKeyModel,
            )

            new_key = FillEntryKeyModel.model_validate_json(response).key
            new_key = new_key.strip().strip('"').replace(" ", "_")

            # Retrieve or mine value for new_key
            value = context_data.get(new_key, "")
            if not value:
                value, text_corpus_chunks, img_corpus_chunks, context_data = (
                    mine_context_value(
                        new_key,
                        context_dir,
                        provider,
                        text_corpus_chunks,
                        img_corpus_chunks,
                        context_data,
                    )
                )

            # Record key mapping
            if new_key and entry.context_keys[idx] is None:
                entry.context_keys[idx] = new_key
            if not value:
                missing_keys.append(new_key)
                logging.info(
                    "Missing value for inferred key '%s' (placeholder %s)", new_key, idx
                )

            # Replace if we have a value
            if value:
                partial_filled = _replace_current_placeholder(partial_filled, value)
                search_pos = match.start() + len(value)
            else:
                # Skip this placeholder – move past it
                search_pos = match.end()

        # Store the final filled text for this entry
        entry.filled_lines = partial_filled

        logging.debug("Filled entry lines:\n%s", entry.filled_lines)

    if missing_keys:
        logging.info("Total missing keys after processing: %s", list(set(missing_keys)))
    # Write the entries in entries.txt with better formatting
    try:
        with open("entries.txt", "w", encoding="utf-8") as f:
            for idx, entry in enumerate(entries, 1):
                f.write(f"Entry {idx}:\n")
                f.write("Lines:\n")
                f.write(entry.lines.strip() + "\n")
                f.write(f"Number of fill spots: {entry.number_of_fill_spots}\n")
                f.write(f"Context keys: {entry.context_keys}\n")
                f.write("Filled lines:\n")
                f.write(entry.filled_lines.strip() + "\n")
                f.write("-" * 60 + "\n\n")
    except Exception as e:
        logging.error(f"Failed to write entries to entries.txt: {e}")
    return entries, missing_keys
