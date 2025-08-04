from datetime import datetime
import os
import glob
import json
import logging
import threading
from markitdown import MarkItDown
from .prompts import (
    EXTRACTION_PROMPT_TEMPLATE,
    context_value_search_prompt,
    extraction_retry_prompt,
)
from ..llm_client import query_gpt
from ..llm_priority_queue import Priority
from ..llm_client import ocr as vision_ocr
from passport_mrz_extractor import mrz_reader
from ..filler_agent.text_utils import file_checksum
import concurrent.futures
import tempfile
from typing import List, Literal, Any, Optional
from collections import Counter
from .output_schemas import PersonalInfoModel

# Optional PyMuPDF import for embedded image extraction
try:
    import fitz  # type: ignore
except ImportError:
    fitz = None  # type: ignore
    logging.warning(
        "PyMuPDF library not installed, embedded PDF image extraction disabled."
    )

# Suppress verbose warnings from pdfminer about font bounding boxes
logging.getLogger("pdfminer").setLevel(logging.ERROR)

md = MarkItDown(enable_plugins=False)
CHUNK_SIZE = 8000  # Maximum characters per aggregated corpus chunk (~2k tokens)

lock = threading.Lock()


def synchronized(func):
    def wrapper(*args, **kwargs):
        with lock:
            return func(*args, **kwargs)

    return wrapper


@synchronized
def context_read(context_dir: str) -> dict:
    """Read and return the context data from context_data.json in the given directory."""
    context_data_path = os.path.join(context_dir, "context_data.json")
    if os.path.exists(context_data_path):
        try:
            with open(context_data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            # Handle corrupted or empty JSON files gracefully
            data = {}
    else:
        data = {}
    return data


@synchronized
def context_write(context_dir: str, data: dict) -> None:
    """Write the context data to context_data.json in the given directory."""
    context_data_path = os.path.join(context_dir, "context_data.json")
    os.makedirs(context_dir, exist_ok=True)
    with open(context_data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


@synchronized
def context_add(context_dir: str, key: str, value: str) -> dict:
    """Add or update a key-value pair in context_data.json in the given directory, and return the updated context."""
    context_data_path = os.path.join(context_dir, "context_data.json")
    data = {}
    if os.path.exists(context_data_path):
        try:
            with open(context_data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            # Start fresh if the existing file is corrupted
            data = {}
    # Update and persist
    data[key] = value
    os.makedirs(context_dir, exist_ok=True)
    with open(context_data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    return data


# ---------------------------------------------------------------------------
# Corpus directories for separating text-based and image-based extractions
# ---------------------------------------------------------------------------

# Inside each *context_dir* we now keep two sub-directories that store the
# chunked aggregated corpus:
#   • <context_dir>/.text  – corpus originating from textual sources (DOCX,
#     "normal" PDFs, etc.)
#   • <context_dir>/.img   – corpus originating from images (PNG/JPG/TIFF or
#     image-only PDFs)

TEXT_CORPUS_SUBDIR = ".text"
IMG_CORPUS_SUBDIR: str = ".img"

# ---------------------------------------------------------------------------
# Helper utilities for chunked aggregated corpus handling
# ---------------------------------------------------------------------------


def _get_corpus_chunk_paths(context_dir: str) -> list[str]:
    """Return a *sorted* list of aggregated corpus chunk files in *context_dir*.

    The first chunk is always ``aggregated_corpus.txt``.  Additional chunks are
    named ``aggregated_corpus_<n>.txt`` where *n* starts at 2.
    """
    import re

    first_path = os.path.join(context_dir, "aggregated_corpus.txt")
    chunk_paths: list[str] = []

    if os.path.exists(first_path):
        chunk_paths.append(first_path)

    # Collect numbered chunks – we purposely exclude the first path above
    pattern = os.path.join(context_dir, "aggregated_corpus_*.txt")
    for path in glob.glob(pattern):
        chunk_paths.append(path)

    # Sort numerically by the suffix – the *first* chunk (no suffix) remains first
    def _index(p: str) -> int:
        m = re.search(r"aggregated_corpus_(\d+)\.txt$", os.path.basename(p))
        return int(m.group(1)) if m else 1  # aggregated_corpus.txt → 1

    chunk_paths.sort(key=_index)
    return chunk_paths


@synchronized
def _write_text_to_corpus(context_dir: str, text: str) -> None:
    """Append *text* (any length) to the chunked aggregated corpus.

    This helper ensures that no individual chunk file exceeds ``CHUNK_SIZE``
    characters.  It will create new chunk files as required.
    """
    if not text:
        return

    # # If the text itself is larger than a chunk, skip and log.
    # if len(text) > CHUNK_SIZE:
    #     logging.warning(
    #         "Skipping addition to corpus – text length %d exceeds CHUNK_SIZE (%d).",
    #         len(text),
    #         CHUNK_SIZE,
    #     )
    #     return

    # Ensure the directory exists
    os.makedirs(context_dir, exist_ok=True)

    # Determine the last (or new) chunk file to write into
    chunk_paths = _get_corpus_chunk_paths(context_dir)
    if chunk_paths:
        last_path = chunk_paths[-1]
        try:
            with open(last_path, "r", encoding="utf-8") as f:
                current_len = len(f.read())
        except FileNotFoundError:
            current_len = 0
    else:
        # No chunks yet – create the first one
        last_path = os.path.join(context_dir, "aggregated_corpus.txt")
        current_len = 0

    # If the current chunk cannot accommodate the text, start a new chunk
    if current_len + len(text) > CHUNK_SIZE:
        next_idx = _get_next_chunk_index(chunk_paths)
        last_path = os.path.join(context_dir, f"aggregated_corpus_{next_idx}.txt")

    # Finally write the text (single shot – no splitting)
    try:
        with open(last_path, "a", encoding="utf-8") as f:
            f.write(text)
    except Exception as e:
        logging.error(f"Failed to append to corpus chunk {last_path}: {e}")


def _get_next_chunk_index(existing_chunk_paths: list[str]) -> int:
    """Return the next numeric index for a new corpus chunk."""
    import re

    max_idx = 1
    for p in existing_chunk_paths:
        m = re.search(r"aggregated_corpus_(\d+)\.txt$", os.path.basename(p))
        if m:
            max_idx = max(max_idx, int(m.group(1)))
    return max_idx + 1


@synchronized
def scan_context_dir(dir_path):
    """Recursively collect docx, pdf, and image files from the directory."""
    patterns = ["*.docx", "*.pdf", "*.png", "*.jpg", "*.jpeg", "*.tiff"]
    files = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(dir_path, "**", pat), recursive=True))
    return files


def _clean_extracted_text(text: str) -> str:
    """Remove placeholder comments and newlines, then strip."""
    if not text:
        return ""
    return text.replace("<!-- image -->", "").replace("\n", "").strip()


@synchronized
def _extract_images_from_pdf(path: str):
    """Extract embedded images from a PDF and save them to temporary PNG files.

    Returns
    -------
    list[str]
        Paths to the temporary image files. **Caller is responsible for deleting.**
    """
    image_paths = []
    if fitz is None:
        # PyMuPDF not available
        return image_paths

    try:
        doc = fitz.open(path)
        for page_index in range(len(doc)):
            page = doc[page_index]
            for img_index, img_info in enumerate(page.get_images(full=True)):
                xref = img_info[0]
                try:
                    pix = fitz.Pixmap(doc, xref)
                    # Convert CMYK/Gray/other to RGB
                    if pix.alpha or pix.n > 4:
                        rgb_pix = fitz.Pixmap(fitz.csRGB, pix)
                        pix = rgb_pix  # work with converted copy
                    fd, tmp_path = tempfile.mkstemp(suffix=".png")
                    os.close(fd)
                    pix.save(tmp_path)
                    # Ensure Pixmap resources are released promptly to avoid leaks
                    try:
                        pix.close()  # type: ignore[attr-defined]
                    except Exception:
                        pass  # close() may not exist on older PyMuPDF versions
                    pix = None
                    image_paths.append(tmp_path)
                except Exception as e:
                    logging.debug(
                        f"Failed to extract image {img_index} on page {page_index}: {e}"
                    )
        doc.close()
    except Exception as e:
        logging.error(f"Error extracting images from PDF {path}: {e}")

    return image_paths


@synchronized
def extract_text(path):
    """Extract text from a file."""
    original_text = md.convert(path).text_content
    return (
        f"DOCUMENT NAME: {path}\n\n\n{original_text}\nEND OF DOCUMENT\n\n\n",
        original_text,
    )


def extract_pdf(path, raw_text=False):
    """Extract text from PDF."""
    is_image_only = False
    i = 0 if not raw_text else 1
    try:
        # First try pdfplumber for text extraction
        plumber_result, original_text = extract_text(path)
        if _clean_extracted_text(original_text):
            return plumber_result if not raw_text else original_text, is_image_only
        # Fallback: extract all embedded images and perform OCR in parallel
        logging.info(
            f"No text found with MarkItDown, extracting embedded images for OCR: {path}"
        )
        is_image_only = True

        # Extract embedded images to temporary files
        image_paths = _extract_images_from_pdf(path)

        if not image_paths:
            logging.warning(f"No embedded images found in PDF {path} for OCR fallback")
            return "", is_image_only

        texts: list[str] = []

        def _ocr_and_cleanup(img_path: str) -> str:
            """Run OCR on *img_path* and delete the file afterwards."""
            try:
                return extract_image(img_path)[i]
            finally:
                try:
                    os.remove(img_path)
                except Exception:
                    pass

        # Perform OCR in parallel for speed
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [executor.submit(_ocr_and_cleanup, p) for p in image_paths]
            for future in concurrent.futures.as_completed(futures):
                try:
                    texts.append(future.result())
                except Exception as e:
                    logging.debug(f"OCR failed for an embedded image: {e}")

        return "\n".join(texts), is_image_only
    except Exception as e:
        logging.error(f"Error extracting PDF {path}: {e}")
        return "", is_image_only


@synchronized
def extract_image(path):
    """Perform OCR on an image file with persistent caching.

    The OCR result is cached in ~/.EasyOCR/<checksum>.txt where <checksum>
    is a short SHA-256 of the absolute file path and its last-modified time.
    """
    # ------------------------------------------------------------------
    # Check cache first
    # ------------------------------------------------------------------
    cache_dir = os.path.expanduser("~/.EasyOCR")
    os.makedirs(cache_dir, exist_ok=True)
    checksum = file_checksum(path)
    cache_path = os.path.join(cache_dir, f"{checksum}.txt")

    if os.path.isfile(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as fh:
                cached = fh.read()
            if cached and _clean_extracted_text(cached):
                return (
                    f"DOCUMENT NAME: {path}\n\n\n{cached}\nEND OF DOCUMENT\n\n\n",
                    cached,
                )
        except Exception as exc:
            logging.error(f"Failed to read OCR cache for {path}: {exc}")

    # ------------------------------------------------------------------
    # Perform OCR using the vision_ocr helper
    # ------------------------------------------------------------------
    try:
        ocr_text = vision_ocr(path)
        if ocr_text and _clean_extracted_text(ocr_text):
            # Persist to cache
            try:
                with open(cache_path, "w", encoding="utf-8") as fh:
                    fh.write(ocr_text)
            except Exception as exc:
                logging.error(f"Failed to write OCR cache for {path}: {exc}")
            return (
                f"DOCUMENT NAME: {path}\n\n\n{ocr_text}\nEND OF DOCUMENT\n\n\n",
                ocr_text,
            )
    except Exception as e:
        logging.error(f"Vision OCR failed for {path}: {e}")

    # ------------------------------------------------------------------
    # Fallback to legacy MRZ extractor
    # ------------------------------------------------------------------
    try:
        mrz_data = mrz_reader.read_mrz(path)
        text = str(mrz_data)
        if text and _clean_extracted_text(text):
            try:
                with open(cache_path, "w", encoding="utf-8") as fh:
                    fh.write(text)
            except Exception as exc:
                logging.error(f"Failed to write OCR cache for {path}: {exc}")
        return (
            f"DOCUMENT NAME: {path}\n\n\n{text}\nEND OF DOCUMENT\n\n\n",
            text,
        )
    except Exception as e:
        logging.error(f"Error OCR image {path}: {e}")
        return "", ""


def aggregate_text(paths, context_dir: str | None = None):
    """Aggregate extracted text from a list of file paths.

    This enhanced version keeps an *incremental* aggregated corpus (``aggregated_corpus.txt``)
    and a list of previously processed ``read_files`` inside ``context_data.json``.  On
    subsequent calls it will:

    1. Re-use any existing corpus on disk (if both the corpus file and a non-empty
       ``read_files`` list exist).
    2. Extract text **only** from *new* files that are not yet present in
       ``read_files``.
    3. Append newly extracted text to both the in-memory corpus and the on-disk
       ``aggregated_corpus.txt``.
    4. Persist the updated ``read_files`` list back to ``context_data.json``.

    Parameters
    ----------
    paths : list[str]
        List of absolute or relative file paths to consider for aggregation.
    context_dir : str | None, optional
        Root directory that contains ``context_data.json``.  If *None*, it will be
        inferred from the *paths* list via ``os.path.commonpath``.  When *paths* is
        empty and *context_dir* is *None*, the current working directory is used as
        a fallback.
    """

    if context_dir is None:
        # Infer from supplied paths – works as long as *paths* share a common root
        if paths:
            context_dir = os.path.commonpath(paths)
        else:
            context_dir = os.getcwd()

    # Ensure we operate with an absolute directory path
    context_dir = os.path.abspath(context_dir)

    # ------------------------------------------------------------------
    # Updated: leverage chunked corpus storage helpers
    # ------------------------------------------------------------------
    context_data_path = os.path.join(context_dir, "context_data.json")

    # Load existing context_data (if any)
    context_data: dict[str, Any] = {}
    if os.path.exists(context_data_path):
        context_data = context_read(context_dir)

    # Ensure read_files key exists
    read_files: list[str] = [
        os.path.abspath(p) for p in context_data.get("read_files", [])
    ]

    # ------------------------------------------------------------------
    # Prepare corpus directories
    # ------------------------------------------------------------------
    text_corpus_dir = os.path.join(context_dir, TEXT_CORPUS_SUBDIR)
    img_corpus_dir = os.path.join(context_dir, IMG_CORPUS_SUBDIR)

    # Extract text only from new files that are not yet recorded
    new_files: list[str] = []

    for path in paths:
        abs_path = os.path.abspath(path)
        if abs_path in read_files:
            continue  # Already processed

        ext = os.path.splitext(path)[1].lower()
        logging.info(f"Extracting text from new file {path}")

        extracted_text = ""
        dest_dir = text_corpus_dir  # default – gets adjusted below if needed

        if ext == ".docx":
            extracted_text, _ = extract_text(path)
        elif ext == ".pdf":
            pdf_result = extract_pdf(path)
            if isinstance(pdf_result, tuple):
                extracted_text, is_image_only = pdf_result
                if is_image_only:
                    dest_dir = img_corpus_dir
            else:
                extracted_text = pdf_result
        elif ext in [".png", ".jpg", ".jpeg", ".tiff"]:
            extracted_text = extract_image(path)[0]
            dest_dir = img_corpus_dir

        extracted_text = extracted_text.strip()

        if extracted_text:
            if len(extracted_text) > CHUNK_SIZE:
                logging.warning(
                    f"Extracted text from {path} is {len(extracted_text)} characters – exceeds CHUNK_SIZE; skipping corpus addition."
                )
            else:
                # Append newline to separate documents and write to corpus as a single unit
                _write_text_to_corpus(dest_dir, extracted_text + "\n")

        # Record that we have processed this file (even if skipped or empty)
        new_files.append(abs_path)

    # Update read_files and write back to context_data.json
    if new_files:
        try:
            # Merge and deduplicate while preserving order – favour existing order first
            combined = read_files + [p for p in new_files if p not in read_files]
            context_data["read_files"] = combined
            context_write(context_dir, context_data)
            logging.info(
                f"Updated read_files list in {context_data_path} with {len(new_files)} new entries."
            )
        except Exception as e:
            logging.error(f"Failed to update context_data.json with read_files: {e}")


@synchronized
def _read_chunks(dir_path: str) -> list[str]:
    chunks: list[str] = []
    if not os.path.isdir(dir_path):
        return chunks
    for p in _get_corpus_chunk_paths(dir_path):
        try:
            with open(p, "r", encoding="utf-8") as f:
                chunks.append(f.read())
        except Exception as exc:
            logging.error(f"Failed to read corpus chunk {p}: {exc}")
    return chunks


def mine_context_value(
    new_key: str,
    context_dir: str,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
    text_corpus_chunks: Optional[List[str]] = None,
    img_corpus_chunks: Optional[List[str]] = None,
    context_data: Optional[dict] = None,
    from_chat: bool = False,
):
    """Discover the *value* for ``new_key`` inside the aggregated corpus.

    This helper now works with the **dual-corpus** layout introduced recently:

    1. :pydata:`<context_dir>/.text` – stores chunks originating from *textual*
       sources such as DOCX or standard PDFs.
    2. :pydata:`<context_dir>/.img` – stores chunks that were produced by OCR on
       images (PNG/JPG/TIFF) *or* from image-only PDFs.

    ``read_corpus_chunks`` transparently reads from *both* locations so the core
    logic below did not need substantial changes – we simply updated the
    documentation and ensured the function always calls :pyfunc:`aggregate_text`
    first so that any newly added files are reflected in the corpus before we
    attempt the value mining step.
    """

    files_in_ctx = scan_context_dir(context_dir)
    # Use enhanced aggregate_text that incrementally builds corpus and tracks read files
    aggregate_text(files_in_ctx, context_dir)
    if context_data is None:
        context_data = context_read(context_dir)
    # --------------------------------------------------------------
    # Ensure we have the list of chunks for both corpora – if not supplied,
    # read them from disk.
    # --------------------------------------------------------------

    text_corpus_dir = os.path.join(context_dir, TEXT_CORPUS_SUBDIR)
    img_corpus_dir = os.path.join(context_dir, IMG_CORPUS_SUBDIR)

    # Allow caller to provide already-loaded chunks so we avoid redundant IO
    text_chunks = (
        text_corpus_chunks
        if text_corpus_chunks is not None
        else _read_chunks(text_corpus_dir)
    )
    img_chunks = (
        img_corpus_chunks
        if img_corpus_chunks is not None
        else _read_chunks(img_corpus_dir)
    )

    # --------------------------------------------------------------
    # Helper to query GPT for a value inside a chunk
    # --------------------------------------------------------------
    def _query_new_value(chunk: str) -> Optional[str]:
        try:
            prompt = context_value_search_prompt(new_key, chunk)
            resp_raw = query_gpt(
                prompt,
                provider=provider,
                priority=Priority.NORMAL if not from_chat else Priority.HIGH,
            ).strip()  # Context extraction uses low priority
            cleaned = resp_raw.strip("`").strip('"').strip("'")
            if cleaned.lower() == "null" or cleaned == "":
                return None
            return cleaned.split("\n")[0]
        except Exception as exc:
            logging.error(f"LLM extraction for key '{new_key}' failed: {exc}")
            return None

    def _mine_from_chunks(chunks: List[str]) -> Optional[str]:
        if not chunks:
            return None
        results: List[str] = []
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [executor.submit(_query_new_value, c) for c in chunks]
            for fut in concurrent.futures.as_completed(futures):
                val = fut.result()
                if val is not None:
                    results.append(val)

        if not results:
            return None

        counter = Counter(results)
        most_common_val, _ = counter.most_common(1)[0]
        return most_common_val

    # First try with text chunks, then fall back to image chunks
    value = _mine_from_chunks(text_chunks)
    if value is None:
        value = _mine_from_chunks(img_chunks)

    if value is not None:
        context_add(context_dir, new_key, value)
    return value, text_chunks, img_chunks, context_data


def extract_context_from_form(form_paths: list[str]):
    """Extract personal info from each file individually, tracking source types, in parallel."""
    corpus: list[tuple[str, str]] = []  # [(source_type, text)]

    def process_file(file_path):
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".docx":
            _, text_content = extract_text(file_path)
        elif ext == ".pdf":
            text_content, _ = extract_pdf(file_path)
        elif ext in [".png", ".jpg", ".jpeg", ".tiff"]:
            text_content = extract_image(file_path)[0]
        else:
            logging.warning(f"Unsupported file type: {file_path}")
            return None
        if not text_content.strip():
            logging.warning(f"No text extracted from {file_path}")
            return None
        return text_content

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_file, file_path) for file_path in form_paths]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result is not None:
                corpus.append(result)
    return "\n".join(corpus)


def _attempt_parse_personal_info_response(response: str) -> Optional[dict]:
    """Try to parse the model response into JSON.

    Returns the parsed dict on success, or ``None`` if parsing failed.
    This mirrors the heuristics previously embedded directly inside
    ``extract_personal_info`` so that we can reuse the logic across retries.
    """

    if not response or not response.strip():
        return None

    # 1. Direct attempt after basic cleanup
    cleaned = response.replace("`", "").replace("\n", "").strip().lstrip("json")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2. Attempt to extract JSON from markdown/code blocks
    import re

    markdown_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
    if markdown_match:
        try:
            return json.loads(markdown_match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Fallback to first JSON-looking object in the string
    json_match = re.search(r"\{.*\}", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    return None


def extract_personal_info(
    raw_text,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
    max_retries: int = 3,
):
    """Use the LLM to extract personal info JSON from raw text with retry logic.

    The function will call the model up to *max_retries* times.  After the first
    attempt (which uses the standard extraction prompt) any subsequent retries
    will use a specialised retry prompt that re-emphasises the required output
    format.  If all attempts fail we fall back to the previous behaviour of
    returning an empty personal-info structure so that downstream code can
    continue to run.
    """

    prompt = EXTRACTION_PROMPT_TEMPLATE.format(content=raw_text)

    for attempt in range(max_retries):
        logging.debug(f"extract_personal_info attempt {attempt + 1}/{max_retries}")

        response = query_gpt(
            prompt,
            provider=provider,
            response_format=PersonalInfoModel,
            priority=Priority.LOW,  # Context extraction uses low priority
        )
        logging.debug(f"Raw GPT response (attempt {attempt + 1}): {repr(response)}")

        parsed = _attempt_parse_personal_info_response(response)
        del parsed["reasoning_process"]
        if parsed is not None:
            return parsed

        # Prepare for next retry if we have any left
        if attempt < max_retries - 1:
            logging.debug("Parsing failed, preparing retry prompt…")
            prompt = extraction_retry_prompt(raw_text)
            continue

    # All attempts failed – log and return default empty structure
    logging.error("Failed to parse JSON from GPT after multiple attempts")
    logging.warning("Returning empty personal info structure due to parsing failure")

    return {
        "full_name": "",
        "first_name": "",
        "middle_names": "",
        "last_name": "",
        "phone_number": "",
        "email": "",
        "date_of_birth": "",
    }


def get_source_type(file_path):
    """Determine the source type based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".docx":
        return "text"
    elif ext == ".pdf":
        return "pdf"
    elif ext in [".png", ".jpg", ".jpeg", ".tiff"]:
        return "image"
    else:
        return "unknown"


def extract_from_individual_files(
    file_paths,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
):
    """Extract personal info from each file individually, tracking source types, in parallel."""
    extractions = []
    corpus: list[tuple[str, str]] = []  # [(source_type, text)]

    def process_file(file_path):
        source_type = get_source_type(file_path)
        logging.info(f"Processing {source_type} file: {file_path}")
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".docx":
            text_content, _ = extract_text(file_path)
        elif ext == ".pdf":
            text_content, is_image_only = extract_pdf(file_path)
            if is_image_only:
                source_type = "image"
        elif ext in [".png", ".jpg", ".jpeg", ".tiff"]:
            text_content = extract_image(file_path)[0]
        else:
            logging.warning(f"Unsupported file type: {file_path}")
            return None
        if not text_content.strip():
            logging.warning(f"No text extracted from {file_path}")
            return None
        try:
            if len(text_content) > CHUNK_SIZE:
                logging.warning(
                    f"Extracted text from {file_path} is {len(text_content)} characters – exceeds CHUNK_SIZE; skipping extraction."
                )
                return None
            extracted_data = extract_personal_info(text_content, provider)
            logging.debug(f"Extracted from {file_path}: {extracted_data}")
            return {
                "source_file": file_path,
                "source_type": source_type,
                "extracted_data": extracted_data,
            }, text_content
        except Exception as e:
            logging.error(f"Failed to extract from {file_path}: {e}")
            return None

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_file, file_path) for file_path in file_paths]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result is not None:
                extractions.append(result[0])
                text_content = result[1]
                source_type = result[0]["source_type"]
                corpus.append((source_type, text_content))

    return extractions, corpus


def _resolve_most_frequent(values, source_type, field):
    """Helper to resolve the most frequent value from a list of dicts with 'value' and 'source'."""
    if len(values) == 1:
        final_value = values[0]["value"]
        resolution = f"{source_type}_single from {values[0]['source']}"
        conflict_log = None
    else:
        value_counts = {}
        lower_values_to_original = {}
        for item in values:
            val = item["value"]
            if val.lower() not in value_counts:
                value_counts[val.lower()] = []
                lower_values_to_original[val.lower()] = val
            value_counts[val.lower()].append(item["source"])
        most_frequent = max(value_counts.keys(), key=lambda x: len(value_counts[x]))
        final_value = lower_values_to_original[most_frequent]
        resolution = (
            f"{source_type}_frequent '{final_value}' from {value_counts[most_frequent]}"
        )
        conflict_log = None
        if len(value_counts) > 1:
            conflict_log = f"Field '{field}': Multiple {source_type} values found, chose most frequent '{most_frequent}'"
    return final_value, resolution, conflict_log


def resolve_conflicts(extractions):
    """Resolve conflicts between multiple extractions using priority rules."""
    if not extractions:
        return {
            "full_name": "",
            "first_name": "",
            "middle_names": "",
            "last_name": "",
            "phone_number": "",
            "email": "",
            "date_of_birth": "",
        }

    # Group extractions by field
    field_values = {}
    field_names = [
        "full_name",
        "first_name",
        "middle_names",
        "last_name",
        "phone_number",
        "email",
        "date_of_birth",
    ]

    for field in field_names:
        field_values[field] = {"text": [], "pdf": [], "image": []}

    # Collect all values for each field by source type
    for extraction in extractions:
        source_type = extraction["source_type"]
        data = extraction["extracted_data"]
        source_file = extraction["source_file"]

        # Skip entries where extracted_data is not a valid dict (e.g. None due to upstream errors)
        if not isinstance(data, dict):
            logging.warning(f"Skipping extraction with invalid data for {source_file}")
            continue

        for field in field_names:

            # Safely handle possible None values from the LLM by converting them to an empty string first
            raw_value = data.get(field)
            value = (raw_value or "").strip()
            if value:  # Only collect non-empty values
                field_values[field][source_type].append(
                    {"value": value, "source": source_file}
                )

    # Resolve conflicts for each field
    final_result = {}
    conflicts_log = []

    for field in field_names:
        values = field_values[field]
        text_values = values["text"]
        pdf_values = values["pdf"]
        image_values = values["image"]

        final_value = ""
        resolution_info = {
            "field": field,
            "text_count": len(text_values),
            "pdf_count": len(pdf_values),
            "image_count": len(image_values),
            "resolution": "empty",
        }

        if text_values:
            final_value, resolution, conflict_log = _resolve_most_frequent(
                text_values, "text", field
            )
            resolution_info["resolution"] = resolution
            if conflict_log:
                conflicts_log.append(conflict_log)
        elif pdf_values:
            final_value, resolution, conflict_log = _resolve_most_frequent(
                pdf_values, "pdf", field
            )
            resolution_info["resolution"] = resolution
            if conflict_log:
                conflicts_log.append(conflict_log)
        elif image_values:
            final_value, resolution, conflict_log = _resolve_most_frequent(
                image_values, "image", field
            )
            resolution_info["resolution"] = resolution
            if conflict_log:
                conflicts_log.append(conflict_log)
        # If no values found, use empty string
        if not final_value:
            final_value = ""
            resolution_info["resolution"] = "empty"
        final_result[field] = final_value
        logging.debug(f"Field '{field}' resolution: {resolution_info}")

    # Log conflict resolutions
    if conflicts_log:
        logging.info("Conflict resolutions applied:")
        for conflict in conflicts_log:
            logging.info(f"  - {conflict}")
    else:
        logging.info("No conflicts found between sources")

    return final_result


def clean_up_context(context_dir: str):
    context_data = context_read(context_dir)
    today = datetime.today()
    context_data["current_date (DD/MM/YYYY)"] = today.strftime("%d/%m/%Y")
    context_data["current_day_in_month"] = str(today.day)
    context_data["current_month"] = today.strftime("%B")
    context_data["current_year"] = str(today.year)
    items_to_remove = []
    for k, v in context_data.items():
        if isinstance(v, str) and v.strip() == "":
            items_to_remove.append(k)
    for k in items_to_remove:
        context_data.pop(k)
    context_write(context_dir, context_data)


def extract_context(
    dir_path,
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"],
):
    """Full context extraction pipeline with conflict resolution."""
    files = scan_context_dir(dir_path)

    if not files:
        raise RuntimeError(f"No supported files found in {dir_path}")

    logging.info(f"Found {len(files)} files to process")

    # -------------------------------------------------------------------
    # Fast-path: if we already ran extraction for *all* files inside the
    # directory and both the aggregated corpus as well as the cached
    # ``context_data.json`` are present, we can skip the expensive
    # processing below and simply return the cached result.
    # -------------------------------------------------------------------
    context_data_path = os.path.join(dir_path, "context_data.json")
    aggregated_corpus_text_path = os.path.join(
        dir_path, TEXT_CORPUS_SUBDIR, "aggregated_corpus.txt"
    )
    aggregated_corpus_img_path = os.path.join(
        dir_path, IMG_CORPUS_SUBDIR, "aggregated_corpus.txt"
    )

    if os.path.exists(context_data_path) and (
        os.path.exists(aggregated_corpus_text_path)
        or os.path.exists(aggregated_corpus_img_path)
    ):
        try:
            clean_up_context(dir_path)
            cached_data = context_read(dir_path)
            cached_read_files = [
                os.path.abspath(p) for p in cached_data.get("read_files", [])
            ]
            required_files = [os.path.abspath(p) for p in files]
            # Only short-circuit if *every* file we are about to process has
            # already been processed previously (cached_read_files may hold
            # additional paths – that is fine).
            if required_files and all(p in cached_read_files for p in required_files):
                logging.info(
                    "All files already processed previously – returning cached context_data.json contents."
                )
                return cached_data
        except Exception as e:
            # If anything goes wrong, fall back to normal processing path.
            logging.warning(
                f"Failed to load cached context_data.json – continuing with fresh extraction: {e}"
            )

    # Extract from each file individually
    text_corpus_dir = os.path.join(dir_path, TEXT_CORPUS_SUBDIR)
    img_corpus_dir = os.path.join(dir_path, IMG_CORPUS_SUBDIR)

    extractions, corpus = extract_from_individual_files(files, provider)

    # Persist each extracted text to the appropriate corpus directory
    for source_type, text in corpus:
        dest_dir = img_corpus_dir if source_type == "image" else text_corpus_dir
        _write_text_to_corpus(dest_dir, text)

    if not extractions:
        raise RuntimeError("No successful extractions from any files")

    logging.info(f"Successfully extracted from {len(extractions)} files")

    # Resolve conflicts and merge results
    final_result = resolve_conflicts(extractions)

    # Log final summary
    non_empty_fields = {k: v for k, v in final_result.items() if v.strip()}
    logging.info(
        f"Final extraction completed with {len(non_empty_fields)} populated fields: {list(non_empty_fields.keys())}"
    )

    final_result = {k: v.split("\n")[0] for k, v in final_result.items() if v}
    final_result["read_files"] = [os.path.abspath(f) for f in files]
    today = datetime.today()
    final_result["current_date (DD/MM/YYYY)"] = today.strftime("%d/%m/%Y")
    final_result["current_day_in_month"] = str(today.day)
    final_result["current_month"] = today.strftime("%B")
    final_result["current_year"] = str(today.year)
    # --- Persist the resolved context data ---
    context_write(dir_path, final_result)
    return final_result
