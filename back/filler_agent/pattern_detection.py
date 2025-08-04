"""
Pattern detection utilities for form filling.

This module handles detection of placeholder patterns in forms using LLM-based
analysis and provides regex patterns for various form elements.
"""

import re
import logging

# Default fallback pattern - will be replaced by dynamic detection
DEFAULT_PLACEHOLDER_PATTERN = re.compile(r"_+")
CHECKBOX_PATTERN = re.compile(r"[\[\(][\sXx]?[\]\)]|[☐☑☒□■]")
NON_PLACEHOLDER_CHARS = list(
    "1234567890asdfghjklqwertyuiopzxcvbnmASDFGHJKLQWERTYUIOPZXCVBNM\"'*()[]<>&^%?!@#;☐☑☒□■"
)
WHITE_SPACES = list(" \n\t\u200b")


def _get_placeholders(text: str) -> list[str]:
    after_colon = False
    placeholders = set()
    current_placeholder = []
    prev_char = None
    for i, current_char in enumerate(text):
        if not after_colon:
            if current_char == ":":
                after_colon = True
                if current_placeholder:
                    placeholders.add("".join(current_placeholder))
                    current_placeholder = []
                prev_char = current_char
                continue
            if (
                prev_char is not None
                and prev_char not in NON_PLACEHOLDER_CHARS
                and prev_char not in WHITE_SPACES
                and prev_char == current_char
            ):
                if current_placeholder:
                    current_placeholder.append(current_char)
                else:
                    current_placeholder.extend([prev_char, current_char])
            else:
                if current_placeholder:
                    placeholders.add("".join(current_placeholder))
                    current_placeholder = []
        else:
            if current_char in NON_PLACEHOLDER_CHARS:
                after_colon = False
                if current_placeholder:
                    placeholders.add("".join(current_placeholder))
                    current_placeholder = []
                prev_char = current_char
                continue
            elif current_char in WHITE_SPACES:
                if current_placeholder:
                    after_colon = False
                    placeholders.add("".join(current_placeholder))
                    current_placeholder = []
                    prev_char = current_char
                    continue
            else:
                current_placeholder.append(current_char)

        prev_char = current_char
    if current_placeholder:
        placeholders.add("".join(current_placeholder))
    return list(placeholders)


def detect_placeholder_patterns(
    form_text: str,
    is_interactive: bool,
) -> re.Pattern:

    # Create regex patterns from the actual placeholder strings
    valid_patterns = []
    if is_interactive:
        valid_patterns.append(r"_______")
    else:
        for placeholder in _get_placeholders(form_text):
            if placeholder.strip():  # Skip empty strings
                # Escape special regex characters in the placeholder string
                escaped_placeholder = re.escape(placeholder)
                valid_patterns.append(escaped_placeholder)
                logging.debug(
                    f"Added pattern for placeholder '{placeholder}': {escaped_placeholder}"
                )

    if not valid_patterns:
        logging.warning(
            "No valid placeholder patterns found, using default underscore pattern"
        )
        return DEFAULT_PLACEHOLDER_PATTERN

    # Sort patterns by descending length so longer placeholders are matched before shorter ones
    valid_patterns.sort(key=len, reverse=True)

    # Combine patterns with OR operator
    combined_pattern = "|".join(f"({pattern})" for pattern in valid_patterns)

    try:
        compiled_pattern = re.compile(combined_pattern)
        logging.info(
            f"Created dynamic placeholder pattern from {len(valid_patterns)} placeholders: {combined_pattern}"
        )
        return compiled_pattern
    except re.error as e:
        logging.error(f"Failed to compile combined pattern '{combined_pattern}': {e}")
        logging.info("Falling back to default underscore pattern")
        return DEFAULT_PLACEHOLDER_PATTERN
