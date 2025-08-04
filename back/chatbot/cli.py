#!/usr/bin/env python3
"""Interactive chatbot CLI for EasyForm.

This CLI allows users to create, list, enter and delete multi-turn chat
sessions with any of the LLM providers already supported by the EasyForm
backend (see back.llm_client).  A session persists the full conversation
history to disk so that users can resume at any time.

Example usage::

    # List existing sessions
    python -m back.chatbot.cli list

    # Start a brand-new session (will auto-generate an ID)
    python -m back.chatbot.cli new --name "First chat" --provider groq

    # Continue chatting inside an existing session (by ID or name)
    python -m back.chatbot.cli chat 3b9c88f2

    # Delete a session
    python -m back.chatbot.cli delete 3b9c88f2

All sub-commands accept ``--provider`` to override the default LLM provider
(that is remembered per session).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

# Use high-level chatbot core helpers instead of talking to llm_client directly
from .core import (
    SUPPORTED_PROVIDERS,
    create_session,
    list_sessions,
    load_session,
    save_session,
    delete_session,
    send_message,
    DEFAULT_PROVIDER,
)
from .core import ChatSession  # ensure type reference


# ---------------------------------------------------------------------------
# Sub-command implementations
# ---------------------------------------------------------------------------


def cmd_list(args: argparse.Namespace) -> None:
    sessions = list_sessions()
    if not sessions:
        print("No chat sessions found.")
        return
    print("Existing chat sessions:")
    for s in sessions:
        print(
            f"  {s.id}  | {s.name}  | {s.provider}  | {s.created_at}  | {len(s.messages)} msgs"
        )


def cmd_new(args: argparse.Namespace) -> None:
    sess = create_session(args.name, args.contextDir)
    print(
        f"Created new session '{sess.name}' with ID {sess.id} using provider '{sess.provider}'."
    )


# ============================= interactive chat ============================


def _print_intro(sess: ChatSession, provider: str) -> None:
    print("-" * 78)
    print(f"Entering chat session '{sess.name}' (ID: {sess.id}, provider: {provider})")
    print(
        "Type '/exit' to quit, '/history' to show conversation, '/delete' to delete this session and exit."
    )
    print(
        "New: use '/sendimg <image_path> <message>' to send a message with one image attachment."
    )
    print("-" * 78)


def _chat_loop(sess: ChatSession, sessions_dir: str | None, provider: str) -> None:
    # ANSI colors
    RESET = "\033[0m"
    CYAN = "\033[36m"
    GREEN = "\033[32m"
    BOLD = "\033[1m"

    _print_intro(sess, provider)
    while True:
        try:
            user_in = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):  # graceful Ctrl-D / Ctrl-C
            print()
            user_in = "/exit"
        if not user_in:
            continue
        if user_in.lower() in {"/exit", "exit", ":q", "quit"}:
            save_session(sess)
            print("Session saved. Bye!")
            break
        if user_in.lower() in {"/history", "history"}:
            for m in sess.messages:
                prefix = (
                    f"{BOLD}{CYAN}YOU{RESET}: "
                    if m.role == "user"
                    else f"{GREEN}BOT{RESET}: "
                )
                img_note = (
                    f" [image: {os.path.basename(m.image_path)}]"
                    if getattr(m, "image_path", None)
                    else ""
                )
                print(prefix + m.content + img_note)
            continue

        # --------------------------------------
        # /sendimg <path> <message text>
        # --------------------------------------
        if user_in.lower().startswith("/sendimg "):
            import shlex, os

            try:
                parts = shlex.split(user_in)
            except ValueError as exc:
                print(f"Error parsing command: {exc}")
                continue
            if len(parts) < 3:
                print("Usage: /sendimg <image_path> <message>")
                continue
            img_path = os.path.abspath(os.path.expanduser(parts[1]))
            message_text = " ".join(parts[2:])
            if not os.path.isfile(img_path):
                print(f"Image path '{img_path}' does not exist.")
                continue
            response = send_message(
                sess, user_input=message_text, provider=provider, image_path=img_path
            )
            print(f"{GREEN}{response}{RESET}")
            save_session(sess)
            continue
        if user_in.lower() in {"/delete", "delete"}:
            if delete_session(sess.id):
                print("Session deleted. Bye!")
            else:
                print("Failed to delete session file.")
            break

        # Append user message and query LLM
        response = send_message(sess, user_input=user_in, provider=provider)
        print(f"{GREEN}{response}{RESET}")
        save_session(sess)


def cmd_chat(args: argparse.Namespace) -> None:
    sess = load_session(args.session_id)
    if sess is None:
        # Offer to create new session with this name/ID
        print(
            f"Session '{args.session_id}' not found. Create new? [y/N] ",
            end="",
            flush=True,
        )
        choice = input().strip().lower()
        if choice != "y":
            return
        # Create new session inside the computed sessions directory
        sess = create_session(args.session_id, args.contextDir)
        # Persist chosen provider if the user supplied one
        if args.provider:
            sess.provider = args.provider
            save_session(sess)
    else:
        # If context_dir differs from the current --contextDir, update and save
        import os

        current_context_dir = os.path.abspath(args.contextDir)
        if (
            not sess.context_dir
            or os.path.abspath(sess.context_dir) != current_context_dir
        ):
            sess.context_dir = current_context_dir
            save_session(sess)

    current_provider = args.provider or DEFAULT_PROVIDER
    _chat_loop(sess, args.contextDir, current_provider)


def cmd_delete(args: argparse.Namespace) -> None:
    if delete_session(args.session_id):
        print("Deleted session.")
    else:
        logging.error("Session '%s' not found.", args.session_id)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main(argv: List[str] | None = None):
    parser = argparse.ArgumentParser(
        prog="chatbot",
        description="Interactive chatbot CLI for EasyForm (supports OpenAI, Groq, Google, AnythingLLM, local, ollama).",
    )
    parser.add_argument(
        "--contextDir",
        required=False,
        help=(
            "Root context directory of EasyForm project. Chat sessions are stored "
            "inside '<contextDir>/chat_sessions'. This argument is mandatory."
        ),
    )
    # Provider is a sub-command specific argument; keep CLI flexible by *not*
    # defining it as a global option (otherwise it must come before the
    # sub-command in the call order which is less intuitive for many users).
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")

    parser.add_argument(
        "--extractor_provider",
        choices=SUPPORTED_PROVIDERS,
        default="google",
        help="Provider used for context extraction when building default system prompt.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    subparsers.add_parser("list", help="List all saved chat sessions")

    # new
    p_new = subparsers.add_parser("new", help="Create a new chat session")
    p_new.add_argument("--name", "-n", help="Human-readable session name", default=None)
    p_new.add_argument("--provider", help="LLM provider", default=None)
    p_new.add_argument(
        "--contextDir",
        required=True,
        help="Root context directory of EasyForm project.",
    )

    # chat (enter existing or create on demand)
    p_chat = subparsers.add_parser(
        "chat", help="Enter an existing session (ID or name)"
    )
    p_chat.add_argument("session_id", help="Session ID or name")
    p_chat.add_argument(
        "--provider",
        choices=SUPPORTED_PROVIDERS,
        help="Temporarily override session provider for this run",
        default=None,
    )
    p_chat.add_argument(
        "--contextDir",
        required=True,
        help="Root context directory of EasyForm project.",
    )

    # delete
    p_del = subparsers.add_parser("delete", help="Delete a session by ID or name")
    p_del.add_argument("session_id", help="Session ID or name")

    # set-prompt
    p_prompt = subparsers.add_parser(
        "set-prompt", help="Set or view system prompt for a session"
    )
    p_prompt.add_argument("session_id", help="Session ID or name")
    p_prompt.add_argument(
        "--text", help="New system prompt text. Omit to view current prompt."
    )

    # pop
    p_pop = subparsers.add_parser(
        "pop", help="Remove last user+assistant turn(s) from a session"
    )
    p_pop.add_argument("session_id", help="Session ID or name")
    p_pop.add_argument(
        "--n", type=int, default=1, help="Number of turns to remove (default 1)"
    )

    p_update_ctx = subparsers.add_parser(
        "update-context-dir", help="Update context_dir for a session"
    )
    p_update_ctx.add_argument("session_id", help="Session ID or name")
    p_update_ctx.add_argument("new_context_dir", help="New context directory")
    p_update_ctx.add_argument(
        "--old_context_dir", help="Old context directory", default=None
    )

    args = parser.parse_args(argv)

    # ------------------------------------------------------------------
    # Derive actual sessions directory based on --contextDir (if given).
    # We keep using the attribute name 'sessionsDir' internally so that the
    # rest of the code requires minimal changes.
    # ------------------------------------------------------------------
    # No longer needed: sessions_dir is not used for storage

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)

    cmd_map = {
        "list": cmd_list,
        "new": cmd_new,
        "chat": cmd_chat,
        "delete": cmd_delete,
        "set-prompt": None,
        "pop": None,
    }

    if args.command == "set-prompt":
        from .core import load_session, save_session, set_system_prompt

        sess = load_session(args.session_id)
        if sess is None:
            logging.error("Session not found.")
            return
        if args.text:
            set_system_prompt(sess, args.text)
            save_session(sess)
            print("System prompt updated.")
        else:
            print(sess.system_prompt or "(no system prompt set)")
    elif args.command == "pop":
        from .core import load_session, save_session, pop_last_turn

        sess = load_session(args.session_id)
        if sess is None:
            logging.error("Session not found.")
            return
        pop_last_turn(sess, args.n)
        save_session(sess)
        print(f"Removed {args.n} turn(s).")
    elif args.command == "update-context-dir":
        from .core import load_session, save_session

        sess = load_session(args.session_id)
        if sess is None:
            logging.error("Session not found.")
            return
        new_context_dir = os.path.abspath(args.new_context_dir)
        if not os.path.exists(new_context_dir):
            logging.error("New context directory '%s' does not exist.", new_context_dir)
            return
        if (
            args.old_context_dir
            and os.path.abspath(args.old_context_dir) != sess.context_dir
        ):
            logging.warning(
                "Old context directory '%s' does not match current session context_dir '%s'. This might lead to unexpected behavior.",
                args.old_context_dir,
                sess.context_dir,
            )
        sess.context_dir = new_context_dir
        save_session(sess)
        print(
            f"Context directory updated for session '{sess.id}' to '{sess.context_dir}'."
        )
    else:
        cmd_fn = cmd_map[args.command]
        cmd_fn(args)


if __name__ == "__main__":
    main(sys.argv[1:])
