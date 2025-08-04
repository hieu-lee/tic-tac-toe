"""
PDF form filling functionality.

This module handles filling of PDF forms, including both interactive forms
and flat PDF text overlay filling.
"""

import logging
from pathlib import Path
import re
from typing import List, Optional, Literal

from pypdf import PdfReader
import fitz

from .fill_processor import (
    detect_fill_entries,
    process_fill_entries,
    FillEntry,
)
from .checkbox_processor import (
    detect_checkbox_entries,
    process_checkbox_entries,
    update_checkbox_in_paragraph,
)

from .text_utils import (
    extract_text_with_fields_as_underscores,
    replace_text_preserve_layout_pdf,
)
from ..context_extraction.context_extractor import context_read
from .checkbox_processor import CheckboxEntry


def fill_pdf(
    form_path: str,
    context_dir: str,
    output_path: Optional[str],
    placeholder_pattern,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
) -> str:
    """
    Fill an interactive PDF form by mapping context_data keys to field names.
    If no AcroForm is present, fall back to flat PDF filling.
    """

    reader = PdfReader(form_path)
    # If the PDF contains interactive form fields, prefer the advanced filling
    if reader.get_fields():
        return fill_interactive_pdf(
            form_path,
            context_dir,
            output_path,
            provider,
        )

    # No interactive fields → treat as flat PDF
    else:
        logging.info(
            f"Interactive PDF handling failed or not applicable falling back to flat PDF fill."
        )
        return fill_flat_pdf(
            form_path, context_dir, output_path, placeholder_pattern, provider
        )


def fill_flat_pdf(
    form_path: str,
    context_dir: str,
    output_path: Optional[str],
    placeholder_pattern,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
) -> str:
    """Fill placeholders in a flat PDF using `replace_text_preserve_layout`.

    1. Extract all text lines from the PDF.
    2. Detect placeholder entries and compute their filled values.
    3. Sequentially run `replace_text_preserve_layout` for each individual
       placeholder → replacement pair, chaining the intermediate PDF path so
       that each subsequent replacement operates on the latest file version.
    """

    # ------------------------------------------------------------------
    # 1. Extract raw text lines from the PDF (for placeholder detection)
    # ------------------------------------------------------------------
    # Collect positional info to later sort lines in natural order
    collected: list[tuple[int, float, float, str]] = []  # (page_idx, y0, x0, text)
    with fitz.open(form_path) as doc:
        for page in doc:
            text_dict = page.get_text("dict")
            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    if not spans:
                        continue

                    bbox = spans[0].get("bbox", [0, 0, 0, 0])
                    y0, x0 = bbox[1], bbox[0]
                    text_line = "".join(span.get("text", "") for span in spans)
                    collected.append((page.number, y0, x0, text_line))

        # Sort lines for this page before moving to next to preserve performance, but we will
        # ultimately sort all pages together anyway. This ensures consistency if someone
        # refactors to process pages out of order.

    # Global sort across all pages: page index, then y, then x
    collected.sort(key=lambda t: (t[0], t[1], t[2]))

    lines: List[str] = [t[3] for t in collected]

    # ------------------------------------------------------------------
    # 2. Detect and fill placeholder entries via LLM processing utilities
    # ------------------------------------------------------------------
    entries = detect_fill_entries(lines, placeholder_pattern)
    entries, _ = process_fill_entries(
        entries, context_dir, form_path, placeholder_pattern, provider
    )

    checkboxes = detect_checkbox_entries(lines)
    checkboxes = process_checkbox_entries(checkboxes, context_dir, provider)

    return fill_flat_pdf_with_entries(entries, checkboxes, form_path, output_path)


def fill_interactive_pdf(
    form_path: str,
    context_dir: str,
    output_path: Optional[str],
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
) -> str:
    """
    Alternative method to fill interactive PDF forms using text extraction and field matching.

    This method:
    1. Extracts text with fields replaced by underscores
    2. Detects placeholder patterns
    3. Processes fill entries to get context keys
    4. Matches fields by flags and names to set values

    Parameters
    ----------
    form_path : str
        Path to the PDF form to fill
    context_dir : str
        Directory containing context data
    output_path : Optional[str]
        Output path for filled PDF. If None, uses form_path with "_filled" suffix
    provider : Literal
        LLM provider to use for processing

    Returns
    -------
    str
        Path to the filled PDF
    """
    # Step 1: Extract text with fields as underscores and get field info
    text, _ = extract_text_with_fields_as_underscores(form_path)

    # Step 2: Detect placeholder patterns
    pattern = re.compile(r"_______")

    # Step 3: Detect fill entries
    entries = detect_fill_entries(text.splitlines(), pattern)

    # Step 4: Process fill entries to infer context keys
    entries, _ = process_fill_entries(entries, context_dir, form_path, pattern, provider)

    return fill_interactive_pdf_with_entries(
        entries, form_path, context_dir, output_path
    )


def fill_interactive_pdf_with_entries(
    fill_entries: List[FillEntry],
    form_path: str,
    context_dir: str,
    output_path: Optional[str],
) -> str:
    """
    Fill an interactive PDF form using pre-computed FillEntry lists.

    Parameters
    ----------
    form_path : str
        Path to the PDF form to fill
    context_dir : str
        Directory containing context data
    output_path : Optional[str]
        Output path for filled PDF. If None, uses form_path with "_filled" suffix

    Returns
    -------
    str
        Path to the filled PDF
    """
    _, field_info = extract_text_with_fields_as_underscores(form_path)

    context_data = context_read(context_dir)

    field_name_to_value = {}
    field_name_to_key = {}

    index_offset = 0
    for entry in fill_entries:
        for i, key in enumerate(entry.context_keys):
            if key is not None and key != "null":
                value = context_data.get(key, None)
                field_name = field_info[i + index_offset][1]
                field_name_to_key[field_name] = key
                if value:
                    field_name_to_value[field_name] = value
                    logging.debug(
                        f"Mapped field '{field_name}' to value from key '{key}': '{value}'"
                    )
        index_offset += len(entry.context_keys)

    doc = fitz.open(form_path)
    try:
        filled_count = 0
        total_fields = 0

        # Iterate through all pages and widgets
        for page_num, page in enumerate(doc):
            # Reload page to ensure fresh widget references
            page = doc.reload_page(page)

            for widget in page.widgets():
                if widget.field_type == fitz.PDF_WIDGET_TYPE_TEXT:
                    total_fields += 1

                    # Look up value by field name
                    if widget.field_name in field_name_to_value:
                        value = field_name_to_value[widget.field_name]
                        try:
                            widget.field_value = str(value)
                            widget.field_label = field_name_to_key[widget.field_name]
                            widget.update()
                            filled_count += 1
                            logging.info(
                                f"Set field '{widget.field_name}' to '{value}'"
                            )
                            logging.info(
                                f"Set field label to '{widget.field_label}'"
                            )
                        except Exception as e:
                            logging.warning(
                                f"Failed to set value for widget {widget.field_name} "
                                f"on page {page_num}: {e}"
                            )
                    else:
                        logging.debug(f"No value found for field '{widget.field_name}'")

        # Log summary
        logging.info(
            f"Processed {total_fields} text fields, "
            f"filled {filled_count} fields with values"
        )

        # Save the filled PDF
        out_path = output_path or form_path.replace(".pdf", "_filled.pdf")
        doc.save(out_path, clean=True)
        return out_path

    finally:
        doc.close()


def fill_pdf_with_entries(
    fill_entries: List[FillEntry],
    checkbox_entries: List[CheckboxEntry],
    form_path: str,
    output_path: Optional[str] = None,
    *,
    context_dir: Optional[str] = None,
) -> str:
    """Fill a PDF (interactive or flat) using pre-computed FillEntry / CheckboxEntry lists.

    Workflow:
    • If the PDF contains interactive text fields, fill them sequentially using *fill_entries* and
      *context_data* (when available).
    • Otherwise revert to flat-PDF overlay replacement.

    Note: *checkbox_entries* are currently **ignored** for interactive PDFs until overlay logic is available.
    """

    # Quick check for interactive fields
    try:
        reader = PdfReader(form_path)
        if reader.get_fields():
            return fill_interactive_pdf_with_entries(
                fill_entries,
                form_path,
                context_dir,
                output_path,
            )
    except Exception as e:
        logging.debug(
            f"Interactive field detection failed ({e}); falling back to flat overlay."
        )

    # Fallback to flat overlay replacement
    return fill_flat_pdf_with_entries(
        fill_entries, checkbox_entries, form_path, output_path
    )


def fill_flat_pdf_with_entries(
    fill_entries: List[FillEntry],
    checkbox_entries: List[CheckboxEntry],
    form_path: str,
    output_path: Optional[str],
) -> str:
    """Replace all placeholders in *fill_entries* in a flat PDF using
    `replace_text_preserve_layout` line-by-line.
    """

    if not output_path:
        output_path = form_path.replace(".pdf", "_filled.pdf")

    form_path_p = Path(form_path)
    temp_path = form_path_p.with_stem(form_path_p.stem + "_temp").with_suffix(".pdf")

    s1_lines = []
    s2_lines = []

    for entry in fill_entries:
        s1_lines.extend(entry.lines.splitlines())
        s2_lines.extend(entry.filled_lines.splitlines())

    current_path = form_path

    if fill_entries:
        after_fill_path = str(temp_path) if checkbox_entries else output_path

        replace_text_preserve_layout_pdf(
            current_path, s1_lines, s2_lines, out_path=after_fill_path
        )

        current_path = after_fill_path

    if checkbox_entries:
        s1_lines = []
        s2_lines = []
        for entry in checkbox_entries:
            s1_lines.extend(entry.lines.splitlines())
            s2_lines.extend(update_checkbox_in_paragraph(entry).splitlines())

        replace_text_preserve_layout_pdf(
            current_path,
            s1_lines,
            s2_lines,
            out_path=output_path,
        )

    # Clean up temporary file if it exists
    if temp_path.exists():
        try:
            temp_path.unlink()
        except Exception as e:
            logging.warning(f"Failed to delete temporary file {temp_path}: {e}")

    return output_path


def save_interactive_pdf(
    form_path: str,
    widgets: List[fitz.Widget],
) -> str:
    """
    Update widgets in an existing interactive PDF and save it in place.

    Parameters
    ----------
    form_path : str
        Path to the interactive PDF that should be updated.
    widgets : List[fitz.Widget]
        A list of widgets whose current state (value, label, etc.) should be
        copied into the PDF. Matching is done by ``field_name``.

    Returns
    -------
    str
        The path to the updated PDF (same as ``form_path``).
    """

    widget_by_name = {
        w.field_name: w
        for w in widgets
        if getattr(w, "field_name", None) is not None
    }

    doc = fitz.open(form_path)
    try:
        updated = 0
        for page_index, page in enumerate(doc):
            page = doc.reload_page(page)
            for widget in page.widgets():
                wname = widget.field_name
                if wname in widget_by_name:
                    source_widget = widget_by_name[wname]

                    # Copy writable attributes that start with 'field_' (except 'field_name')
                    for attr in dir(source_widget):
                        if (
                            attr.startswith("field_")
                            and attr != "field_name"
                            and hasattr(widget, attr)
                        ):
                            try:
                                setattr(widget, attr, getattr(source_widget, attr))
                            except Exception as e:
                                logging.debug(
                                    f"Failed to copy attribute {attr} for widget {wname}: {e}"
                                )

                    try:
                        widget.update()
                        updated += 1
                    except Exception as e:
                        logging.warning(
                            f"Failed to update widget {wname} on page {page_index}: {e}"
                        )

        # Save changes in place
        doc.save(form_path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
        logging.info(f"Updated {updated} widgets and saved PDF to {form_path}")
        return form_path
    finally:
        doc.close()
