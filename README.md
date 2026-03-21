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
  <a href="https://chromewebstore.google.com/detail/metheus-extension-languag/megcmimgojgpnhkenbgdjbklbmcpglcf?hl=es&utm_source=ext_sidebar"><img src="https://img.shields.io/badge/Chrome_Web_Store-v1.0.0-4285F4.svg" alt="Chrome Web Store"></a>
  <a href="https://addons.mozilla.org/es-ES/firefox/addon/metheus-app/"><img src="https://img.shields.io/badge/Firefox_Add--ons-v1.0.0-FF7139.svg" alt="Firefox Add-ons"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/metheus-extension-langua/khghbiiioebiljnnmfmlaeppffoffhpa"><img src="https://img.shields.io/badge/Edge_Add--ons-v1.0.0-0078D7.svg" alt="Edge Add-ons"></a>
</p>

---

## What is this?

**Metheus Extension** is the browser runtime for the [Metheus](https://metheus.app) immersion platform.
It turns streaming video, local media, and everyday webpages into a language-learning workflow with interactive subtitles, hover lookups, vocabulary-aware highlighting, one-click mining, and sync with your Metheus library.

Metheus is built around:

- video + web study workflows
- Metheus account sync and vocabulary state
- comprehension-first highlighting (L+1 / i+1)
- mining UX designed for fast capture without breaking immersion
- dictionary and word-status flows that connect directly to the Metheus platform

## Metheus Core Capabilities

Metheus includes substantial product and implementation work, including:

- **Web-wide study workflow**: hover dictionary, DOM text colorization, and reading flows outside video pages
- **Metheus sync layer**: bidirectional sync with the Metheus platform
- **L+1 engine**: vocabulary-aware highlighting focused on comprehensible input
- **Smart Pill / immersion UX**: lightweight mining controls designed around uninterrupted consumption
- **Dictionary flows**: offline dictionary support, online enrichment, and Metheus-specific word-state integration
- **Metheus bridge**: direct bridge between the extension runtime and the Metheus web app
- **UI direction**: product, interaction, and presentation tailored to the Metheus learning experience

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

- [Chrome Web Store](https://chromewebstore.google.com/detail/metheus-extension-languag/megcmimgojgpnhkenbgdjbklbmcpglcf?hl=es&utm_source=ext_sidebar)
- [Firefox Add-ons](https://addons.mozilla.org/es-ES/firefox/addon/metheus-app/)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/metheus-extension-langua/khghbiiioebiljnnmfmlaeppffoffhpa)

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

## Provenance

Metheus grew on top of an open-source subtitle/player foundation and keeps attribution where it is required.
The current product scope, integration layer, UX, sync model, and dictionary workflows are actively developed as Metheus work.

For a clear explanation of origin, inherited areas, and Metheus-specific work, see [PROVENANCE.md](PROVENANCE.md).

## 🤝 Contributing

We welcome contributions! Whether it's adding a new feature, fixing a bug, or improving our language data:

- **Code**: Read our [Contributing Guide](CONTRIBUTING.md).
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

See [LICENSE.md](LICENSE.md) and [PROVENANCE.md](PROVENANCE.md) for details.
