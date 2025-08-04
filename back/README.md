# EasyForm Backend (filler_agent)

This document provides a detailed overview of the EasyForm backend workflow, architecture, and developer guidance. It is intended for developers and maintainers working on the backend Python code in the `back/` directory.

---

## Overview

EasyForm's backend is an LLM-powered form-filling engine that extracts user context from documents, detects fillable fields in forms (PDF/DOCX), and fills them using context data. It can run as a FastAPI server (for the Electron frontend or API clients) or as a CLI tool for batch/automation use.

---

## Backend Entry Points

### 1. FastAPI Server
- **File:** `back/server.py` (entry point), `back/api.py` (API implementation)
- **How to run:**
  ```bash
  python -m back.server
  # or
  uvicorn back.api:app --host 0.0.0.0 --port 8000
  ```
- **Purpose:** Exposes a REST API for all backend features, used by the Electron frontend and for integration/testing.

### 2. CLI Tool
- **File:** `back/cli.py`
- **How to run:**
  ```bash
  python -m back.filler_agent.cli --contextDir ./test_context --form ./form.pdf --provider google
  ```
- **Purpose:** Allows direct command-line use for context extraction and form filling. Useful for automation, debugging, and batch jobs.

---

## Core Workflow

### 1. Context Extraction
- **Purpose:** Extracts personal/user information from a directory of documents (PDF, DOCX, images) using OCR and LLMs.
- **Key module:** `back/context_extractor.py`
- **How it works:**
  - Scans the context directory for supported files.
  - Extracts text (using Docling, pdfplumber, pytesseract, etc.).
  - Sends extracted text to an LLM (OpenAI, Groq, or AnythingLLM) to parse personal info as JSON.
  - Resolves conflicts between sources and writes `context_data.json`.

### 2. Form Text Extraction
- **Purpose:** Converts a form (PDF/DOCX) into plain text for analysis.
- **Key module:** `back/text_extraction.py`
- **How it works:**
  - Extracts all visible text from the form, including tables.

### 3. Placeholder Pattern Detection
- **Purpose:** Identifies the actual placeholder strings (e.g., `_____`, `......`) used in the form.
- **Key module:** `back/pattern_detection.py`
- **How it works:**
  - Sends form text to the LLM to get a list of placeholder patterns.
  - Compiles a regex to match all detected patterns.

### 4. Fill Entry & Checkbox Detection
- **Purpose:** Finds fillable fields and checkbox groups in the form.
- **Key modules:** `back/fill_processor.py`, `back/checkbox_processor.py`
- **How it works:**
  - Uses the detected placeholder pattern to find fillable regions ("entries").
  - For checkboxes, groups contiguous lines and extracts options/positions.

### 5. Entry Processing (LLM-powered)
- **Purpose:** Maps each placeholder to a context key and fills it with the correct value.
- **Key modules:** `back/fill_processor.py`, `back/checkbox_processor.py`
- **How it works:**
  - For each entry, asks the LLM to match placeholders to context keys.
  - If a value is missing, tries to infer the key and mine the value from the aggregated corpus.
  - For checkboxes, asks the LLM which options should be checked based on context.

### 6. Form Filling (DOCX & PDF)
- **Purpose:** Writes the filled values back into the form, preserving formatting as much as possible.
- **Key modules:** `back/docx_filler.py`, `back/pdf_filler.py`
- **How it works:**
  - For DOCX: Replaces text in paragraphs/tables, updates checkboxes.
  - For PDF: Fills interactive fields if present, otherwise overlays text on redacted regions.

---

## API Endpoints

See the project root README for a full endpoint table. Typical flow:
1. `/context/extract` — Extract context from user docs.
2. `/form/text` — Extract text from the form.
3. `/pattern/detect` — Detect placeholder patterns.
4. `/fill-entries/detect` and `/checkbox-entries/detect` — Find fillable fields and checkboxes.
5. `/fill-entries/process` and `/checkbox-entries/process` — Map to context and fill values.
6. `/docx/fill` or `/pdf/fill` — Write filled form to disk.

---

## LLM Integration

- **Providers:** OpenAI, Groq, AnythingLLM (self-hosted)
- **How it works:**
  - All LLM calls go through `back/llm_client.py`.
  - Prompts are defined in `back/prompts.py`.
  - Includes retry logic for malformed responses and rate limits.
  - Provider/model can be selected via API/CLI.

---

## File/Module Structure

- `form_filler.py` — Main entry point for filling forms (used by both API and CLI)
- `api.py` — FastAPI app and endpoint definitions
- `cli.py` — Command-line interface
- `context_extractor.py` — Context extraction pipeline
- `fill_processor.py` — Fill entry detection and processing
- `checkbox_processor.py` — Checkbox group detection and processing
- `docx_filler.py` — DOCX form filling logic
- `pdf_filler.py` — PDF form filling logic
- `pattern_detection.py` — Placeholder pattern detection
- `llm_client.py` — LLM API abstraction and retry logic
- `font_manager.py` — Font normalization and download utilities
- `text_extraction.py` — Text extraction from forms
- `text_utils.py` — Unicode/text sanitization helpers
- `prompts.py` — Centralized prompt templates

---

## Extending & Debugging

- **Adding a new LLM provider:**
  - Implement client logic in `llm_client.py`.
  - Add provider option to CLI and API schemas.
- **Logging:**
  - Uses Python `logging` throughout. Enable debug logs with `--verbose` in CLI or set logging level in your environment.
- **Troubleshooting:**
  - Check logs for LLM errors, context extraction issues, or file I/O problems.
  - Use `/health` endpoint to verify server is running.

---

## Using Ollama with Gemma 3n

To use the Gemma 3n model via Ollama as your LLM provider, follow these steps:

1. **Download Ollama:**
   - Go to [https://ollama.com/download](https://ollama.com/download) and install Ollama for your platform.

2. **Pull the Gemma 3n model:**
   ```bash
   ollama pull gemma3n:e4b-it-q8_0
   ```

2. **Run the `ollama` server:**
    ```bash
    ollama serve
    ```

3. **Run EasyForm with Ollama as the provider:**
   - When running the API or CLI, choose `--provider ollama` to use your local Ollama instance with the custom Gemma 3n model.

---

## Appendix

### Data Schemas

#### FillEntry
- `lines`: Multiline string containing the original placeholder(s)
- `number_of_fill_spots`: Number of placeholders in `lines`
- `context_keys`: List of context key names (or null) per placeholder
- `filled_lines`: Same as `lines` but with placeholders replaced by values

#### CheckboxEntry
- `lines`: Multiline text snippet containing the checkbox group
- `checkbox_positions`: List of (lineIndex, charIndex) tuples for each checkbox
- `checkbox_values`: Human-readable label for each checkbox
- `context_key`: Context key this group maps to (if inferable)
- `checked_indices`: Indices of checkboxes that should be checked

### Example Workflow (API)

1. **Extract context:**
   - `POST /context/extract` with `{ context_dir: ... }`
2. **Extract form text:**
   - `POST /form/text` with `{ form_path: ... }`
3. **Detect placeholder pattern:**
   - `POST /pattern/detect` with `{ text: ..., provider: ... }`
4. **Detect fill entries:**
   - `POST /fill-entries/detect` with `{ lines: [...], keys: [...], pattern: ..., provider: ... }`
5. **Process fill entries:**
   - `POST /fill-entries/process` with `{ entries: [...], context_dir: ..., pattern: ..., provider: ... }`
6. **Fill form:**
   - `POST /docx/fill` or `/pdf/fill` with filled entries and checkbox entries

---

For further details, see inline comments in each module or the FastAPI docs at `/docs` when the server is running. 