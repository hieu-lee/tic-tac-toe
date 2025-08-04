"""
Checkbox processing for form filling.

This module handles detection, processing, and updating of checkboxes in forms,
including matching checkbox groups to context keys and determining which should be checked.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Literal
from .pattern_detection import CHECKBOX_PATTERN
from ..context_extraction.context_extractor import context_read, mine_context_value
from ..llm_client import query_gpt
from .output_schemas import CheckboxSelectionModel
from .prompts import (
    checkbox_context_key_prompt,
    checkbox_infer_key_prompt,
    checkbox_selection_prompt,
)


@dataclass
class CheckboxEntry:
    lines: str
    checkbox_positions: List[
        Tuple[int, int]
    ]  # (line_index, char_index) for each checkbox
    checkbox_values: List[str]  # The text options for each checkbox
    context_key: Optional[str] = None
    checked_indices: List[int] = field(
        default_factory=list
    )  # Which checkboxes should be checked


def detect_checkbox_entries(lines: List[str]) -> List[CheckboxEntry]:
    """Detect checkbox entries in the document lines."""
    entries: List[CheckboxEntry] = []

    # Find lines with checkboxes
    checkbox_lines = []
    for i, line in enumerate(lines):
        if CHECKBOX_PATTERN.search(line):
            checkbox_lines.append(i)

    if not checkbox_lines:
        return entries

    # Group contiguous checkbox lines (within window of 5)
    groups = []
    current = [checkbox_lines[0]]
    for idx in checkbox_lines[1:]:
        if (
            idx - current[-1] <= 1 and len(current) < 5
        ):  # Allow up to 1 line gap, max 3 lines total
            current.append(idx)
        else:
            groups.append(current)
            current = [idx]
    groups.append(current)

    # Process each group
    for group in groups:
        # Get context lines (include at least 3 line before and after if available)
        start_idx = max(0, group[0] - 3)
        end_idx = min(len(lines), group[-1] + 3)
        context_lines = lines[start_idx:end_idx]
        context_text = "\n".join(context_lines)

        # Find all checkboxes and their positions within the group
        checkbox_positions = []
        checkbox_values = []

        for line_idx in group:
            line = lines[line_idx]
            relative_line_idx = line_idx - start_idx  # Position within context_lines

            # Find checkboxes in this line
            matches = list(CHECKBOX_PATTERN.finditer(line))
            if not matches:
                continue
            # Build text segments between successive checkboxes (including start / end of line)
            segments: List[str] = []
            prev_end = 0
            for m in matches:
                segments.append(line[prev_end : m.start()])
                prev_end = m.end()
            segments.append(line[prev_end:])  # tail after last checkbox

            for idx, m in enumerate(matches):
                char_idx = m.start()
                checkbox_positions.append((relative_line_idx, char_idx))

                option_before = segments[idx].strip()
                option_after = segments[idx + 1].strip() if idx + 1 < len(segments) else ""

                # Prefer the text AFTER the checkbox. If none, use the text BEFORE.
                checkbox_text = option_after if option_after else option_before

                checkbox_values.append(checkbox_text)

        if checkbox_positions:
            entries.append(
                CheckboxEntry(
                    lines=context_text,
                    checkbox_positions=checkbox_positions,
                    checkbox_values=checkbox_values,
                )
            )

    return entries


def process_checkbox_entries(
    entries: List[CheckboxEntry],
    context_dir: str,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
) -> List[CheckboxEntry]:
    """Process checkbox entries by matching them to context keys and determining which should be checked."""
    context_data = context_read(context_dir)
    keys = list(context_data.keys())
    text_corpus_chunks = None
    img_corpus_chunks = None

    for entry in entries:
        logging.debug("\n--- Processing CheckboxEntry ---")
        logging.debug(
            "Checkbox block lines (truncated): %s",
            entry.lines[:120].replace("\n", " | "),
        )
        logging.debug("Checkbox option values: %s", entry.checkbox_values)
        # Ask LLM to match this checkbox group to a context key
        prompt = checkbox_context_key_prompt(keys, entry.lines, entry.checkbox_values)

        response = query_gpt(prompt, provider=provider).strip().strip('"').lower()

        if response == "none" or response not in keys:
            # Try to infer a new context key
            infer_prompt = checkbox_infer_key_prompt(entry.lines, entry.checkbox_values)

            inferred_key = (
                query_gpt(infer_prompt, provider=provider).strip().strip('"').lower()
            )

            # Check if we have a value for this key in context_data
            context_value = context_data.get(inferred_key, "")
            if not context_value:
                # Try to extract this information from context files
                logging.info(
                    f"Attempting to extract value for inferred key: {inferred_key}"
                )
                # This will use the existing context extraction logic
                _, text_corpus_chunks, img_corpus_chunks, context_data = mine_context_value(inferred_key, context_dir, provider, text_corpus_chunks, img_corpus_chunks, context_data)
                context_value = context_data.get(inferred_key, "")

            if context_value:
                entry.context_key = inferred_key
            else:
                logging.info(
                    f"No value found for checkbox group, skipping: {entry.lines[:50]}..."
                )
                continue
        else:
            entry.context_key = response
            context_value = context_data.get(response, "")

        logging.debug(
            "Determined context_key='%s' context_value='%s'",
            entry.context_key,
            context_value,
        )

        # Now determine which checkboxes should be checked based on the context value
        if entry.context_key and context_value:
            selection_prompt = checkbox_selection_prompt(
                entry.context_key, context_value, entry.checkbox_values
            )

            # Try parsing with retry logic
            max_tries = 3
            parsed_indices = None

            for try_count in range(max_tries):
                if try_count == 0:
                    response = query_gpt(
                        selection_prompt,
                        provider=provider,
                        response_format=CheckboxSelectionModel,
                    )
                else:
                    retry_prompt = (
                        f"IMPORTANT: Your previous response could not be parsed as JSON. Please respond with EXACTLY the format requested.\n\n"
                        f"{selection_prompt}\n\n"
                        f"CRITICAL FORMATTING REQUIREMENTS:\n"
                        f"1. Respond with ONLY a JSON array of numbers, nothing else\n"
                        f"2. Use square brackets [ ]\n"
                        f"3. Use integers for indices (0, 1, 2, etc.)\n"
                        f"4. Separate multiple indices with commas\n"
                        f"5. Do not include any explanations or code blocks\n\n"
                        f"Example of correct format: [0] or [1, 2] or []\n"
                        f"Your response:"
                    )
                    response = query_gpt(
                        retry_prompt,
                        provider=provider,
                        response_format=CheckboxSelectionModel,
                    )

                try:
                    entry.checked_indices = [
                        i
                        for i in CheckboxSelectionModel.model_validate_json(
                            response
                        ).indices
                        if 0 <= i < len(entry.checkbox_values)
                    ]
                except Exception as e:
                    logging.warning(
                        f"Attempt {try_count + 1} failed to parse checkbox indices. Response: '{response}', Error: {e}"
                    )
                    if try_count == max_tries - 1:
                        logging.error(
                            f"All {max_tries} attempts failed to parse checkbox indices. Skipping checkbox group."
                        )
                        entry.checked_indices = []

    return entries


def update_checkbox(pattern, should_check: bool):
    new_text = ""
    # Determine the replacement based on should_check
    if should_check:
        if pattern in ["[ ]", "[]"]:
            new_text = "[X]"
        elif pattern in ["( )", "()"]:
            new_text = "(X)"
        elif pattern == "☐":
            new_text = "☑"
        elif pattern == "□":
            new_text = "■"
        elif pattern in ["○", "◯"]:
            new_text = "●"
        else:
            new_text = pattern  # Already checked
    else:
        if pattern in ["[X]", "[x]"]:
            new_text = "[ ]"
        elif pattern in ["(X)", "(x)"]:
            new_text = "( )"
        elif pattern in ["☑", "☒"]:
            new_text = "☐"
        elif pattern == "■":
            new_text = "□"
        elif pattern in ["○", "◯"]:
            new_text = "○"
        else:
            new_text = pattern  # Already unchecked

    return new_text


def update_checkbox_in_paragraph(entry: CheckboxEntry) -> str:
    """Replace all checkbox patterns in ``entry.lines`` with their checked/unchecked
    counterparts based on *entry.checked_indices*.

    The first checkbox found in the text corresponds to index ``0``, the second to
    index ``1`` and so on.  Supported patterns mirror those handled by
    :pyfunc:`update_checkbox`.
    """

    # Matches all variants handled by ``update_checkbox``
    checkbox_regex = re.compile(r"\[[ Xx]?\]|\([ Xx]?\)|[☐☑☒□■○◯●]")

    current_index = 0

    def _replacer(match: re.Match) -> str:
        nonlocal current_index
        original = match.group(0)
        should_check = current_index in entry.checked_indices
        current_index += 1
        return update_checkbox(original, should_check)

    updated_text = checkbox_regex.sub(_replacer, entry.lines)

    # Persist the modifications back to the dataclass for downstream callers
    entry.lines = updated_text

    return updated_text
