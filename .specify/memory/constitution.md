<!--
Sync Impact Report:
- Version change: template → 1.0.0 (initial constitution)
- Modified principles: All 5 principles newly defined
- Added sections: Development Workflow, Quality Gates, Governance
- Templates requiring updates:
  - ✅ plan-template.md (Constitution Check section aligns with new principles)
  - ✅ spec-template.md (User story independence aligns with Test-First principle)
  - ✅ tasks-template.md (Incremental delivery aligns with MVP principle)
- Follow-up TODOs: None
-->

# Kilo Code Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

TDD mandatory: Tests written → User approved → Tests fail → Then implement. Red-Green-Refactor cycle strictly enforced. All code changes must have test coverage before completion. Vitest framework with proper test organization (.spec.ts/.spec.tsx convention, CLI exception .test.ts/.test.tsx). Tests must pass before any PR submission.

### II. Code Quality Standards

Never disable any lint rules without explicit user approval. TypeScript strict mode required for all new code. Use Tailwind CSS classes instead of inline style objects for new markup. VSCode CSS variables must be added to webview-ui/src/index.css before using them in Tailwind classes. Proper error handling and structured logging required throughout the codebase.

### III. Monorepo Architecture Discipline

pnpm workspaces with Turbo orchestration for task management. Clear separation of concerns: src/ (core extension), webview-ui/ (React frontend), cli/ (standalone CLI), packages/ (shared), jetbrains/ (plugin). Mark Kilo Code-specific changes in shared code with kilocode_change comments to minimize merge conflicts during upstream syncs. Keep changes to core extension code minimal.

### IV. Open Source & Community

All PRs require changesets unless documentation-only or internal tooling. Use semantic versioning: patch for fixes, minor for features, major for breaking changes. Clear documentation and examples for all public APIs. Community-driven development with transparent release process. Maintain compatibility with upstream Roo Code fork through disciplined change management.

### V. Incremental Delivery & MVP Focus

MVP-first approach with independently testable user stories. Each user story must be independently completable, testable, and deliverable. Continuous integration with git hooks (pre-commit, pre-push) for quality gates. Automated testing, linting, and type checking must pass before any merge. Focus on delivering value incrementally rather than monolithic releases.

## Development Workflow

Git hooks enforce quality standards through Husky. Pre-commit hook prevents direct main branch commits, runs type generation, checks staged files, and runs lint-staged. Pre-push hook prevents direct main pushes, runs type checking, and verifies changeset existence. All changes must be tested from the correct workspace directory (src/ for backend, webview-ui/ for UI). Use `pnpm test <relative-path>` with proper workspace context.

## Quality Gates

Before attempting completion, always ensure code changes have test coverage. Run `pnpm lint` for ESLint compliance and `pnpm check-types` for TypeScript validation. Tests must be run from the same directory as the package.json file that specifies vitest. Backend tests: `cd src && pnpm test tests/file.spec.ts`. UI tests: `cd webview-ui && pnpm test src/file.spec.ts`. Never run tests from project root. All quality gates must pass before any PR submission.

## Governance

This constitution supersedes all other development practices. Amendments require documentation, approval, and migration plan. All PRs and reviews must verify compliance with constitutional principles. Complexity must be justified with clear business value. Use DEVELOPMENT.md and AGENTS.md for runtime development guidance. Version follows semantic versioning: MAJOR for backward-incompatible governance changes, MINOR for new principles or sections, PATCH for clarifications and non-semantic refinements.

**Version**: 1.0.0 | **Ratified**: 2025-01-10 | **Last Amended**: 2025-01-10
