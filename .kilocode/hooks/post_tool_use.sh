#!/bin/bash

# post_tool_use.sh - Log tool usage, success/fail status, and duration
# Input: JSON via stdin
# Output: JSON via stdout (passthrough)

# Read stdin JSON
input=$(cat)

# Parse tool name
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")

# Parse success status
success=$(echo "$input" | jq -r '.success // "unknown"' 2>/dev/null || echo "unknown")

# Parse duration (in milliseconds if available)
duration=$(echo "$input" | jq -r '.duration_ms // .duration // 0' 2>/dev/null || echo "0")

# Parse timestamp
timestamp=$(echo "$input" | jq -r '.timestamp // empty' 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

# Log to console (for debugging)
echo "Tool: $tool_name | Status: $success | Duration: ${duration}ms" >&2

# Output the input unchanged (passthrough for JSON-in/JSON-out)
echo "$input"
