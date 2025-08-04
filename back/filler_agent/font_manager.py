"""
Font management utilities for form filling.

This module handles font normalization, downloading fonts from Google Fonts,
and resolving available fonts with fallback chains.
"""

import os
import re
import logging
import requests
import urllib.parse
from typing import Optional, Tuple


def normalize_font_name(font_name: str) -> str:
    """
    Normalize font names to handle common variations.
    """
    if not font_name:
        return font_name

    # Common font name mappings
    font_mappings = {
        "times new roman": "Times New Roman",
        "times": "Times New Roman",
        "arial": "Arial",
        "helvetica": "Arial",  # Arial is very similar to Helvetica
        "calibri": "Calibri",
        "georgia": "Georgia",
        "verdana": "Verdana",
        "tahoma": "Tahoma",
        "courier new": "Courier New",
        "courier": "Courier New",
        # Latin Modern fonts to standard equivalents
        "lmroman10-regular": "Times New Roman",
        "lmroman12-regular": "Times New Roman",
        "lmroman10-bold": "Times New Roman",
        "lmroman10-italic": "Times New Roman",
        "lmsans10-regular": "Arial",
        "lmmono10-regular": "Courier New",
        # Computer Modern fonts
        "cmr10": "Times New Roman",
        "cmr12": "Times New Roman",
        "cmbx10": "Times New Roman",
        "cmti10": "Times New Roman",
        "cmss10": "Arial",
        "cmtt10": "Courier New",
    }

    normalized = font_mappings.get(font_name.lower(), font_name)
    if normalized != font_name:
        logging.debug(f"Normalized font name: {font_name} → {normalized}")

    return normalized


def get_fonts_cache_dir() -> str:
    """Get or create the fonts cache directory."""
    cache_dir = os.path.join(os.path.expanduser("~"), ".filler_agent_fonts")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def download_font_from_google_fonts(font_name: str, cache_dir: str) -> Optional[str]:
    """
    Attempt to download a font from Google Fonts.
    Returns the path to the downloaded font file, or None if failed.
    """
    try:
        css_url = f"https://fonts.googleapis.com/css2?family={urllib.parse.quote(font_name.replace(' ', '+'))}"
        response = requests.get(css_url, timeout=10)
        if response.status_code == 200:
            # Parse CSS to find font file URLs
            css_content = response.text
            # Look for font file URLs in the CSS
            font_urls = re.findall(
                r"url\((https://fonts\.gstatic\.com/[^)]+\.(?:woff2|woff|ttf))\)",
                css_content,
            )

            if font_urls:
                # Download the first font file (usually the regular weight)
                font_url = font_urls[0]
                font_response = requests.get(font_url, timeout=30)

                if font_response.status_code == 200:
                    # Determine file extension
                    if ".woff2" in font_url:
                        ext = ".woff2"
                    elif ".woff" in font_url:
                        ext = ".woff"
                    elif ".ttf" in font_url:
                        ext = ".ttf"
                    else:
                        ext = ".ttf"  # Default

                    # Save font file
                    safe_name = (
                        re.sub(r"[^\w\s-]", "", font_name).strip().replace(" ", "_")
                    )
                    font_path = os.path.join(cache_dir, f"{safe_name}{ext}")

                    with open(font_path, "wb") as f:
                        f.write(font_response.content)

                    logging.info(
                        f"Successfully downloaded font: {font_name} → {font_path}"
                    )
                    return font_path

        logging.debug(f"Could not download font from Google Fonts: {font_name}")
        return None

    except Exception as e:
        logging.debug(f"Error downloading font {font_name}: {e}")
        return None


def get_available_font(
    original_font: str, cache_dir: str | None = None
) -> Tuple[str, Optional[str]]:
    """
    Get an available font name and optional font file path using fallback chain:
    1. Try original font name
    2. Try normalized font name
    3. Try downloading the font
    4. Fall back to Arial
    5. Fall back to helv (Helvetica)

    Returns (font_name, font_file_path) tuple.
    """
    if cache_dir is None:
        cache_dir = get_fonts_cache_dir()

    if not original_font:
        logging.debug("No original font provided, using Arial fallback")
        return "Arial", None

    # Step 1: Try original font name
    logging.debug(f"Trying original font: {original_font}")

    # Step 2: Try normalized font name
    normalized_font = normalize_font_name(original_font)
    if normalized_font != original_font:
        logging.debug(f"Trying normalized font: {normalized_font}")

    # Step 3: Try to download the font
    for font_to_try in [original_font, normalized_font]:
        if font_to_try:
            # Check if already cached
            safe_name = re.sub(r"[^\w\s-]", "", font_to_try).strip().replace(" ", "_")
            for ext in [".ttf", ".woff", ".woff2"]:
                cached_path = os.path.join(cache_dir, f"{safe_name}{ext}")
                if os.path.exists(cached_path):
                    logging.debug(f"Found cached font: {cached_path}")
                    return font_to_try, cached_path

            # Try to download
            downloaded_path = download_font_from_google_fonts(font_to_try, cache_dir)
            if downloaded_path:
                return font_to_try, downloaded_path

    # Step 4: Fall back to Arial
    logging.debug("Font download failed, falling back to Arial")

    # Step 5: Final fallback to helv
    logging.debug("Arial not available, falling back to helv")
    return "helv", None
