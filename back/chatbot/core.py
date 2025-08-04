from __future__ import annotations
from ..context_extraction.context_extractor import (
    context_add,
    context_read,
    extract_context_from_form,
)

# Include TRANSLATE in PromptType enum
from .output_schemas import PromptType
from .prompts import system_prompt, response_for_query_value, response_for_update_value

# New: translation support
from ..translation_agent.translation_processor import translate_markdown
from ..context_extraction.context_extractor import mine_context_value

"""Core utilities for EasyForm chatbot sessions.

This module contains the data structures and helper functions used by the
`back.chatbot` CLI as well as any future GUI integrations.  All stateful
logic (session persistence, LLM prompt construction, etc.) lives here so the
CLI remains a thin wrapper around this API.
"""

import datetime as _dt
import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Literal, Any, Optional

from ..llm_client import (
    DEFAULT_PROVIDER,
    DEFAULT_MODELS,
    get_openai_client,
    get_groq_client,
    get_google_client,
    get_ollama_client,
)
from ..llm_priority_queue import get_llm_queue, Priority

import re  # Added for JSON cleaning


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

Role = Literal["user", "assistant"]


@dataclass
class ChatMessage:
    role: Role
    content: str
    # Optional path to an image attached to this message (relative or absolute)
    image_path: Optional[str] = None
    # Cached OCR text extracted from the image so we don't need to re-OCR on every request
    ocr_text: Optional[str] = None


@dataclass
class ChatSession:
    """A persistent multi-turn chat session.

    The *provider* field is optional; when ``None`` the CLI will use whichever
    provider the user specifies at runtime (or the global default).  This makes
    sessions provider-agnostic so that a user can reopen the same history with
    different LLM back-ends.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str = field(default_factory=lambda: f"Session {uuid.uuid4().hex[:8]}")
    provider: str | None = None
    # Root EasyForm project directory this session belongs to ("--contextDir" CLI arg)
    context_dir: str | None = None
    system_prompt: str | None = None
    form_paths: list[str] = field(default_factory=list)
    _form_paths_in_system_prompt: list[str] = field(default_factory=list)
    _forms_string: str = ""
    created_at: str = field(
        default_factory=lambda: _dt.datetime.now(_dt.timezone.utc).isoformat(
            timespec="seconds"
        )
    )
    messages: List[ChatMessage] = field(default_factory=list)

    # --------------- serialisation helpers ------------------
    def to_dict(self) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at,
            "messages": [asdict(m) for m in self.messages],
            # Persist additional session state so it survives reloads
            "form_paths": self.form_paths,
            "_forms_string": self._forms_string,
            "_form_paths_in_system_prompt": self._form_paths_in_system_prompt,
        }
        if self.system_prompt:
            data["system_prompt"] = self.system_prompt
        if self.provider:
            data["provider"] = self.provider
        if self.context_dir:
            data["context_dir"] = self.context_dir
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "ChatSession":
        sess = cls(
            id=data["id"],
            name=data["name"],
            provider=data.get("provider"),
            context_dir=data.get("context_dir"),
            created_at=data.get(
                "created_at",
                _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        sess.system_prompt = data.get("system_prompt")
        sess.messages = [ChatMessage(**m) for m in data.get("messages", [])]
        # Restore additional persisted state (fallback to defaults for older session files)
        sess.form_paths = data.get("form_paths", [])
        sess._forms_string = data.get("_forms_string", "")
        sess._form_paths_in_system_prompt = data.get("_form_paths_in_system_prompt", [])
        return sess


# ---------------------------------------------------------------------------
# File system helpers
# ---------------------------------------------------------------------------

_DEFAULT_SESS_DIR = os.path.join(os.path.expanduser("~"), ".EasyFormChatSessions")


def _ensure_dir() -> Path:
    p = Path(_DEFAULT_SESS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _session_file(session_id: str) -> Path:
    return Path(_DEFAULT_SESS_DIR) / f"{session_id}.json"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

SUPPORTED_PROVIDERS = list(DEFAULT_MODELS.keys())


def list_sessions() -> List[ChatSession]:
    d = _ensure_dir()
    sessions: List[ChatSession] = []
    for file in d.glob("*.json"):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            sessions.append(ChatSession.from_dict(data))
        except Exception:
            logging.warning("Skipping invalid session file %s", file)
    # Sort by creation time (oldest first)
    sessions.sort(key=lambda s: s.created_at)
    return sessions


def load_session(identifier: str) -> ChatSession | None:
    d = _ensure_dir()
    # Direct ID
    p = _session_file(identifier)
    if p.exists():
        try:
            return ChatSession.from_dict(json.loads(p.read_text(encoding="utf-8")))
        except Exception as exc:
            logging.error("Failed to load session %s: %s", p, exc)
            return None
    # Search by name (case-insensitive)
    for file in d.glob("*.json"):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("name", "").lower() == identifier.lower():
            return ChatSession.from_dict(data)
    return None


def save_session(session: ChatSession) -> None:
    _ = _ensure_dir()
    ctx_data = context_read(session.context_dir)
    ctx_data.pop("read_files", None)
    different_form_paths = [
        path
        for path in session._form_paths_in_system_prompt
        if path not in session.form_paths
    ]
    if not different_form_paths:
        new_form_paths = [
            path
            for path in session.form_paths
            if path not in session._form_paths_in_system_prompt
        ]
    else:
        new_form_paths = session.form_paths
        session._forms_string = ""
    session._form_paths_in_system_prompt = session.form_paths
    new_forms_string = (
        extract_context_from_form(new_form_paths) if new_form_paths else ""
    )
    session._forms_string += new_forms_string
    if session._forms_string == "":
        session._forms_string = extract_context_from_form(session.form_paths)
    default_prompt = system_prompt(ctx_data, session._forms_string)
    set_system_prompt(session, default_prompt)
    _session_file(session.id).write_text(
        json.dumps(session.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
    )


def delete_session(identifier: str) -> bool:
    _ = _ensure_dir()
    sess = load_session(identifier)
    if sess is None:
        return False
    _session_file(sess.id).unlink(missing_ok=True)
    return True


def create_session(
    name: str | None = None, context_dir: str | None = None
) -> ChatSession:
    sess = ChatSession(
        name=name or f"Session {uuid.uuid4().hex[:8]}", context_dir=context_dir
    )
    save_session(sess)
    return sess


# ---------------------------------------------------------------------------
# Internal LLM chat completion helper (replaces llm_client.query_gpt for chatbot)
# ---------------------------------------------------------------------------


def _chat_completion(messages: list[dict[str, str]], provider: str) -> str:
    """Call the chosen provider with *messages* in chat format.

    Supported providers: openai, groq, google, ollama.  Falls back to concatenated
    prompt if a provider lacks a chat interface.

    This function uses URGENT priority to ensure chatbot messages are processed first.
    """
    # Use the priority queue with URGENT priority for chat messages
    queue = get_llm_queue()
    future = queue.submit(
        _chat_completion_internal, messages, provider, priority=Priority.URGENT
    )
    return future.result()


def _chat_completion_internal(messages: list[dict[str, str]], provider: str) -> str:
    """Internal implementation of chat completion without priority queue."""

    model = DEFAULT_MODELS.get(provider, "")

    try:
        if provider == "openai":
            client = get_openai_client()
            if client is None:
                raise RuntimeError("OpenAI client not available")
            resp = client.chat.completions.create(model=model, messages=messages)
            return resp.choices[0].message.content or ""

        if provider == "groq":
            client = get_groq_client()
            if client is None:
                raise RuntimeError("Groq client not available")
            resp = client.chat.completions.create(model=model, messages=messages)
            return resp.choices[0].message.content or ""

        if provider == "google":
            genai = get_google_client()
            if genai is None:
                raise RuntimeError("Google GenAI client not available")
            system_prompt = (
                messages[0]["content"] if messages[0]["role"] == "system" else None
            )
            chat_model = genai.GenerativeModel(model, system_instruction=system_prompt)
            i = 0 if system_prompt is None else 1
            resp = chat_model.generate_content(
                [
                    {
                        "role": m["role"] if m["role"] == "user" else "model",
                        "parts": [m["content"]],
                    }
                    for m in messages[i:]
                ]
            )
            return resp.text

        if provider in {"ollama", "local"}:
            client = get_ollama_client()
            if client is None:
                raise RuntimeError("Ollama client not available")
            resp = client.chat(model=model, messages=messages, think=False)
            return resp["message"]["content"] or ""

        raise ValueError(f"Unsupported provider '{provider}'")

    except Exception as exc:  # noqa: WPS112 broader catch logged
        logging.error("LLM chat completion failed: %s", exc)
        return "[Error: LLM request failed]"


def send_message(
    session: ChatSession,
    user_input: str,
    provider: str | None = None,
    image_path: Optional[str] = None,
) -> str:
    """Append *user_input* to *session*, query LLM and store assistant reply.

    *provider* overrides the session-stored provider (or default) for this
    specific call.
    """
    eff_provider = provider or session.provider or DEFAULT_PROVIDER
    context_data = context_read(session.context_dir)
    ocr_text: Optional[str] = None  # will hold OCR if we have an image
    prompt_analysis = interpret_prompt(
        user_input,
        context_data,
        session.context_dir,
        provider=eff_provider,
    )
    if prompt_analysis.prompt_type == PromptType.OTHER:
        # Build message list for chat completion
        chat_messages: list[dict[str, str]] = []
        if session.system_prompt:
            chat_messages.append({"role": "system", "content": session.system_prompt})

        # Helper to transform stored ChatMessage → payload for LLM (adds OCR if present)
        def _msg_to_llm(m: ChatMessage) -> dict[str, str]:
            content = m.content
            if m.ocr_text:
                content += f"\n<IMAGE>{m.ocr_text}</IMAGE>"
            return {"role": m.role, "content": content}

        # Add previous history
        for m in session.messages:
            chat_messages.append(_msg_to_llm(m))

        # Current user message – may include image
        current_content = user_input
        if image_path:
            try:
                from ..context_extraction.context_extractor import extract_image

                ocr_text = extract_image(image_path)[1].strip()
            except Exception as exc:
                logging.error("OCR extraction failed: %s", exc)
                ocr_text = None
            if ocr_text:
                current_content += f"\n<IMAGE>{ocr_text}</IMAGE>"

        chat_messages.append({"role": "user", "content": current_content})

        try:
            response = _chat_completion(chat_messages, eff_provider)
        except Exception as exc:
            logging.error("LLM query failed: %s", exc)
            response = "[Error: LLM request failed]"
    elif prompt_analysis.prompt_type == PromptType.QUERY_VALUE:
        response = response_for_query_value(
            prompt_analysis.context_key, prompt_analysis.context_value
        )
    elif prompt_analysis.prompt_type == PromptType.UPDATE_VALUE:
        context_add(
            session.context_dir,
            prompt_analysis.context_key,
            prompt_analysis.context_value,
        )
        response = response_for_update_value(
            prompt_analysis.context_key, prompt_analysis.context_value
        )
    elif prompt_analysis.prompt_type == PromptType.TRANSLATE:
        translation_provider = (
            session.provider if session.provider else DEFAULT_PROVIDER
        )
        try:
            response = translate_markdown(
                session._forms_string,
                prompt_analysis.context_value,
                provider=translation_provider,
                from_chat=True,
            )
        except Exception as exc:
            logging.error("Translation failed: %s", exc)
            response = "[Error: translation failed]"
    session.messages.append(
        ChatMessage(
            role="user",
            content=user_input,
            image_path=image_path,
            ocr_text=ocr_text if image_path else None,
        )
    )
    session.messages.append(ChatMessage(role="assistant", content=response))
    return response


# ---------------------------------------------------------------------------
# Session editing helpers
# ---------------------------------------------------------------------------


def set_system_prompt(session: ChatSession, prompt: str) -> None:
    """Set or replace the system prompt for *session*."""
    session.system_prompt = prompt.strip()
    if session.messages and session.messages[0].role == "system":
        session.messages[0].content = prompt


def set_form_paths(session: ChatSession, form_paths: list[str]) -> None:
    """Set the form paths for the session."""
    need_to_update = False
    for path in form_paths:
        if path not in session.form_paths:
            need_to_update = True
            break
    if need_to_update:
        session.form_paths = form_paths
        save_session(session)


def pop_last_turn(session: ChatSession, n_turns: int = 1) -> None:
    """Remove *n_turns* (user+assistant pairs) from the end of *session*."""
    for _ in range(n_turns):
        # Remove assistant if present
        if session.messages and session.messages[-1].role == "assistant":
            session.messages.pop()
        # Remove user message preceding
        if session.messages and session.messages[-1].role == "user":
            session.messages.pop()


# ---------------------------------------------------------------------------
# Stateless helper – classify and interpret a single user prompt
# ---------------------------------------------------------------------------


@dataclass
class PromptAnalysis:
    """Return type for :pyfunc:`interpret_prompt`."""

    prompt_type: PromptType
    context_key: Optional[str] = None
    context_value: Optional[str] = None


def interpret_prompt(
    prompt: str,
    context_data: dict[str, Any] | None,
    context_dir: str,
    provider: str | None = None,
) -> PromptAnalysis:
    """Analyse *prompt* and return structured intent based on explicit commands."""
    import re

    if context_data is None:
        context_data = {}
    stripped = prompt.strip()
    # Check for \query command
    m = re.match(r"^/query\s+(.+)$", stripped)
    if m:
        key = m.group(1).strip().lower()
        value = context_data.get(key, mine_context_value(key, context_dir, provider, from_chat=True)[0])
        return PromptAnalysis(
            prompt_type=PromptType.QUERY_VALUE, context_key=key, context_value=value
        )
    # Check for \update command
    m2 = re.match(r'^/update\s+(?:"([^"]+)"|(\S+))\s+(.+)$', stripped)
    if m2:
        key = (m2.group(1) or m2.group(2)).strip().lower()
        value = m2.group(3).strip()
        context_add(context_dir, key, value)
        return PromptAnalysis(
            prompt_type=PromptType.UPDATE_VALUE, context_key=key, context_value=value
        )
    # Check for /translate command (exact match with target language)
    m3 = re.match(r"^/translate\s+(\S+)$", stripped)
    if m3:
        target_lang = m3.group(1).strip()
        return PromptAnalysis(
            prompt_type=PromptType.TRANSLATE,
            context_key="target_lang",
            context_value=target_lang,
        )
    return PromptAnalysis(prompt_type=PromptType.OTHER)
