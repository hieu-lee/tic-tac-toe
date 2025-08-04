# EasyForm: Technical Report

This document provides a detailed technical overview of the EasyForm application, covering its architecture, the strategic use of LLMs like Gemma 3, the challenges encountered during development, and the rationale behind our technical decisions.

## 1. Features Overview

1. **Context Extraction**  
   Automatically parse documents to pull out key entities, phrases, and contextual information that can be reused during translation, form filling, or downstream processing.

2. **Form Translation**  
   Translate entire forms or selected fields between languages while preserving original structure and formatting.

3. **AI Chatbot**  
   A conversational assistant that answers questions about your forms and documents.
   - **Type to Ask Questions** – Simply type natural-language questions and receive answers instantly.
   - **Screen Capture Questions** – Grab a screenshot of any area in the document and ask context-aware questions about the selected region.
   - **Slash Commands** – Use quick “/” commands inside the chat to update knowledge base.

4. **Form Filling & Review**  
   End-to-end pipeline for detecting fields, generating answers, and reviewing results.
   - **Flat PDF Forms** – Handle non-interactive PDFs that require text overlay injection (e.g., NDAs, government templates).
   - **DOCX Forms** – Populate Microsoft Word forms and export to PDF when needed.
   - **Interactive PDF Forms** – Fill AcroForm/XFA widgets directly so the resulting PDF remains fully interactive.
   - **Image-Only PDFs** – OCR-based extraction and overlay for scanned forms or photos.

5. **Review Filled Forms** 
   Integrated viewer to inspect, annotate, and approve the filled output. 

---

## 🛠  Additional Highlights

- **Cancel / Priority Queue** – Manage long-running AI tasks, cancel jobs, or reprioritise them on the fly.
- **Extensible Prompts & Agents** – Modular design allows custom prompt engineering and specialised agents (translation, filler, chatbot, etc.).
- **Electron Front-End** – Desktop-class experience with offline support, drag-and-drop, and dark/light themes.
- **Type-Safe API Client** – Shared typed client for seamless integration between the Electron UI and FastAPI backend.

---

## 🚧 Roadmap (Preview)

- Batch processing for large form sets.
- Fine-grained role-based access control.
- Cloud sync & collaboration spaces.

## 2. High-Level Architecture

EasyForm is a cross-platform desktop application designed for privacy-conscious, offline-first automated form filling, document translation with an offline chatbot knowing your personal info to help you fill the forms that the app cannot automatically fill. Its architecture is split into two main components:

1. **Frontend**: An Electron application built with React, TypeScript, and Vite. It provides the user interface for selecting context documents, uploading forms, reviewing changes, and interacting with a chatbot for complex cases.
2. **Backend**: A Python server powered by FastAPI. It exposes a REST API that handles all the heavy lifting, including **document processing, text extraction, LLM-based analysis, and form filling.**

This client-server architecture was chosen to separate the UI from the complex business logic, allowing each part to be developed and maintained independently.

![](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F6032888%2F872b8aec7bbe01b27208013b6b513c5f%2FUntitled%20diagram%20_%20Mermaid%20Chart-2025-07-23-142154.png?generation=1753280557950897&alt=media)

## 3. The Role of Gemma 3 and Ollama

Our choice of **Gemma 3** via **Ollama** was deliberate and central to the project's goals of privacy and offline functionality.

- **Privacy-First**: By running the model locally with Ollama, we ensure that the user's sensitive documents and personal information never leave their machine.
- **Cost-Effective**: There are no API costs associated with inference.
- **Specialized Tasks**: Gemma 3 is used for several key NLP tasks:
  1. **Context Extraction**: Parsing raw text from documents to create a structured JSON of the user's information.
  2. **Pattern Recognition**: Identifying what constitutes a "placeholder" in a given form.
  3. **Semantic Mapping**: Matching form labels (e.g., "Last Name") to the correct keys in the context data (e.g., `last_name`).
  4. **Decision Making**: Determining which checkbox should be ticked based on the associated label and context.

## 4. Challenges and Solutions

We faced several technical hurdles during development. Here’s how we overcame them:

### Backend Challenges

- **Challenge**: The LLM would often hallucinate or incorrectly identify placeholders, leading to corrupted output files.
- **Solution**: We developed a robust algorithm in `pattern_detection.py`. It uses the LLM to get a _list_ of potential placeholder candidates. We then use statistical analysis and heuristics to filter this list down, creating a highly precise regex pattern that ensures we only match actual placeholders. This strikes a balance between detecting most fields (around 80% coverage) and maintaining high precision.

- **Challenge**: Extracting relevant information from a large corpus of user documents is difficult.
- **Solution**: We implemented a lazy mining strategy. First, our `context_extractor` creates a baseline JSON of common personal information. Then, during the form-filling process, if the LLM determines a required piece of information is missing (e.g., a "Social Security Number" key doesn't exist), it triggers a targeted search across the raw text of the context documents to find that specific value.

- **Challenge**: The filled forms needed to preserve the original layout, fonts, and styling.
- **Solution**: Instead of generating a new document from scratch, we use a "find and replace" approach. For DOCX files (`docx_filler.py`), we directly manipulate the XML. For PDFs (`pdf_filler.py`), we use `PyMuPDF` to find the coordinates of the placeholders, redact them, and overlay the new text in the same position, ensuring the final document is visually identical to the original.

- **Challenge**: Gemma 3n on Ollama and other pure NLP models cannot process images or scanned PDFs.
- **Solution**: We integrated a lightweight, 2-billion-parameter OCR model (`benhaotang/Nanonets-OCR-s`) into our Ollama setup. The backend first checks if a file contains a text layer. If not, it routes the file through the OCR model to extract the text before passing it to Gemma 3.

- **Challenge**: The total text from a large context directory could exceed Gemma 3's context window.
- **Solution**: We chunk the problem. The context data is extracted and saved to disk first. When processing a form, the LLM is prompted with only the text from a single "entry" (a few lines of the form) at a time, along with the full structured context data. This keeps each individual prompt small and well within the model's limits.

- **Challenge**: Gemma 3 (via Ollama) does not support tool use for dynamically updating its knowledge.
- **Solution**: We manage the "knowledge" externally. The extracted context is passed into the system prompt for every API call. When a user manually edits a field in the frontend, the updated value is sent to the backend, which saves it back to the `context_data.json` file. The next LLM call will then automatically have this updated knowledge in its system prompt.

- **Challenge**: Ensuring the LLM consistently returns JSON in the specified format is notoriously difficult.
- **Solution**: We heavily leverage Pydantic models to define the desired output schemas (`output_schemas.py`). We then use the `ollama-python` library's integration with `llama.cpp` grammars. By providing a grammar generated from our Pydantic model, we force the LLM to generate a response that is guaranteed to be valid JSON conforming to our schema.

- **Challenge**: When multiple LLM tasks run at the same time, the user interface can become slow or unresponsive.
- **Solution**: We built a priority queue system that makes sure LLM requests triggered by the user's current actions in the UI are handled first. We also reserve one CPU core just for these high-priority tasks, so the app always stays responsive even if other background LLM jobs are running.

### Frontend Challenges

- **Challenge**: No single tool can reliably detect and fill every type of form, especially scanned PDFs without a text layer or with highly complex layouts.
- **Solution**: We adopted a hybrid approach. The application first attempts the automated filling pipeline. If it detects that a form is too complex (e.g., no placeholders are found), it gracefully degrades to a "Form Filling Assistant". This is a chat interface (`Chat.tsx`) where the user can converse with the LLM, which has access to their context data, to get help filling the form manually.

- **Challenge**: When a user manually edits a suggested change, we must prevent them from accidentally deleting or modifying parts of the original line that are not placeholders.
- **Solution**: We implemented a validation algorithm in the `updateChange` function on the frontend. When a user saves a manual edit, we compare the original line with the new line. Using the known placeholder pattern, we extract the filled values and verify that the non-placeholder text in the line remains unchanged. If it has been modified, the change is rejected, and the user is prompted to only edit the placeholder content.

- **Challenge:** Form can either contain text placeholder (`....` or `____`) or interactive input for user to fill in and we must have seamlessly UX for manual editing.
- **Solution:** 
  - For interactive widgets, we put hooks into the `<input>` element generated by `pdf.js` then send form fill and key update to the backend when the input is unfocused.
  - For text placeholders, we have a list of fill entries on the left.

## 5. Justification of Technical Choices

- **Python & FastAPI**: Chosen for the backend due to Python's extensive ecosystem for data science and machine learning (e.g., `pydantic`, `PyMuPDF`, `python-docx`) and FastAPI's high performance and automatic generation of OpenAPI documentation, which simplified frontend integration.
- **Electron & React**: Chosen for the frontend to deliver a cross-platform desktop application with a modern, web-based UI. This allowed us to leverage the vast React ecosystem for components and tooling.
- **Ollama**: The cornerstone of our privacy-first approach, enabling local, on-device LLM inference without relying on cloud providers.
