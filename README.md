<p align="center">
  <img src="extension/public/icon/icon128.png" alt="Metheus Extension" width="128">
</p>

<h1 align="center">Metheus Extension</h1>

<p align="center">
  <strong>Learn any language while watching Netflix, YouTube, Disney+, and 20+ streaming services.</strong>
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="AGPLv3 License"></a>
  <a href="https://github.com/GisaacPr/metheus-extension/actions/workflows/verify.yml"><img src="https://github.com/GisaacPr/metheus-extension/actions/workflows/verify.yml/badge.svg" alt="CI"></a>
  <a href="https://chromewebstore.google.com/detail/metheus-extension/placeholder"><img src="https://img.shields.io/badge/Chrome_Web_Store-v1.0.0-4285F4.svg" alt="Chrome Web Store"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/metheus-extension/"><img src="https://img.shields.io/badge/Firefox_Add--ons-v1.0.0-FF7139.svg" alt="Firefox Add-ons"></a>
</p>

---

## What is this?

**Metheus Extension** is the ultimate language immersion tool. It transforms your favorite streaming services into powerful learning resources by adding interactive subtitles, one-click flashcard creation, and smart vocabulary highlighting. It seamlessly syncs with the [Metheus](https://metheus.app) platform to track your progress.

> This project is a fork of [asbplayer](https://github.com/killergerbah/asbplayer) by killergerbah. We are grateful for their foundational work.

## ✨ Features

- **📺 Universal Video Player**: Works seamlessly on Netflix, YouTube, Disney+, Amazon Prime, and 20+ other streaming services.
- **🌐 Web Text Colorizer**: Turn any blog, news article, or webpage into a study environment. Metheus intelligently parses the DOM to colorize text based on your vocabulary level.
- **⚡ 1-Click Flashcards**: Create high-quality Anki-style cards with native audio, perfect screenshots, and context sentences in milliseconds.
- **🎨 Smart Knowledge Tracking**: Words are color-coded by your mastery level (Unknown → Learning → Known).
- **🧠 Comprehensible Input (L+1) Engine**: Automatically highlights slightly difficult words ("i+1" or "L+1") to optimize your language acquisition rate.
- **💊 The "Smart Pill"**: A specialized, non-intrusive UI element that floats on the page, allowing quick access to mining actions without breaking immersion.
- **📚 Interactive Hover Dictionary**: Instant translations for 20+ languages with offline support, available on both video subtitles and regular webpages.
- **🔄 Universal Cloud Sync**: Bi-directional progress synchronization with the Metheus platform.
- **🎧 Native Audio Capture**: Record high-quality audio clips directly from the video stream or via native text-to-speech for text elements.

## 🎬 Supported Video Services

|                                                                                           |                                                                                      |                                                                                             |                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| <img src="extension/public/page-favicons/netflix.ico" width="20"/> **Netflix**            | <img src="extension/public/page-favicons/youtube.ico" width="20"/> **YouTube**       | <img src="extension/public/page-favicons/amazonPrime.ico" width="20"/> **Amazon Prime**     | <img src="extension/public/page-favicons/disneyPlus.ico" width="20"/> **Disney+**   |
| <img src="extension/public/page-favicons/hboMax.ico" width="20"/> **HBO Max**             | <img src="extension/public/page-favicons/hulu.ico" width="20"/> **Hulu**             | <img src="extension/public/page-favicons/plex.ico" width="20"/> **Plex**                    | <img src="extension/public/page-favicons/stremio.ico" width="20"/> **Stremio**      |
| <img src="extension/public/page-favicons/embyJellyfin.ico" width="20"/> **Emby/Jellyfin** | <img src="extension/public/page-favicons/bilibili.ico" width="20"/> **Bilibili**     | <img src="extension/public/page-favicons/viki.ico" width="20"/> **Viki**                    | <img src="extension/public/page-favicons/nrktv.ico" width="20"/> **NRK TV**         |
| <img src="extension/public/page-favicons/tver.ico" width="20"/> **TVer**                  | <img src="extension/public/page-favicons/unext.ico" width="20"/> **U-NEXT**          | <img src="extension/public/page-favicons/bandaiChannel.ico" width="20"/> **Bandai Channel** | <img src="extension/public/page-favicons/yleAreena.ico" width="20"/> **Areena Yle** |
| <img src="extension/public/page-favicons/osnplus.ico" width="20"/> **OSN+**               | <img src="extension/public/page-favicons/cijapanese.ico" width="20"/> **CIJapanese** | 📁 **Local Files**                                                                          | 🌐 **Any Webpage**                                                                  |

## 🚀 Installation

### Official Stores

- [Chrome Web Store](https://chromewebstore.google.com/detail/metheus-extension/placeholder)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/metheus-extension/)

### Manual Build

See the [Development](#-development) section below to build from source.

## 🛠️ Development

### Prerequisites

- **Node.js** 22+
- **Yarn** 3.2.0
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/GisaacPr/metheus-extension.git
cd metheus-extension

# Install dependencies
yarn install

# Start extension in dev mode (Chrome)
yarn workspace @metheus/extension run dev

# Start extension in dev mode (Firefox)
yarn workspace @metheus/extension run dev:firefox
```

### Build

```bash
# Build for Chrome (MV3)
yarn workspace @metheus/extension run build

# Build for Firefox (MV2)
yarn workspace @metheus/extension run build:firefox

# Create ZIP packages
yarn workspace @metheus/extension run zip
```

## 🏗️ Architecture

This is a **monorepo** managed with Yarn Workspaces:

- **`common`** (`@metheus/common`): Shared core logic, models, settings, and UI components.
- **`extension`** (`@metheus/extension`): The browser extension (WXT + React).
- **`client`** (`@metheus/client`): Standalone web player for local files.

For a deep dive, see [ARCHITECTURE.md](ARCHITECTURE.md).

## 🤝 Contributing

We welcome contributions! Whether it's adding a new feature, fixing a bug, or improving our language data:

- **Code**: Read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md).
- **Language Data**: You can contribute to our L+1 vocabulary datasets (like `extension/public/data/vocabulary/en_50k.txt`) by cleaning, reordering, or translating word lists to help learners globally.

## 🔒 Privacy

Your privacy is paramount.

- We **do not** track your browsing history.
- Subtitle data is processed locally.
- Data is only synced to Metheus when you explicitly enable it.

See [PRIVACY.md](PRIVACY.md) for the full policy.

## 📄 License

Dual licensed:

- **Metheus code**: AGPLv3 License Copyright (c) 2026 Metheus
- **Original asbplayer code**: MIT License Copyright (c) 2020-2025 asbplayer authors

See [LICENSE.md](LICENSE.md) for details.
