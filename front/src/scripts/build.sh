#!/bin/bash

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/../assets/python"

# Create the output directory if it doesn't exist
mkdir -p "$DIST_DIR"

# Loop through all .py files in the script directory
for pyfile in "$SCRIPT_DIR"/*.py; do
    # Skip this script itself
    [[ "$pyfile" == "${BASH_SOURCE[0]}" ]] && continue

    echo "Compiling $pyfile..."
    pyinstaller "$pyfile" -F --distpath "$DIST_DIR"
done
