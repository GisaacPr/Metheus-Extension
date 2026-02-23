# Architecture Overview

> **Metheus Extension** is a production-grade browser extension built with modern web technologies. This document provides a high-level overview of the codebase structure and key components.

## 🏗️ Mono-repo Structure

The project is a **Yarn Workspaces** monorepo containing three main packages:

```
extensions/
├── common/          @metheus/common    (Shared library)
├── extension/       @metheus/extension (Browser Extension)
├── client/          @metheus/client    (Web Player)
```

### 1. `@metheus/common`

The core of the application. It contains all the business logic, data models, and UI components that are shared between the extension and the web player.

- **`src`**: Core models (`CardModel`, `SubtitleModel`) and utilities.
- **`settings`**: Settings management system.
- **`components`**: Shared React components (Settings UI, Subtitle Rendering).
- **`locales`**: i18n JSON files for 21+ languages.

### 2. `@metheus/extension`

The browser extension itself, built with **WXT** (Web Extension Toolkit).

- **`entrypoints/background.ts`**: The main service worker handling command routing and state.
- **`entrypoints/popup/`**: The extension popup UI.
- **`services/`**: Background services (Audio Recorder, Card Publisher, Metheus Sync).
- **`wxt.config.ts`**: Build configuration for Chrome (MV3) and Firefox (MV2).

### 3. `@metheus/client`

A standalone web-based media player built with **Vite**.

- Capable of playing local video files with subtitles.
- Used for testing subtitle parsing and rendering logic in isolation.

## 🔄 Data Flow

### Card Mining Flow (Video & Web)

1. **User Action**:
    - **Video**: User presses `Ctrl+Shift+X` or uses the Hover Dictionary to mine.
    - **Web**: User clicks a highlighted word parsed by the Web Colorizer, or uses the floating Smart Pill.
2. **Content Script**: Intercepts the action, capturing the target word, surrounding context (sentence), and URL. If on video, captures the timestamp.
3. **Background**: Receives the command.
    - **AudioRecorderService** captures the audio from the tab (or triggers TTS for web text).
    - **ImageCapturer** takes a screenshot of the context.
4. **CardPublisher**: Assembles the cohesive flashcard data.
5. **Metheus Integration**: Sends the payload to the Metheus API to generate the card.

## 🧩 Key Technologies

- **React 19**: UI rendering.
- **WXT**: Extension build tool and HMR.
- **MUI (Material UI)**: UI Component library.
- **Dexie.js**: IndexedDB wrapper for local storage.
- **i18next**: Internationalization.

## 🔌 Metheus Integration Services

The extension contains specific services to communicate with the Metheus platform:

- **`metheus-sync.ts`**: Syncs vocabulary status (Learning/Known) with the cloud.
- **`metheus-dictionary.ts`**: Manages offline dictionary downloads and lookups.
