import argparse
import requests
import os

API_URL = os.environ.get("EASYFORM_API_URL", "http://localhost:8000")


def list_sessions():
    resp = requests.post(f"{API_URL}/chat/sessions/list", json={"context_dir": None})
    resp.raise_for_status()
    return resp.json()["sessions"]


def create_session(context_dir, name=None, provider=None):
    payload = {"context_dir": context_dir}
    if name:
        payload["name"] = name
    if provider:
        payload["provider"] = provider
    resp = requests.post(f"{API_URL}/chat/sessions/create", json=payload)
    resp.raise_for_status()
    return resp.json()["session"]


def delete_session(session_id):
    resp = requests.post(
        f"{API_URL}/chat/sessions/delete",
        json={"context_dir": None, "session_id": session_id},
    )
    resp.raise_for_status()
    return resp.json()["success"]


def send_message(context_dir, session_id, user_input, provider=None):
    payload = {
        "context_dir": context_dir,
        "session_id": session_id,
        "user_input": user_input,
    }
    if provider:
        payload["provider"] = provider
    resp = requests.post(f"{API_URL}/chat/messages/send", json=payload)
    resp.raise_for_status()
    return resp.json()["response"], resp.json()["session"]


def update_context_dir(session_id, new_context_dir, old_context_dir=None):
    payload = {"session_id": session_id, "new_context_dir": new_context_dir}
    if old_context_dir:
        payload["old_context_dir"] = old_context_dir
    resp = requests.post(f"{API_URL}/chat/sessions/update-context-dir", json=payload)
    resp.raise_for_status()
    return resp.json()["session"]


def main():
    parser = argparse.ArgumentParser(description="EasyForm Chatbot API Client")
    parser.add_argument(
        "--contextDir",
        required=False,
        help="Root context directory of EasyForm project.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List all saved chat sessions")

    p_new = subparsers.add_parser("new", help="Create a new chat session")
    p_new.add_argument("--name", "-n", help="Human-readable session name", default=None)
    p_new.add_argument("--provider", help="LLM provider", default=None)
    p_new.add_argument(
        "--contextDir",
        required=True,
        help="Root context directory of EasyForm project.",
    )

    p_chat = subparsers.add_parser(
        "chat", help="Enter an existing session (ID or name)"
    )
    p_chat.add_argument("session_id", help="Session ID or name")
    p_chat.add_argument("--provider", help="Override provider", default=None)
    p_chat.add_argument(
        "--contextDir",
        required=True,
        help="Root context directory of EasyForm project.",
    )

    p_del = subparsers.add_parser("delete", help="Delete a session by ID or name")
    p_del.add_argument("session_id", help="Session ID or name")

    p_update_ctx = subparsers.add_parser(
        "update-context-dir", help="Update context_dir for a session"
    )
    p_update_ctx.add_argument("session_id", help="Session ID or name")
    p_update_ctx.add_argument("new_context_dir", help="New context directory")
    p_update_ctx.add_argument(
        "--old_context_dir", help="Old context directory", default=None
    )

    args = parser.parse_args()

    if args.command == "list":
        sessions = list_sessions()
        if not sessions:
            print("No chat sessions found.")
            return
        print("Existing chat sessions:")
        for s in sessions:
            print(
                f"  {s['id']}  | {s['name']}  | {s.get('provider')}  | {s['created_at']}  | {len(s['messages'])} msgs"
            )

    elif args.command == "new":
        sess = create_session(args.contextDir, args.name, args.provider)
        print(
            f"Created new session '{sess['name']}' with ID {sess['id']} using provider '{sess.get('provider')}'."
        )

    elif args.command == "delete":
        ok = delete_session(args.session_id)
        print("Deleted session." if ok else "Session not found.")

    elif args.command == "update-context-dir":
        sess = update_context_dir(
            args.session_id, args.new_context_dir, args.old_context_dir
        )
        print(f"Session '{sess['id']}' context_dir updated to {sess['context_dir']}")

    elif args.command == "chat":
        # Try to find session
        sessions = list_sessions()
        sess = next(
            (
                s
                for s in sessions
                if s["id"] == args.session_id or s["name"] == args.session_id
            ),
            None,
        )
        if not sess:
            print(
                f"Session '{args.session_id}' not found. Create new? [y/N] ",
                end="",
                flush=True,
            )
            choice = input().strip().lower()
            if choice != "y":
                return
            sess = create_session(args.contextDir, args.session_id, args.provider)
        else:
            # Optionally update context_dir if different
            if os.path.abspath(sess.get("context_dir") or "") != os.path.abspath(
                args.contextDir
            ):
                sess = update_context_dir(
                    sess["id"], args.contextDir, sess.get("context_dir")
                )

        print(
            f"Entering chat session '{sess['name']}' (ID: {sess['id']}, provider: {sess.get('provider')})"
        )
        print(
            "Type '/exit' to quit, '/history' to show conversation, '/delete' to delete this session and exit."
        )
        while True:
            try:
                user_in = input(">>> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                user_in = "/exit"
            if not user_in:
                continue
            if user_in.lower() in {"/exit", "exit", ":q", "quit"}:
                print("Session ended. Bye!")
                break
            if user_in.lower() in {"/history", "history"}:
                for m in sess["messages"]:
                    if m["role"] == "user":
                        print(f"YOU: {m['content']}")
                    else:
                        print(f"BOT: {m['content']}")
                continue
            if user_in.lower() in {"/delete", "delete"}:
                ok = delete_session(sess["id"])
                print(
                    "Session deleted. Bye!" if ok else "Failed to delete session file."
                )
                break
            response, sess = send_message(
                args.contextDir, sess["id"], user_in, args.provider
            )
            print(f"BOT: {response}")


if __name__ == "__main__":
    main()
