# output_schemas.py
"""Context extraction related JSON response schemas for AI structured outputs.

This module defines OpenAI-compatible *response_format* dictionaries for
context extraction prompts only.
"""

from __future__ import annotations
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic models for context extraction
# ---------------------------------------------------------------------------


class PersonalInfoModel(BaseModel):
    reasoning_process: str | None = Field(
        description="Reasoning process for the extraction"
    )
    full_name: str | None = Field(description="User's full legal name")
    first_name: str | None = Field(description="Given name (first)")
    middle_names: str | None = Field(description="Middle name(s), if any")
    last_name: str | None = Field(description="Family name / surname")
    phone_number: str | None = Field(
        description="Primary contact phone number (digits, spaces, plus and dash allowed, at least 6 characters)",
    )
    email: str | None = Field(
        description="Primary contact e-mail address in a valid format (e.g., name@example.com)"
    )
    date_of_birth: str | None = Field(
        description="User's date of birth in the format DD/MM/YYYY"
    )
