# output_schemas.py
"""Form-filling related JSON response schemas for AI structured outputs.

This module defines OpenAI-compatible *response_format* dictionaries for
all form-filling prompts that expect strictly-structured JSON replies.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic models for form-filling
# ---------------------------------------------------------------------------


class FillEntryKeyModel(BaseModel):
    """Model representing a *single* context key suggestion for one placeholder."""

    reasoning_process: str | None = Field(
        description="Reasoning process for the key suggestion"
    )
    key: str | None = Field(
        description="Context key name that should fill this placeholder (null if none applies)",
    )


class CheckboxSelectionModel(BaseModel):
    reasoning_process: str | None = Field(
        description="Reasoning process for the checkbox selection"
    )
    indices: list[int] = Field(
        default_factory=list,
        description="Indices (0-based) of checkboxes that should be checked",
    )


# Keep example echo schema for testing purposes
class ExampleEchoModel(BaseModel):
    message: str
