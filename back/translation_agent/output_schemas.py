from pydantic import BaseModel, Field


class MarkdownTranslationModel(BaseModel):
    """Schema enforcing that the LLM returns *only* the translated markdown.

    The assistant **must** produce **exactly** one JSON object with a single key
    ``markdown`` whose value is the translated Markdown string.  Any additional
    keys, comments, markdown formatting, or code-fence wrappers will cause strict
    validation to fail.
    """

    markdown: str = Field(
        ..., description="The translated document in Markdown format."
    )

    # Model config to forbid extra keys ensuring strict schema compliance
    class Config:
        extra = "forbid"


class ParagraphTranslationModel(BaseModel):
    """Schema for translating a single paragraph.

    The LLM must return JSON with a single key ``text`` that is the translated
    paragraph string – no extra keys.
    """

    text: str = Field(..., description="The translated paragraph text.")

    class Config:
        extra = "forbid"
