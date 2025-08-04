"""filler_agent package."""

# Import and expose the main functionality from the filler_agent subpackage
from .filler_agent.form_filler import fill_in_form
from .filler_agent.fill_processor import FillEntry
from .filler_agent.checkbox_processor import CheckboxEntry
from .filler_agent.pattern_detection import (
    DEFAULT_PLACEHOLDER_PATTERN,
    CHECKBOX_PATTERN,
    detect_placeholder_patterns,
)
from .filler_agent.text_utils import extract_form_text
from .filler_agent.text_utils import sanitize_unicode_for_pdf
from .filler_agent.font_manager import (
    normalize_font_name,
    get_fonts_cache_dir,
    download_font_from_google_fonts,
    get_available_font,
)
from .context_extraction.context_extractor import extract_context

__all__ = [
    "fill_in_form",
    "FillEntry",
    "CheckboxEntry",
    "DEFAULT_PLACEHOLDER_PATTERN",
    "CHECKBOX_PATTERN",
    "detect_placeholder_patterns",
    "extract_form_text",
    "sanitize_unicode_for_pdf",
    "normalize_font_name",
    "get_fonts_cache_dir",
    "download_font_from_google_fonts",
    "get_available_font",
    "extract_context",
]
