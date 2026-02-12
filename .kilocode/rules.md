# Kilo Code Project Rules

This file defines the governance rules and standards for the Kilo Code VS Code extension project.

## 1. Project Context

**Project Type:** VS Code Extension (TypeScript/React)
**Package Manager:** pnpm (v10.8.1)
**Node Version:** 20.20.0
**Monorepo Structure:** Turbo-based pnpm monorepo

### Key Directories

| Directory     | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `src/`        | VSCode extension core (backend)                |
| `webview-ui/` | React frontend (chat UI, settings)             |
| `cli/`        | Standalone CLI package                         |
| `packages/`   | Shared packages (types, ipc, telemetry, cloud) |
| `jetbrains/`  | JetBrains plugin                               |
| `apps/`       | E2E tests, docs                                |

---

## 2. Code Standards

### TypeScript

- **Strict Mode:** All TypeScript code must compile without errors
- **No `any`:** Avoid `any` type; use `unknown` or proper generics
- **Imports:** Use path aliases defined in tsconfig.json
- **Naming:** camelCase for variables/functions, PascalCase for classes/types

### ESLint

- **Config Location:** `src/eslint.config.mjs` (backend), `webview-ui/eslint.config.mjs` (frontend)
- **Base Config:** Extends `@roo-code/config-eslint/base` and `@roo-code/config-eslint/react`
- **Run Command:** `pnpm lint`

### Formatting

- **Prettier:** Use Prettier for code formatting
- **Config:** `.prettierrc.json` at root
- **Run Command:** `pnpm format`

### Testing

- **Framework:** Vitest
- **Location:** `__tests__` directories and `src/` with `.spec.ts` suffix
- **Run Command:** `pnpm test` (from root) or `cd src && pnpm test path/to/test` (specific package)
- **CLI Tests:** Use `.test.ts` suffix (exception to `.spec.ts` convention)

---

## 3. Build & Release

### Build Commands

| Command            | Description              |
| ------------------ | ------------------------ |
| `pnpm build`       | Build extension (.vsix)  |
| `pnpm vsix`        | Create VSIX package      |
| `pnpm check-types` | TypeScript type checking |
| `pnpm lint`        | Run ESLint               |
| `pnpm test`        | Run all tests            |

### Changesets

- **Location:** `.changeset/` directory
- **Required:** Every PR needs a changeset (unless documentation-only or internal tooling)
- **Format:** Use `pnpm changeset` to create
- **Scope:** Use `"kilo-code"` for core, `"@kilocode/cli"` for CLI, etc.

Example:

```md
---
"kilo-code": patch
---

Brief description of the change
```

### Fork-Specific Markers

When modifying code that exists in upstream Roo Code, use `kilocode_change` markers:

```typescript
// Single line
const value = 42 // kilocode_change

// Multi-line
// kilocode_change start
const foo = 1
const bar = 2
// kilocode_change end

// New file header
// kilocode_change - new file
```

**Directories NOT needing markers:**

- `cli/` - CLI package
- `jetbrains/` - JetBrains plugin
- Any path containing `kilocode` in filename/directory
- `src/services/ghost/`

---

## 4. Security & Best Practices

### Forbidden Patterns

- **Never use empty catch blocks** - Always log or handle the error
- **Never disable lint rules** without explicit user approval
- **Never commit secrets** - Use `.env.example` for templates

### Access Rights & Permissions

- VS Code extension uses `package.json` permissions
- Follow principle of least privilege for capability requests

---

## 5. Git & Workflow

### Branch Naming

- **Documentation:** `docs/description-of-change`
- **Features:** `feature/description`
- **Bugfixes:** `fix/description`

### Commit Messages

- Use conventional commits format
- Reference issue numbers in body when applicable

### Pre-commit Checks

Run before committing:

```bash
pnpm lint
pnpm check-types
pnpm test
```

---

## 6. Translation & i18n

### Supported Languages

ar, ca, cs, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, sk, th, tr, uk, vi, zh-CN, zh-TW

### Localization Files

- **Backend:** `src/i18n/locales/`, `src/package.nls.<locale>.json`
- **Frontend:** `webview-ui/src/i18n/locales/`

### Translation Rules

- Use informal speech (e.g., "du" not "Sie" in German)
- Don't translate: "token", "API", "prompt", technical terms
- Keep `{{variable}}` placeholders exactly as in English source
- See `.kilocode/skills/translation/SKILL.md` for full guidelines

---

## 7. Extension Development

### Key Source Directories

- `src/api/providers/` - AI provider implementations (50+ providers)
- `src/core/tools/` - Tool implementations (ReadFile, ApplyDiff, ExecuteCommand, etc.)
- `src/services/` - Services (MCP, browser, checkpoints, code-index)
- `packages/agent-runtime/` - Standalone agent runtime

### VS Code API

- Mock VS Code API for agent runtime testing
- Use `AGENT_CONFIG` environment variable for agent configuration

---

## 8. Dependencies

### Version Constraints

- **Node:** 20.20.0
- **pnpm:** 10.8.1
- **TypeScript:** Per workspace package.json

### Package Management

- Use `pnpm` exclusively (not npm/yarn)
- Run `pnpm install` from project root
- Use workspace protocols (`workspace:^`) for internal packages
