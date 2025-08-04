#!/usr/bin/env python3
import argparse
import logging
from ..llm_client import (
    get_openai_client,
    test_openai,
    get_ollama_client,
    test_ollama,
)
from .. import llm_client
from ..context_extraction.context_extractor import extract_context
import os
import json
from .form_filler import fill_in_form


def main():
    parser = argparse.ArgumentParser(
        prog="filler_agent",
        description="Extract personal information and fill forms using GPT-4.",
    )
    parser.add_argument(
        "--contextDir",
        type=str,
        required=False,
        help="Path to directory that contains/should contain context_data.json",
    )
    parser.add_argument("--form", type=str, help="Path to form to fill.")
    parser.add_argument(
        "--output", type=str, default=None, help="Output path for the filled form."
    )
    parser.add_argument(
        "--context",
        type=str,
        default=None,
        help="Path to context JSON file for filling form.",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose logging."
    )
    parser.add_argument(
        "--test-api", action="store_true", help="Test OpenAI API connectivity."
    )
    parser.add_argument(
        "--test-ollama", action="store_true", help="Test LMStudio API connectivity."
    )
    parser.add_argument(
        "--provider",
        choices=["openai", "groq", "google", "anythingllm", "local", "ollama"],
        default=None,
        help="Specify LLM provider to use (openai, groq, google, etc.).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)
    # Set LLM provider if specified
    if args.provider:
        llm_client.DEFAULT_PROVIDER = args.provider
        logging.info(f"LLM provider set to: {args.provider}")
    # Handle OpenAI API test
    if args.test_api:
        get_openai_client()
        test_openai()
        return

    # Handle LMStudio API test
    if args.test_ollama:
        get_ollama_client()
        test_ollama()
        return
    # Decide on the effective context directory (if provided via the new flag,
    # fall back to the deprecated one to preserve behaviour)
    effective_context_dir = args.contextDir

    # Handle context extraction (when the user explicitly passes a contextDir
    # without a --form).  We treat the presence of --contextDir without --form
    # as a request to (re)generate context_data.json.
    if effective_context_dir and not args.form:
        output_path = args.output or os.path.join(
            effective_context_dir, "context_data.json"
        )
        if os.path.exists(output_path):
            logging.info(
                f"Context data already exists at {output_path}, skipping extraction."
            )
            # Even if skipping extraction, update date fields
            with open(output_path, "r", encoding="utf-8") as f:
                context_data = json.load(f)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(context_data, f, ensure_ascii=False, indent=4)
        else:
            logging.info(f"Extracting context from: {effective_context_dir}")
            _ = extract_context(effective_context_dir, args.provider)
            logging.info(f"Context data written to {output_path}")
    if args.form:
        if not effective_context_dir:
            logging.error(
                "You must specify --contextDir when using --form so the program knows where to find context_data.json and related resources."
            )
            return
        logging.info(f"Filling form: {args.form}")
        context_path = args.context or os.path.join(
            effective_context_dir, "context_data.json"
        )
        if not os.path.exists(context_path):
            logging.warning(
                f"Context JSON file not found at {context_path}. Creating new context data from available documents in the folder."
            )
            # Extract context fresh and persist
            try:
                context_data = extract_context(effective_context_dir, args.provider)
                logging.info(f"Created new context data at {context_path}.")
            except Exception as e:
                logging.error(f"Failed to create context data: {e}")
                return
        else:
            with open(context_path, "r", encoding="utf-8") as f:
                context_data = json.load(f)
        context_dir = effective_context_dir
        # Save updated context before using it
        with open(context_path, "w", encoding="utf-8") as f:
            json.dump(context_data, f, ensure_ascii=False, indent=4)
        # Determine output path – if not explicitly provided, append '_filled' before the original extension
        if args.output:
            output_path = args.output
        else:
            base, ext = os.path.splitext(args.form)
            output_path = f"{base}_filled{ext}"
        fill_in_form(args.form, context_dir, args.provider, output_path)
        logging.info(f"Filled form saved to {output_path}")


if __name__ == "__main__":
    main()
