# Changelog

All notable changes to the Metheus Extension will be documented in this file.

## [1.0.0] - 2026-02-10

### Initial Public Release

- **Metheus Identity**: Released publicly as **Metheus Extension** with its own product direction and repository.
- **Repo Structure**: Migrated to a dedicated repository/monorepo structure.
- **License**: Preserved attribution for inherited third-party portions while establishing Metheus-owned code under AGPLv3.

### New Features

- **Metheus Sync**: One-click sync with Metheus platform.
- **Subtitle Colorization**: Subtitles are now colored based on your vocabulary knowledge (Unknown/Learning/Known).
- **L+1 Engine**: Smart highlighting of comprehensible input.
- **Offline Dictionary**: Integrated dictionary support for 20+ languages.
- **Card Export**: Direct export to Metheus decks instead of Anki (Anki support preserved via legacy settings).

### Architecture

- **Package Names**: Scoped under `@metheus/*`.
- **CI/CD**: Simplified verification pipelines.
