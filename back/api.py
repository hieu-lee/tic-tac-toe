from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Tuple, Literal
from types import SimpleNamespace
import re
import os
from fastapi.middleware.cors import CORSMiddleware

# Cancellation helper
from .cancel_manager import cancel as cancel_form, is_cancelled

from .filler_agent.text_utils import extract_form_text, is_interactive_pdf
from .filler_agent.pattern_detection import detect_placeholder_patterns
from .filler_agent.fill_processor import (
    detect_fill_entries,
    process_fill_entries,
    FillEntry,
)
from .filler_agent.checkbox_processor import CheckboxEntry, detect_checkbox_entries
from .context_extraction.context_extractor import extract_context
from .context_extraction.context_extractor import context_read, context_add
from .filler_agent.docx_filler import fill_docx_with_entries

# PDF filling helpers
from .filler_agent.pdf_filler import (
    fill_pdf as fill_pdf_auto,
    fill_interactive_pdf,
    fill_pdf_with_entries,
    save_interactive_pdf,
)
from .chatbot.core import (
    list_sessions,
    create_session,
    load_session,
    save_session,
    delete_session,
    send_message,
    set_form_paths,
    ChatSession,
    ChatMessage,
)

# Translation processor
from .translation_agent.translation_processor import translate_file

app = FastAPI(title="EasyForm Backend API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

from fastapi.responses import JSONResponse

# Custom handler to suppress noisy stack traces for expected LLM cancellations
@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    if str(exc) == "LLM task cancelled":
        return JSONResponse(status_code=200, content={"cancelled": True})
    raise exc
# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class FillEntrySchema(BaseModel):
    lines: str
    number_of_fill_spots: int
    context_keys: List[Optional[str]]
    filled_lines: str = ""

    @classmethod
    def from_dataclass(cls, entry: FillEntry) -> "FillEntrySchema":
        return cls(
            lines=entry.lines,
            number_of_fill_spots=entry.number_of_fill_spots,
            context_keys=entry.context_keys,
            filled_lines=entry.filled_lines,
        )

    def to_dataclass(self) -> FillEntry:
        return FillEntry(
            lines=self.lines,
            number_of_fill_spots=self.number_of_fill_spots,
            context_keys=self.context_keys,
            filled_lines=self.filled_lines,
        )


class CheckboxEntrySchema(BaseModel):
    lines: str
    checkbox_positions: List[Tuple[int, int]]
    checkbox_values: List[str]
    context_key: Optional[str] = None
    checked_indices: List[int] = []

    @classmethod
    def from_dataclass(cls, entry: "CheckboxEntry") -> "CheckboxEntrySchema":
        return cls(
            lines=entry.lines,
            checkbox_positions=entry.checkbox_positions,
            checkbox_values=entry.checkbox_values,
            context_key=entry.context_key,
            checked_indices=entry.checked_indices or [],
        )

    def to_dataclass(self) -> "CheckboxEntry":
        from .filler_agent.checkbox_processor import (
            CheckboxEntry,
        )  # local import to avoid circular dependency

        return CheckboxEntry(
            lines=self.lines,
            checkbox_positions=self.checkbox_positions,
            checkbox_values=self.checkbox_values,
            context_key=self.context_key,
            checked_indices=self.checked_indices,
        )


class FillDocxRequest(BaseModel):
    """Request payload for /docx/fill endpoint. All placeholder detection must have been done client-side.
    We simply receive the pre-computed fill entries and checkbox entries along with paths.
    """

    fill_entries: List[FillEntrySchema]
    checkbox_entries: List[CheckboxEntrySchema]
    form_path: str
    output_path: Optional[str] = None


class FillDocxResponse(BaseModel):
    output_path: str


class FillPdfRequest(BaseModel):
    fill_entries: List[FillEntrySchema]
    checkbox_entries: List[CheckboxEntrySchema] = (
        []
    )  # Currently ignored but accepted for symmetry
    form_path: str
    context_dir: Optional[str] = None  # Added to support interactive PDF filling
    output_path: Optional[str] = None


class FillPdfResponse(BaseModel):
    output_path: str


class FillInteractivePdfRequest(BaseModel):
    """Request payload for filling an *interactive* PDF form (AcroForm text widgets).

    The backend will automatically map each text field to the best matching
    context key and populate the field with the associated value.  If the PDF
    does **not** contain any interactive widgets, the request will fail – use
    ``FillPdfDynamicRequest`` instead for the generic (interactive *or* flat)
    auto-fill endpoint.
    """

    form_path: str
    context_dir: str
    provider: Optional[
        Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]
    ] = None
    output_path: Optional[str] = None


class FillInteractivePdfResponse(BaseModel):
    output_path: str


class FillPdfDynamicRequest(BaseModel):
    """Request payload for auto-filling a PDF (interactive or flat).

    • *keys* – list of **available** context keys (read from the frontend)
      which helps the LLM when the file is a flat PDF without structured
      widgets.
    • *pattern* – regex pattern string that matches the placeholder style used
      in the flat PDF variant (ignored for interactive PDFs).
    """

    keys: List[str]
    form_path: str
    context_dir: str
    pattern: str  # regex pattern for placeholders (flat PDFs)
    provider: Optional[
        Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]
    ] = None
    output_path: Optional[str] = None


class FillPdfDynamicResponse(BaseModel):
    output_path: str
    

# --- New models for saving interactive PDFs ---
class PdfWidgetSchema(BaseModel):
    field_name: str
    field_value: Optional[str] = None
    field_label: Optional[str] = None


class SaveInteractivePdfRequest(BaseModel):
    form_path: str
    widgets: List[PdfWidgetSchema]


class SaveInteractivePdfResponse(BaseModel):
    output_path: str


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class ExtractFormTextRequest(BaseModel):
    form_path: str


class ExtractFormTextResponse(BaseModel):
    text: str
    is_interactive: bool


class DetectPatternRequest(BaseModel):
    text: str
    is_interactive: bool = False


class DetectPatternResponse(BaseModel):
    pattern: str  # regex pattern string


class DetectFillEntriesRequest(BaseModel):
    lines: List[str]
    pattern: str  # regex pattern string


class DetectFillEntriesResponse(BaseModel):
    entries: List[FillEntrySchema]


class ProcessFillEntriesRequest(BaseModel):
    entries: List[FillEntrySchema]
    context_dir: str
    form_path: str
    pattern: str
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]


class ProcessFillEntriesResponse(BaseModel):
    entries: List[FillEntrySchema]
    missing_keys: List[str]


class ReadContextRequest(BaseModel):
    context_dir: str


class ReadContextResponse(BaseModel):
    context: dict


class AddContextRequest(BaseModel):
    context_dir: str
    key: str
    value: str


class AddContextResponse(BaseModel):
    context: dict


class DetectCheckboxEntriesRequest(BaseModel):
    lines: List[str]


class DetectCheckboxEntriesResponse(BaseModel):
    entries: List[CheckboxEntrySchema]


class ProcessCheckboxEntriesRequest(BaseModel):
    entries: List[CheckboxEntrySchema]
    context_dir: str
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]


class ProcessCheckboxEntriesResponse(BaseModel):
    entries: List[CheckboxEntrySchema]


class ExtractContextRequest(BaseModel):
    context_dir: str
    provider: Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]


class ExtractContextResponse(BaseModel):
    context: dict


class ChatMessageSchema(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    image_path: Optional[str] = None

    @classmethod
    def from_dataclass(cls, msg: ChatMessage) -> "ChatMessageSchema":
        return cls(role=msg.role, content=msg.content, image_path=msg.image_path)


class ChatSessionSchema(BaseModel):
    id: str
    name: str
    provider: Optional[str] = None
    context_dir: Optional[str] = None
    system_prompt: Optional[str] = None
    created_at: str
    messages: List[ChatMessageSchema] = []

    @classmethod
    def from_dataclass(cls, sess: ChatSession) -> "ChatSessionSchema":
        return cls(
            id=sess.id,
            name=sess.name,
            provider=sess.provider,
            context_dir=sess.context_dir,
            system_prompt=sess.system_prompt,
            created_at=sess.created_at,
            messages=[ChatMessageSchema.from_dataclass(m) for m in sess.messages],
        )


class ListChatSessionsResponse(BaseModel):
    sessions: List[ChatSessionSchema]


class CreateChatSessionRequest(BaseModel):
    context_dir: str
    name: Optional[str] = None
    provider: Optional[str] = None


class CreateChatSessionResponse(BaseModel):
    session: ChatSessionSchema


class DeleteChatSessionRequest(BaseModel):
    context_dir: str
    session_id: str


class DeleteChatSessionResponse(BaseModel):
    success: bool


class SendMessageRequest(BaseModel):
    context_dir: str
    session_id: str
    user_input: str
    provider: Optional[str] = None
    image_path: Optional[str] = None


class SendMessageResponse(BaseModel):
    response: str
    session: ChatSessionSchema


# ---------------------------------------------------------------------------
# Translation endpoint schemas
# ---------------------------------------------------------------------------


class TranslateFileRequest(BaseModel):
    file_path: str
    language: str  # target language
    provider: Optional[
        Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]
    ] = None


class TranslateFileResponse(BaseModel):
    output_path: str

# Insert new models for interactive PDF check
class IsInteractiveRequest(BaseModel):
    form_path: str

class IsInteractiveResponse(BaseModel):
    is_interactive: bool

# ----------------------- Cancellation ----------------------------
class CancelFormRequest(BaseModel):
    form_path: str


class CancelFormResponse(BaseModel):
    success: bool


# --- New endpoint to update context_dir of a session ---
class UpdateContextDirRequest(BaseModel):
    session_id: str
    new_context_dir: str
    old_context_dir: str | None = None  # If not provided, will look in new_context_dir


class UpdateContextDirResponse(BaseModel):
    session: ChatSessionSchema
    old_context_dir: str | None = None
    new_context_dir: str


# --- New endpoint to update form_paths of a session ---


class UpdateFormPathsRequest(BaseModel):
    session_id: str
    form_paths: List[str]


class UpdateFormPathsResponse(BaseModel):
    session: ChatSessionSchema
    form_paths: List[str]


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@app.post("/form/cancel", response_model=CancelFormResponse)
def api_cancel_form(req: CancelFormRequest):
    """Register cancellation for *form_path* so subsequent tasks abort early."""
    cancel_form(req.form_path)
    return CancelFormResponse(success=True)


@app.post("/form/text", response_model=ExtractFormTextResponse)
def api_extract_form_text(req: ExtractFormTextRequest):
    # If the form was previously cancelled, clear the flag and continue
    if is_cancelled(req.form_path):
        from .cancel_manager import clear as _clear_cancel
        _clear_cancel(req.form_path)
    text = extract_form_text(req.form_path)
    is_interactive = is_interactive_pdf(req.form_path)
    return ExtractFormTextResponse(text=text, is_interactive=is_interactive)


@app.post("/pattern/detect", response_model=DetectPatternResponse)
def api_detect_pattern(req: DetectPatternRequest):
    pattern = detect_placeholder_patterns(req.text, req.is_interactive)
    return DetectPatternResponse(pattern=pattern.pattern)


@app.post("/fill-entries/detect", response_model=DetectFillEntriesResponse)
def api_detect_fill_entries(req: DetectFillEntriesRequest):
    entries = detect_fill_entries(req.lines, re.compile(req.pattern))
    entries_schema = [FillEntrySchema.from_dataclass(e) for e in entries]
    return DetectFillEntriesResponse(entries=entries_schema)


@app.post("/fill-entries/process", response_model=ProcessFillEntriesResponse)
def api_process_fill_entries(req: ProcessFillEntriesRequest):
    dataclass_entries = [e.to_dataclass() for e in req.entries]
    processed_entries, missing_keys = process_fill_entries(
        dataclass_entries,
        req.context_dir,
        req.form_path,
        re.compile(req.pattern),
        req.provider,
    )
    processed_schema = [FillEntrySchema.from_dataclass(e) for e in processed_entries]
    return ProcessFillEntriesResponse(
        entries=processed_schema, missing_keys=missing_keys
    )


@app.post("/context/read", response_model=ReadContextResponse)
def api_read_context(req: ReadContextRequest):
    data = context_read(req.context_dir)
    return ReadContextResponse(context=data)


@app.post("/context/add", response_model=AddContextResponse)
def api_add_context(req: AddContextRequest):
    data = context_add(req.context_dir, req.key, req.value)
    return AddContextResponse(context=data)


@app.post("/checkbox-entries/detect", response_model=DetectCheckboxEntriesResponse)
def api_detect_checkbox_entries(req: DetectCheckboxEntriesRequest):
    entries = detect_checkbox_entries(req.lines)
    entries_schema = [CheckboxEntrySchema.from_dataclass(e) for e in entries]
    return DetectCheckboxEntriesResponse(entries=entries_schema)


@app.post("/checkbox-entries/process", response_model=ProcessCheckboxEntriesResponse)
def api_process_checkbox_entries(req: ProcessCheckboxEntriesRequest):
    from .filler_agent.checkbox_processor import (
        process_checkbox_entries,
    )  # local import to avoid heavy import at startup

    dataclass_entries = [e.to_dataclass() for e in req.entries]
    processed_entries = process_checkbox_entries(
        dataclass_entries, req.context_dir, req.provider
    )
    processed_schema = [
        CheckboxEntrySchema.from_dataclass(e) for e in processed_entries
    ]
    return ProcessCheckboxEntriesResponse(entries=processed_schema)


@app.post("/context/extract", response_model=ExtractContextResponse)
def api_extract_context(req: ExtractContextRequest):
    # Extract context data from the provided directory
    os.makedirs(req.context_dir, exist_ok=True)
    data = extract_context(req.context_dir, req.provider)
    return ExtractContextResponse(context=data)


@app.post(
    "/docx/fill",
    response_model=FillDocxResponse,
    summary="Fill a DOCX form using pre-computed placeholder & checkbox entries",
    description=(
        "Takes the raw `form_path` to a DOCX template, a list of pre-processed `FillEntry` objects\n"
        "(each with its `filled_lines` already populated) and `CheckboxEntry` objects indicating which\n"
        "checkbox indices should be checked. No placeholder or checkbox pattern detection is executed\n"
        "server-side — the entries must be prepared on the client. The filled document is written to\n"
        "`output_path` (or '<form>_filled.docx' beside the original) and the absolute path is returned."
    ),
)
def api_fill_docx(req: FillDocxRequest):
    if is_cancelled(req.form_path):
        raise HTTPException(status_code=409, detail="Form processing cancelled")
    dataclass_entries = [e.to_dataclass() for e in req.fill_entries]
    dataclass_checkboxes = [c.to_dataclass() for c in req.checkbox_entries]
    out_path = fill_docx_with_entries(
        dataclass_entries, dataclass_checkboxes, req.form_path, req.output_path
    )
    return FillDocxResponse(output_path=out_path)


@app.post(
    "/pdf/fill",
    response_model=FillPdfResponse,
    summary="Fill a PDF form using pre-computed placeholder & checkbox entries",
    description=(
        "Similar to `/docx/fill` but for PDF files. Interactive AcroForm fields are attempted first; if the\n"
        "PDF is flat, text overlay is used. Checkbox entries are currently ignored (no overlay support yet)\n"
        "but accepted for forward compatibility. Output path mirrors DOCX behaviour."
    ),
)
def api_fill_pdf(req: FillPdfRequest):
    if is_cancelled(req.form_path):
        raise HTTPException(status_code=409, detail="Form processing cancelled")
    dataclass_entries = [e.to_dataclass() for e in req.fill_entries]
    dataclass_checkboxes = [c.to_dataclass() for c in req.checkbox_entries]
    out_path = fill_pdf_with_entries(
        dataclass_entries, dataclass_checkboxes, req.form_path, req.output_path,
        context_dir=req.context_dir
    )
    return FillPdfResponse(output_path=out_path)


@app.post(
    "/pdf/fill-interactive",
    response_model=FillInteractivePdfResponse,
    summary="Auto-fill an interactive (AcroForm) PDF file",
    description=(
        "Detects all text widgets in the PDF, infers the most relevant context "
        "key for each widget label and fills the field with its value from "
        "`context_dir`. If the PDF contains *no* interactive widgets, consider "
        "using `/pdf/fill-dynamic` instead."
    ),
)
def api_fill_interactive_pdf(req: FillInteractivePdfRequest):
    if is_cancelled(req.form_path):
        raise HTTPException(status_code=409, detail="Form processing cancelled")
    out_path = fill_interactive_pdf(
        req.form_path,
        req.context_dir,
        req.output_path,
        req.provider,
    )

    return FillInteractivePdfResponse(output_path=out_path)


@app.post(
    "/pdf/fill-dynamic",
    response_model=FillPdfDynamicResponse,
    summary="Auto-fill a PDF (interactive or flat) in a single call",
    description=(
        "Automatically determines whether the PDF contains interactive form "
        "fields. If yes, fields are filled similarly to `/pdf/fill-interactive`. "
        "Otherwise, placeholder detection and replacement is performed using "
        "the provided `keys` and `pattern`."
    ),
)
def api_fill_dynamic_pdf(req: FillPdfDynamicRequest):
    if is_cancelled(req.form_path):
        raise HTTPException(status_code=409, detail="Form processing cancelled")

    out_path = fill_pdf_auto(
        req.keys,
        req.form_path,
        req.context_dir,
        req.output_path,
        re.compile(req.pattern),
        req.provider or "openai",
    )

    return FillPdfDynamicResponse(output_path=out_path)

# Insert new endpoint for is_interactive
@app.post("/pdf/is-interactive", response_model=IsInteractiveResponse)
def api_is_interactive(req: IsInteractiveRequest):
    """Check whether a PDF contains interactive AcroForm fields."""
    is_interactive = is_interactive_pdf(req.form_path)
    return IsInteractiveResponse(is_interactive=is_interactive)


# ---------------------------------------------------------------------------
# Save Interactive PDF endpoint
# ---------------------------------------------------------------------------
@app.post(
    "/pdf/save-interactive",
    response_model=SaveInteractivePdfResponse,
    summary="Save updated widget values in an interactive PDF",
    description=(
        "Iterates through widgets in *form_path*, updating each field with the "
        "attributes provided in `widgets` (matched by `field_name`). The PDF is "
        "saved in-place and the absolute path is returned."
    ),
)
def api_save_interactive_pdf(req: SaveInteractivePdfRequest):
    if is_cancelled(req.form_path):
        raise HTTPException(status_code=409, detail="Form processing cancelled")

    # Convert incoming dictionaries to lightweight objects with attribute access
    widget_objs = [SimpleNamespace(**w.dict()) for w in req.widgets]
    out_path = save_interactive_pdf(req.form_path, widget_objs)
    return SaveInteractivePdfResponse(output_path=out_path)


@app.post("/chat/sessions/list", response_model=ListChatSessionsResponse)
def api_list_chat_sessions():
    sessions = list_sessions()
    return ListChatSessionsResponse(
        sessions=[ChatSessionSchema.from_dataclass(s) for s in sessions]
    )


@app.post("/chat/sessions/create", response_model=CreateChatSessionResponse)
def api_create_chat_session(req: CreateChatSessionRequest):
    sess = create_session(req.name, req.context_dir)
    if req.provider:
        sess.provider = req.provider
        save_session(sess)
    return CreateChatSessionResponse(session=ChatSessionSchema.from_dataclass(sess))


@app.post("/chat/sessions/delete", response_model=DeleteChatSessionResponse)
def api_delete_chat_session(req: DeleteChatSessionRequest):
    success = delete_session(req.session_id)
    return DeleteChatSessionResponse(success=success)


@app.post("/chat/messages/send", response_model=SendMessageResponse)
def api_send_chat_message(req: SendMessageRequest):
    sess = load_session(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    response_text = send_message(
        sess, req.user_input, req.provider, image_path=req.image_path
    )
    save_session(sess)
    return SendMessageResponse(
        response=response_text,
        session=ChatSessionSchema.from_dataclass(sess),
    )


@app.post("/chat/sessions/update-context-dir", response_model=UpdateContextDirResponse)
def api_update_chat_session_context_dir(req: UpdateContextDirRequest):
    sess = load_session(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    old_context_dir = sess.context_dir
    sess.context_dir = req.new_context_dir
    if old_context_dir != req.new_context_dir:
        save_session(sess)
    return UpdateContextDirResponse(
        session=ChatSessionSchema.from_dataclass(sess),
        old_context_dir=old_context_dir,
        new_context_dir=req.new_context_dir,
    )


@app.post("/chat/sessions/update-form-paths", response_model=UpdateFormPathsResponse)
def api_update_chat_session_form_paths(req: UpdateFormPathsRequest):
    """Update the list of form paths associated with a chat session.

    This delegates the persistence logic to ``set_form_paths`` in
    ``back.chatbot.core`` which updates the session object and persists it
    to disk. The updated session is returned so the frontend can refresh its
    state without making an additional request.
    """
    sess = load_session(req.session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update the form paths using core helper (persists the session)
    set_form_paths(sess, req.form_paths)

    return UpdateFormPathsResponse(
        session=ChatSessionSchema.from_dataclass(sess),
        form_paths=req.form_paths,
    )


# ---------------------------------------------------------------------------
# Translation endpoint
# ---------------------------------------------------------------------------


@app.post(
    "/translate",
    response_model=TranslateFileResponse,
    summary="Translate PDF/DOCX/Image file",
)
def api_translate_file(req: TranslateFileRequest):
    if is_cancelled(req.file_path):
        raise HTTPException(status_code=409, detail="File processing cancelled")
    out_path = translate_file(
        req.file_path,
        req.language,
        provider=req.provider or "openai",
    )
    return TranslateFileResponse(output_path=out_path)


@app.get("/health")
def health_check():
    return {"status": "ok"}
