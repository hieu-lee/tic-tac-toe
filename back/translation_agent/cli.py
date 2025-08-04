#!/usr/bin/env python3
import logging
import argparse
from .translation_processor import translate_file


def _build_arg_parser():
    p = argparse.ArgumentParser(
        prog="translation_agent", description="Translate PDF/DOCX documents using LLMs"
    )
    p.add_argument("file", help="Path to PDF or DOCX to translate")
    p.add_argument("language", help="Target language, e.g. 'French'")
    p.add_argument(
        "--provider",
        choices=["openai", "groq", "google", "anythingllm", "local", "ollama"],
        default="openai",
    )
    p.add_argument("--output", help="Output path for translated file")
    p.add_argument("--verbose", action="store_true")
    return p


def main():
    args = _build_arg_parser().parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)
    translate_file(
        args.file, args.language, provider=args.provider, output_path=args.output
    )


if __name__ == "__main__":
    main()
