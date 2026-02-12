#!/bin/bash

# pre_commit_check.sh - Scan for forbidden artifacts before commit
# Input: JSON via stdin with 'files' array
# Output: JSON with 'success' boolean and 'errors' array

set -e

# Read stdin JSON
input=$(cat)

# Get list of files to check
files=$(echo "$input" | jq -r '.files[]? // empty')

errors=()

# Check for forbidden patterns in each file
for file in $files; do
    # Skip if file doesn't exist
    [ -f "$file" ] || continue

    # Check for pdb (Python debug) in Python files
    if [[ "$file" == *.py ]]; then
        if grep -q "import pdb" "$file" 2>/dev/null; then
            errors+=("pdb import found in $file")
        fi
        if grep -q "pdb.set_trace" "$file" 2>/dev/null; then
            errors+=("pdb.set_trace found in $file")
        fi
    fi

    # Check for print statements in Python files
    if [[ "$file" == *.py ]]; then
        if grep -qE "^\s*print\s*\(" "$file" 2>/dev/null; then
            errors+=("print() found in $file (should use logging)")
        fi
    fi

    # Check for <tree> tag in XML files (Odoo v18+ forbidden)
    if [[ "$file" == *.xml ]]; then
        if grep -q "<tree" "$file" 2>/dev/null; then
            errors+=("<tree> tag found in $file (use <list> for Odoo v18+)")
        fi
    fi

    # Check for console.log in TypeScript/JavaScript
    if [[ "$file" == *.ts || "$file" == *.tsx || "$file" == *.js || "$file" == *.jsx ]]; then
        if grep -qE "console\.(log|error|warn)" "$file" 2>/dev/null; then
            # Skip if it's a test file (tests may use console.log intentionally)
            if [[ "$file" != *.test.ts* && "$file" != *.spec.ts* && "$file" != *.test.js* && "$file" != *.spec.js* ]]; then
                errors+=("console.log/error/warn found in $file")
            fi
        fi
    fi

    # Check for TODO/FIXME comments that should be addressed
    if grep -qE "TODO|FIXME" "$file" 2>/dev/null; then
        # Only warn, don't fail
        echo "Warning: TODO/FIXME comments found in $file" >&2
    fi
done

# Build output JSON
if [ ${#errors[@]} -eq 0 ]; then
    echo "{\"success\":true,\"errors\":[]}"
else
    # Escape errors for JSON
    escaped_errors=""
    for i in "${!errors[@]}"; do
        if [ $i -gt 0 ]; then
            escaped_errors+=","
        fi
        escaped_errors+="\"${errors[$i]}\""
    done
    echo "{\"success\":false,\"errors\":[$escaped_errors]}"
fi
