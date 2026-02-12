#!/bin/bash

# structure_audit.sh - Verify module structure and project conventions
# Input: JSON via stdin with optional 'path' to check
# Output: JSON with 'success' boolean, 'errors' array, and 'warnings' array

set -e

# Read stdin JSON
input=$(cat)

# Get path to check (default to current directory)
check_path=$(echo "$input" | jq -r '.path // "."')

errors=()
warnings=()

# Check if path exists
if [ ! -d "$check_path" ]; then
    echo "{\"success\":false,\"errors\":[\"Path does not exist: $check_path\"],\"warnings\":[]}"
    exit 0
fi

# Check for required root-level files
required_files=("package.json" "pnpm-workspace.yaml" "turbo.json" "AGENTS.md")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        errors+=("Missing required file: $file")
    fi
done

# Check for .kilocode directory
if [ ! -d ".kilocode" ]; then
    warnings+=(".kilocode directory not found - governance structure may be incomplete")
else
    # Check for required hooks
    required_hooks=("post_tool_use.sh" "pre_commit_check.sh" "structure_audit.sh")
    for hook in "${required_hooks[@]}"; do
        if [ ! -f ".kilocode/hooks/$hook" ]; then
            warnings+=("Missing hook: .kilocode/hooks/$hook")
        else
            # Check if hook is executable
            if [ ! -x ".kilocode/hooks/$hook" ]; then
                warnings+=("Hook not executable: .kilocode/hooks/$hook")
            fi
        fi
    done
fi

# Check for src directory (extension backend)
if [ ! -d "src" ]; then
    warnings+=("src/ directory not found - extension backend may be missing")
else
    # Check for required extension files
    if [ ! -f "src/extension.ts" ]; then
        warnings+=("src/extension.ts not found")
    fi
    if [ ! -f "src/package.json" ]; then
        warnings+=("src/package.json not found")
    fi
fi

# Check for webview-ui directory (frontend)
if [ ! -d "webview-ui" ]; then
    warnings+=("webview-ui/ directory not found - frontend may be missing")
else
    # Check for required frontend files
    if [ ! -f "webview-ui/package.json" ]; then
        warnings+=("webview-ui/package.json not found")
    fi
fi

# Check for packages directory (shared packages)
if [ ! -d "packages" ]; then
    warnings+=("packages/ directory not found - shared packages may be missing")
else
    # Check for common packages
    if [ ! -d "packages/types" ]; then
        warnings+=("packages/types/ not found")
    fi
fi

# Check for apps directory
if [ ! -d "apps" ]; then
    warnings+=("apps/ directory not found - apps may be missing")
fi

# Check for .changeset directory (if PRs are expected)
if [ ! -d ".changeset" ]; then
    warnings+=(".changeset/ directory not found - changesets may not be configured")
fi

# Check for .husky directory (if git hooks are expected)
if [ ! -d ".husky" ]; then
    warnings+=(".husky/ directory not found - git hooks may not be configured")
fi

# Check tsconfig.json
if [ ! -f "tsconfig.json" ]; then
    warnings+=("tsconfig.json not found at root")
fi

# Check for .prettierrc.json
if [ ! -f ".prettierrc.json" ]; then
    warnings+=(".prettierrc.json not found - formatting may be inconsistent")
fi

# Check for .envrc or .env.example
if [ ! -f ".envrc" ] && [ ! -f ".env.example" ]; then
    warnings+=("No .envrc or .env.example found - environment setup may be unclear")
fi

# Build output JSON
escaped_errors=""
for i in "${!errors[@]}"; do
    if [ $i -gt 0 ]; then
        escaped_errors+=","
    fi
    escaped_errors+="\"${errors[$i]}\""
done

escaped_warnings=""
for i in "${!warnings[@]}"; do
    if [ $i -gt 0 ]; then
        escaped_warnings+=","
    fi
    escaped_warnings+="\"${warnings[$i]}\""
done

if [ ${#errors[@]} -eq 0 ]; then
    echo "{\"success\":true,\"errors\":[$escaped_errors],\"warnings\":[$escaped_warnings]}"
else
    echo "{\"success\":false,\"errors\":[$escaped_errors],\"warnings\":[$escaped_warnings]}"
fi
