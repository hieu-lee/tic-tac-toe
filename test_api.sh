#!/usr/bin/env bash
# Simple helper script to exercise the EasyForm FastAPI backend.
# Usage: ./test_api.sh [BASE_URL]
# BASE_URL defaults to http://localhost:8000
#
# The script performs:
#   1. Health-check
#   2. Context extraction for sample context directory
#   3. Plain-text extraction from a sample form (PDF/DOCX)
#
# Feel free to expand with pattern detection & filling once you have
# pre-computed FillEntry / CheckboxEntry JSON payloads.

set -euo pipefail

BASE_URL=${1:-http://localhost:8000}
FORM_PATH=${FORM_PATH:-./form.pdf}
CONTEXT_DIR=${CONTEXT_DIR:-./test_context}

header() {
  printf "\n\033[1;34m==> %s\033[0m\n" "$1"
}

# 1. Health-check
header "Health check"
curl -s "$BASE_URL/health" | jq .

# 2. Run full context extraction (writes context_data.json on server)
header "Context extraction"
curl -s -X POST "$BASE_URL/context/extract" \
  -H "Content-Type: application/json" \
  -d '{"context_dir":"'"$CONTEXT_DIR"'"}' | jq .

# 3. Extract raw text from the form
header "Form text extraction"
curl -s -X POST "$BASE_URL/form/text" \
  -H "Content-Type: application/json" \
  -d '{"form_path":"'"$FORM_PATH"'"}' | jq '.text | .[0:500] + "…"'

header "Done." 