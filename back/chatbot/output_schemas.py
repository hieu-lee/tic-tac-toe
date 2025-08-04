from __future__ import annotations

"""Structured output schemas for EasyForm chatbot prompt analysis.

This module defines strict JSON schemas (Pydantic BaseModels) that are used
with ``llm_client.query_gpt`` to ensure the LLM returns machine-readable
outputs for

1. Classifying a user prompt into one of three categories (query, update, other)
2. Identifying the relevant context key the user refers to
3. Extracting the key *and* value when the user supplies new information
"""

from enum import Enum
from pydantic import BaseModel, Field

__all__ = [
    "PromptType",
    "PromptTypeModel",
    "KeyModel",
    "KeyValueModel",
]


class PromptType(str, Enum):
    """Enumeration of supported user intent types."""

    QUERY_VALUE = "QUERY_VALUE"  # User asks about exactly one personal info field
    UPDATE_VALUE = "UPDATE_VALUE"  # User provides exactly one new personal info piece
    TRANSLATE = "TRANSLATE"  # User requests document translation to a target language
    OTHER = "OTHER"  # Anything else


class PromptTypeModel(BaseModel):
    """Model for the *first* LLM call – just the prompt classification."""

    prompt_type: PromptType = Field(
        description="One of QUERY_VALUE, UPDATE_VALUE, OTHER identifying the user's intent.",
    )


class KeyModel(BaseModel):
    """Model for the *second* LLM call when we only need the key name."""

    key: str = Field(description="Context key relevant to the user's prompt.")


class KeyValueModel(BaseModel):
    """Model for the *second* LLM call for UPDATE_VALUE prompts."""

    key: str = Field(
        description="Context key whose value should be updated (new or existing)."
    )
    value: str = Field(description="The new value the user supplied for this key.")
