# EasyForm

An LLM-powered form filler using on-device user documents - can run entirely offline, ensuring accuracy, privacy with great user experience

## Getting Started

1. Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

2. Frontend:

```bash
cd front
npm install
```

3. LibreOffice (macOS, for DOCX → PDF conversion):

```bash
brew install --cask libreoffice
```

4. Setting up ollama & Gemma 3n:

```bash
brew install ollama
ollama pull gemma3n:e4b-it-q8_0
ollama pull benhaotang/Nanonets-OCR-s:latest
ollama serve
```

5. Run backend server

> **Note:** You might need to reactivate `.venv` before running the command below in order for it to work.

```bash
uvicorn back.api:app --host 0.0.0.0 --port 8000 --reload
```

6. Run frontend app

```bash
cd front
npm run start
```

7. Demo documents
   We have also prepare some mock documents for you to play with:

- `./test_forms`: a mock pdf form file
<!-- TODO: Need to find some mock context files -->
- `./test_context`: a mock context directory

## Features

- **Intelligent form filling** – automatically fill PDF (interactive and flat) and DOCX templates using data extracted from your personal documents.
- **Context extraction** – parses and OCRs PDFs, DOCX, images in a folder to build a rich `context_data.json` profile that drives the filling logic.
- **Checkbox detection & processing** – identifies checkbox groups and determines which boxes to tick based on context.
- **Multimodal chatbot** – talk to your documents with image attachments, persistent sessions and multiple LLM providers.
- **File translation** – translate complete PDF/DOCX/image files into any language while preserving layout.
- **Provider flexibility** – supports OpenAI, Groq, Google, AnythingLLM, local transformers and Ollama; can work fully offline.
- **Top notch GUI** – cross-platform desktop dynamic GUI with dark mode

## Command-line utilities

EasyForm ships with three dedicated CLIs alongside the web UI. All of them are executable with **Python ≥ 3.10** once your virtual-env is activated.

### 1. Form filler CLI

Extract context and/or fill forms right from the shell.

```bash
# A) (Re)generate context_data.json for a folder of personal docs
python -m back.filler_agent.cli --contextDir ./my_context --provider google

# B) Fill a PDF or DOCX form using that context
python -m back.filler_agent.cli \
  --contextDir ./my_context \
  --form ./forms/tax_form.pdf \
  --output ./filled/tax_form_filled.pdf \
  --provider groq

# Tip: add --printFilled to dump the filled text in the terminal
```

### 2. Chatbot CLI

Persistent multi-turn chat whose knowledge comes from the same context directory.

```bash
# List existing chats
python -m back.chatbot.cli list

# Create a new session
python -m back.chatbot.cli new --name "Visa application Q&A" --provider openai --contextDir ./my_context

# Talk inside a session (ID or name)
python -m back.chatbot.cli chat 3b9c88f2 --provider groq --contextDir ./my_context

# Delete a session
python -m back.chatbot.cli delete 3b9c88f2
```

Inside the chat you can:

- use `/history` to print the conversation
- `/sendimg path/to/image.jpg your question` for image-based prompts
- `/exit` to quit (auto-saves) or `/delete` to remove the session

### 3. Translation CLI

Translate full documents in one go:

```bash
python -m back.translation_agent.cli ./docs/contract.pdf "French" --provider openai --output ./docs/contract_fr.pdf
```

### 4. Run the whole application

```bash
# Backend (FastAPI + WebSocket):
python -m back.server   # or: uvicorn back.api:app --host 0.0.0.0 --port 8000 --reload

# Frontend (Electron + React):
cd front && npm run start
```

Navigate to `http://localhost:8000/docs` for interactive API docs and the Electron window will open automatically for the UI.

For a production build (self-contained desktop app):

```bash
cd front && npm run package
# The installer / binaries will appear in front/out
```

## Packaging & Distribution

1. bundling backend as frontend asset with `pyinstaller server.spec --clean --distpath ./front/src/assets/python`
2. Run `cd front && npm run make` to create a production build of our app
  - This will package python backend into binary executable
  - The package will be created in `./front/out` directory
3. To run frontend packaged with backend:
  + For debugging, run the commands [here](https://github.com/hieu-lee/tic-tac-toe/blob/79916f817f8dd462cc8aad6ca182c867980b269a/front/mprocs.yaml#L1-L7)
  + For production, run `open front/out/EasyForm-darwin-arm64/EasyForm.app`
4. For distribution `cd ./front/out/EasyForm-darwin-arm64 && zip -r EasyForm.zip EasyForm.app` and put the zip in github releases.

## Quick Local Backend Test Run

```bash
chmod +x test_run.sh  # if not already executable
./test_run.sh         # optional CLI flags can be appended
```

The script executes:

```bash
python -m back.filler_agent.cli --contextDir ./test_context --form ./form.pdf --provider google
```

After completion a filled PDF will be written next to the original file.

---

If you just want to start the FastAPI server instead:

```bash
uvicorn back.api:app --reload
```

and navigate to `http://127.0.0.1:8000/docs` for the interactive swagger UI.

## Quick API Test Run

```bash
# 1) Ensure the FastAPI server is running (see instructions above)
uvicorn back.api:app --reload &  # or python -m back.server

# 2) In another terminal (or after the server is up) execute:
python test_api_process.py --contextDir ./test_context --form ./form.pdf --provider google
# Optional flags:
#   --base http://localhost:8000   # non-default host
#   --out  ./filled_output.pdf     # custom output path
```

The script walks through the entire API pipeline:

1. Health-check
2. Context extraction
3. Text extraction & pattern detection
4. Fill-entry & checkbox detection + processing
5. Calls the appropriate `/docx/fill` or `/pdf/fill` endpoint and prints the resulting output path.

### Endpoints

List of endpoints can be found at <http://localhost:8000/docs>
