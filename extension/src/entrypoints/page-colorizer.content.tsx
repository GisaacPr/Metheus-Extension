/**
 * METHEUS PAGE COLORIZER - Global Web Page Support
 *
 * Colorizes vocabulary on any web page (not just video subtitles).
 * Shows REAL SmartHubPill (SmartHudPill React component) in top-right corner via iframe.
 */

import type { ContentScriptContext } from '#imports';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../services/extension-settings-storage';
import { SubtitleColorizer } from '../services/subtitle-colorizer';
import { getWordPopup, WordPopup } from '../services/word-popup';

// Safe elements to colorize (only text content elements)
const SAFE_COLORIZE_SELECTORS = [
    'p',
    'li',
    'td',
    'th',
    'blockquote',
    'dd',
    'dt',
    'figcaption',
    'caption',
    'label',
    'article > p', // Only p inside article
    'section > p', // Only p inside section
    // Comments - target TEXT containers specifically
    '.comment-body',
    '.comment-content',
    '.comment-text',
    '.comments-text',
    '.comment p',
    '.comment-body p',
    '.comment__content',
    '.comment__text',
    // YouTube comments - specific text nodes
    '#content-text',
    'yt-formatted-string#content-text',
    // Reddit comments
    '[data-testid="comment"] p', // Only paragraphs inside comments
    '.RichTextJSON-root p',
    '[data-click-id="text"]',
    // Generic comment classes (with quotes to handle special chars)
    '[class*="comment"]',
    '[class*="Comment"]',
    '.user-comment',
    '.review-comment',
    '.forum-post',
    '.forum-message',
    // Twitter/X
    '[data-testid="tweetText"]',
    '[data-testid="postContent"]',
    '.css-1dbjc4n .r-1tl8opc',
    // Facebook
    '[data-ad-preview="message"]',
    '.userContent p',
    '.fbUserContent',
    // Instagram
    '.C4VMK span',
    // Descriptions
    '.description', // Be careful here, check isSafeToColorize
    '.desc',
    '.summary',
    '.excerpt',
    '.abstract',
    // Forums
    '.post-content',
    '.post-body',
    '.topic-content',
    '.reply-content',
    '.discussion-content',
    // Social
    '.tweet-text',
    '.tweet-content',
    '.post-text',
    '.feed-text',
    // Reviews
    '.review-text',
    '.review-content',
    '.rating-text',
    // Products
    '.product-description',
    '.product-details',
    '.item-description',
    // Chat
    '.message-content',
    '.message-text',
    '.chat-message',
    // Meta
    '[itemprop="description"]',
    // Wikipedia
    '.mw-parser-output p',
    // News
    '.entry-content p',
    '.post-content p',
    '.article-content p',
    '.story-content p',
];

const SUBTITLE_FALLBACK_SELECTORS = [
    '.subtitle-container',
    '.subtitle-text',
    '.captions-text',
    '.caption-text',
    '.vjs-text-track-display',
    '.jw-text-track-display',
    '.dplayer-subtitle',
    '.plyr__captions',
    '[class*="subtitle"]',
    '[class*="Subtitle"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[id*="subtitle"]',
    '[id*="Subtitle"]',
    '[id*="caption"]',
    '[id*="Caption"]',
    '[data-testid*="subtitle"]',
    '[data-testid*="caption"]',
    '[aria-live="polite"]',
    '[aria-live="assertive"]',
];

// Elements to EXCLUDE completely
const EXCLUDE_SELECTORS = [
    'script',
    'style',
    'noscript',
    'iframe',
    'canvas',
    'svg',
    'img',
    'video',
    'audio',
    'nav',
    'header',
    'footer',
    'aside',
    '.ytp-caption-segment', // YouTube subtitles
    '.caption-text', // Generic captions
    '.subtitle-text',
    '[class*="caption"]', // Broad exclusion for caption containers
    '[class*="subtitle"]',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '[role="contentinfo"]',

    // Interactive Elements - STRICT EXCLUSION
    'button',
    'input',
    'textarea',
    'select',
    'a',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '.yt-simple-endpoint', // YouTube links/buttons
    '.ytd-menu-renderer',
    'ytd-button-renderer',
    'yt-icon-button',
    '[onclick]', // Elements with inline handlers
    '.btn',
    '.button',
    '.clickable',

    '.menu',
    '.nav',
    '.navbar',
    '.sidebar',
    '.footer',
    '.header',
    '.social',
    '.share',
    '.ad',
    '.ads',
    '.advertisement',
    '.sponsored',
    '.promo',
    '.popup',
    '.modal',
    '.tooltip',
    '.breadcrumb',
    '.pagination',
    '.tags',
    '.related',
    '.recommended',
    '#sidebar',
    '#nav',
    '#navigation',
    '#mw-head',
    '#mw-panel',
    '#footer',
    '.ext',
    '.mw',
    'code',
    'pre',
    'samp',
    'kbd',
    'var',
];

// Minimum text length
const MIN_TEXT_LENGTH = 10;
const MAX_ELEMENT_TEXT_LENGTH = 12000;
const GLOBAL_PILL_HIDDEN_KEY = 'ln_global_pill_hidden';
const GLOBAL_COLORIZER_ENABLED_KEY = 'ln_global_colorizer_enabled';
const GLOBAL_PILL_OFFSET_X_KEY = 'ln_global_pill_offset_x';

const TEXT_NODE_EXCLUDE_ANCESTOR_SELECTOR = [
    ...EXCLUDE_SELECTORS,
    '[class*="Subtitle"]',
    '[class*="Caption"]',
    '[id*="subtitle"]',
    '[id*="Subtitle"]',
    '[id*="caption"]',
    '[id*="Caption"]',
    '[data-testid*="caption"]',
    '[data-testid*="subtitle"]',
    '[aria-live]',
    '[data-ln-page-colorizer-ignore="true"]',
    '.ln-word',
    '.asbplayer-subtitles-container-bottom',
    '.asbplayer-subtitles-container-top',
    '.asbplayer-bottom-subtitles',
    '.asbplayer-top-subtitles',
    '.player-timedtext',
    '[data-uia="subtitle-text"]',
    '[data-track]',
    '[data-ln-colorized="true"]',
].join(',');

const SUBTITLE_TEXT_NODE_EXCLUDE_ANCESTOR_SELECTOR = [
    'script',
    'style',
    'noscript',
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '.ln-word',
    '[data-ln-page-colorizer-ignore="true"]',
    '.asbplayer-mobile-video-overlay-container-top',
    '.asbplayer-mobile-video-overlay-container-bottom',
    '.asbplayer-mobile-video-overlay',
    '[data-ln-colorized="true"]',
    '#ln-smart-hub-pill-iframe',
    '#metheus-popup-host',
].join(',');

const SUBTITLE_FALLBACK_EXCLUDE_ANCESTOR_SELECTOR = [
    '[data-ln-colorized="true"]',
    '[data-track]',
    '.asbplayer-subtitles',
    '.asbplayer-subtitles-container-bottom',
    '.asbplayer-subtitles-container-top',
    '.asbplayer-bottom-subtitles',
    '.asbplayer-top-subtitles',
    '.asbplayer-mobile-video-overlay-container-top',
    '.asbplayer-mobile-video-overlay-container-bottom',
    '.asbplayer-mobile-video-overlay',
    '#ln-smart-hub-pill-iframe',
    '#metheus-popup-host',
].join(',');

const SUBTITLE_TEXT_SIGNAL_REGEX = /[A-Za-zÀ-ÿ\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/;

function isSafeSubtitleFallbackTarget(el: HTMLElement): boolean {
    if (!isSubtitleLikeElement(el)) {
        return false;
    }

    if (el.closest(SUBTITLE_FALLBACK_EXCLUDE_ANCESTOR_SELECTOR)) {
        return false;
    }

    if (el.dataset.lnColorized === 'true') {
        return false;
    }

    if (el.querySelector('[data-track], .ln-word, [data-ln-colorized="true"]')) {
        return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) {
        return false;
    }

    const text = (el.textContent || '').replace(/\u200B/g, '').trim();
    if (text.length < 2 || text.length > 500) {
        return false;
    }

    if (!SUBTITLE_TEXT_SIGNAL_REGEX.test(text)) {
        return false;
    }

    const escapedBreaks = (text.match(/\\[nrt]/g) || []).length;
    if (escapedBreaks >= 2) {
        return false;
    }

    const bracketNoise = (text.match(/[{}[\]<>]/g) || []).length;
    if (bracketNoise > 6) {
        return false;
    }

    const slashNoise = (text.match(/[\\/|]/g) || []).length;
    if (slashNoise > Math.max(8, Math.floor(text.length * 0.25))) {
        return false;
    }

    return true;
}

function isSubtitleLikeElement(el: HTMLElement | null): boolean {
    if (!el) {
        return false;
    }

    let current: HTMLElement | null = el;
    while (current) {
        const haystack = [
            current.id,
            current.className,
            current.getAttribute('data-testid') || '',
            current.getAttribute('aria-label') || '',
            current.getAttribute('role') || '',
        ]
            .map((value) => (typeof value === 'string' ? value : String(value || '')))
            .join(' ');

        if (/subtitle|caption|cue|vtt|transcript|lyrics/i.test(haystack)) {
            return true;
        }

        if (
            current.matches(
                '[data-track], [data-uia="subtitle-text"], .asbplayer-subtitles-container-bottom, .asbplayer-subtitles-container-top, .asbplayer-bottom-subtitles, .asbplayer-top-subtitles, .player-timedtext'
            )
        ) {
            return true;
        }

        current = current.parentElement;
    }

    return false;
}

function isVideoVisibleInViewport(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) {
        return false;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const overlapX = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const overlapY = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const visibleArea = overlapX * overlapY;
    const totalArea = rect.width * rect.height;
    if (totalArea <= 0) {
        return false;
    }

    return visibleArea / totalArea >= 0.15;
}

// Check if element is safe to colorize
function isSafeToColorize(el: HTMLElement): boolean {
    if (isSubtitleLikeElement(el)) return false;

    // 1. Check excluded parents first
    const excludedParent = el.closest(EXCLUDE_SELECTORS.join(','));
    if (excludedParent) return false;

    // 2. Already processed?
    if (el.dataset.lnPageColorized === 'true') return false;

    // 3. Check text content
    const text = el.textContent || '';
    if (text.trim().length < MIN_TEXT_LENGTH) return false;
    if (text.length > MAX_ELEMENT_TEXT_LENGTH) return false;

    // 4. Check for code/script in HTML
    const html = el.innerHTML.toLowerCase();
    if (html.includes('<script') || html.includes('function(') || html.includes('window.')) return false;

    return true;
}

// Detect if page has active video (visible and playing)
function hasActiveVideo(): boolean {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
        if (video.offsetWidth > 100 && video.offsetHeight > 100 && !video.paused) {
            return true;
        }
    }
    return false;
}

class PageColorizer {
    private settingsProvider: SettingsProvider;
    private colorizer: SubtitleColorizer | null = null;
    private popup: WordPopup;
    private colorizeEnabled: boolean = true;
    private userHidden: boolean = false;
    private processedCount: number = 0;
    private maxElements: number = 100;
    private iframe: HTMLIFrameElement | null = null;
    private observer: MutationObserver | null = null;
    private isApplyingColorization: boolean = false;
    private visibilityIntervalId: number | null = null;
    private collapseResizeTimeoutId: number | null = null;
    private horizontalOffsetX: number = 0;
    private isDraggingPill: boolean = false;
    private videoPillEmptyTrack: boolean = true;
    private runtimeMessageListener?: (message: any) => void;
    private colorizeDebounceId: number | null = null;
    private subtitleDebounceId: number | null = null;

    private normalizeSentence(text: string): string {
        return text
            .replace(/\u200B/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;!?])/g, '$1')
            .replace(/\s*-\s*/g, '-')
            .trim();
    }

    private resolveSentenceForWord(wordEl: HTMLElement): string {
        const candidateContainers = [
            wordEl.closest('[data-ln-subtitle-fallback="true"]'),
            wordEl.closest('.subtitle-text'),
            wordEl.closest('.subtitle-container'),
            wordEl.closest('[data-track]'),
            wordEl.closest('.asbplayer-subtitles'),
            wordEl.parentElement,
        ].filter(Boolean) as HTMLElement[];

        for (const container of candidateContainers) {
            const normalized = this.normalizeSentence(container.textContent || '');
            if (normalized.length >= 8 && normalized.split(' ').length >= 2) {
                return normalized;
            }
        }

        const dataSentence = this.normalizeSentence(wordEl.dataset.sentence || '');
        if (dataSentence.length > 0) {
            return dataSentence;
        }

        return this.normalizeSentence(wordEl.textContent || '');
    }

    private getMaxHorizontalOffset(): number {
        const minVisiblePixels = 120;
        return Math.max(0, window.innerWidth - minVisiblePixels);
    }

    private clampHorizontalOffset(value: number): number {
        return Math.max(0, Math.min(this.getMaxHorizontalOffset(), value));
    }

    private applyIframeTransform(): void {
        if (!this.iframe) {
            return;
        }

        this.horizontalOffsetX = this.clampHorizontalOffset(this.horizontalOffsetX);
        this.iframe.style.transform = `translate(${-this.horizontalOffsetX}px, 0px)`;
        this.iframe.style.transition = this.isDraggingPill
            ? 'none'
            : 'width 0.28s ease, height 0.34s ease, transform 0.22s ease';
    }

    constructor() {
        const storage = new ExtensionSettingsStorage();
        this.settingsProvider = new SettingsProvider(storage);
        this.popup = getWordPopup(this.settingsProvider);
    }

    async initialize(): Promise<void> {
        console.log('[LN Page Colorizer] Starting...');

        const persisted = await browser.storage.local.get([
            GLOBAL_PILL_HIDDEN_KEY,
            GLOBAL_COLORIZER_ENABLED_KEY,
            GLOBAL_PILL_OFFSET_X_KEY,
        ]);
        this.userHidden = persisted?.[GLOBAL_PILL_HIDDEN_KEY] === true;
        this.colorizeEnabled = persisted?.[GLOBAL_COLORIZER_ENABLED_KEY] !== false;
        const storedOffset = Number(persisted?.[GLOBAL_PILL_OFFSET_X_KEY] ?? 0);
        if (Number.isFinite(storedOffset)) {
            this.horizontalOffsetX = this.clampHorizontalOffset(storedOffset);
        }

        this.createIframeOverlay();
        this.updateGlobalPillVisibility();

        this.runtimeMessageListener = (message: any) => {
            if (message?.command === 'show-global-pill') {
                this.userHidden = false;
                void browser.storage.local.set({ [GLOBAL_PILL_HIDDEN_KEY]: false });
                if (!this.iframe) {
                    this.createIframeOverlay();
                }
                this.updateGlobalPillVisibility();
            }
        };
        browser.runtime.onMessage.addListener(this.runtimeMessageListener);

        const settings = await this.settingsProvider.get([
            'metheusEnabled',
            'metheusSyncKnownWords',
            'metheusTargetLanguage',
        ]);

        // If disabled, just stop here.
        if (!settings.metheusEnabled || !settings.metheusSyncKnownWords) {
            console.log('[LN Page Colorizer] Metheus disabled, stopping colorizer');
            return;
        }

        // 2. Logic for Colorizer (Text)
        console.log('[LN Page Colorizer] Initializing colorizer...');

        // 3. Logic for Smart Visibility (Video Scroll)
        // If active video is ON SCREEN -> Hide Global Pill
        // If active video is OFF SCREEN -> Show Global Pill
        const videoObserver = new IntersectionObserver(
            () => {
                this.updateGlobalPillVisibility();
            },
            { threshold: [0, 0.1, 0.25, 0.5] }
        );

        // Observe existing videos
        document.querySelectorAll('video').forEach((v) => {
            if (v.offsetWidth > 100 && v.offsetHeight > 100) {
                videoObserver.observe(v);
            }
        });

        // Also observe new videos (if user navigates SPA)
        const videoMutationObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length) {
                    m.addedNodes.forEach((node) => {
                        if (node instanceof HTMLVideoElement) videoObserver.observe(node);
                        if (node instanceof HTMLElement) {
                            node.querySelectorAll('video').forEach((v) => videoObserver.observe(v));
                        }
                    });
                }
            }
            this.updateGlobalPillVisibility();
        });
        videoMutationObserver.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('scroll', () => this.updateGlobalPillVisibility(), { passive: true });
        window.addEventListener('resize', () => this.updateGlobalPillVisibility(), { passive: true });

        if (this.visibilityIntervalId !== null) {
            clearInterval(this.visibilityIntervalId);
        }
        this.visibilityIntervalId = window.setInterval(() => this.updateGlobalPillVisibility(), 250);

        try {
            this.colorizer = new SubtitleColorizer(this.settingsProvider, {
                skipCommonWords: true,
                minWordLength: 2,
                enableL1Detection: true,
                l1MinFrequency: 5,
            });

            await this.colorizer.initialize();

            this.colorizer.onWordClick = async (word: string, sentence: string, element: HTMLElement) => {
                const rect = element.getBoundingClientRect();
                await this.popup.show(word, sentence, {
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 10,
                    anchorRect: rect,
                    subtitleLanguage: settings.metheusTargetLanguage || 'en',
                });
            };

            // Start colorizing
            // Increase max elements to cover comments/reviews which might be further down
            this.maxElements = 1000;
            this.colorizeSafeElements();

            document.addEventListener(
                'click',
                async (event) => {
                    const target = event.target as HTMLElement | null;
                    const wordEl = target?.closest('.ln-word') as HTMLElement | null;
                    if (!wordEl) {
                        return;
                    }

                    const word = wordEl.dataset.word || wordEl.textContent?.trim() || '';
                    if (!word) {
                        return;
                    }

                    const sentence = this.resolveSentenceForWord(wordEl);
                    const rect = wordEl.getBoundingClientRect();
                    await this.popup.show(word, sentence, {
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 10,
                        anchorRect: rect,
                        subtitleLanguage: settings.metheusTargetLanguage || 'en',
                    });
                },
                true
            );

            // Set up observer for dynamic content
            this.setupObserver();

            console.log('[LN Page Colorizer] Colorizer ready');
        } catch (e) {
            console.error('[LN Page Colorizer] Error:', e);
        }
    }

    private createIframeOverlay(): void {
        console.log('[LN Page Colorizer] Creating REAL SmartHubPill with iframe...');

        try {
            // Remove existing
            const existing = document.getElementById('ln-smart-hub-pill-iframe');
            if (existing) existing.remove();

            // Create iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'ln-smart-hub-pill-iframe';
            iframe.src = browser.runtime.getURL('/smart-hub-pill-ui.html' as any);
            iframe.style.cssText = `
                position: fixed !important;
                top: 16px !important;
                right: 16px !important;
                width: 320px !important;
                height: 80px !important;
                z-index: 2147483647 !important;
                border: none !important;
                background: transparent !important;
                background-color: transparent !important;
                color-scheme: dark !important;
                transition: width 0.28s ease, height 0.34s ease, transform 0.22s ease !important;
                pointer-events: auto !important;
                overflow: visible !important;
                transform: translate(${-this.horizontalOffsetX}px, 0px) !important;
            `;

            // Allow transparency
            iframe.setAttribute('allowtransparency', 'true');

            // Add message listener for iframe communication
            window.addEventListener('message', (event) => {
                // Handle messages from SmartHudPill
                const sender = event.data?.sender;
                const message = event.data?.message;

                if (sender !== 'asbplayer-mobile-overlay') {
                    return;
                }

                switch (message?.command) {
                    case 'pill-state-changed':
                        // Adjust iframe size based on pill state
                        if (message.isExpanded) {
                            if (this.collapseResizeTimeoutId !== null) {
                                clearTimeout(this.collapseResizeTimeoutId);
                                this.collapseResizeTimeoutId = null;
                            }
                            iframe.style.width = '320px';
                            iframe.style.height = '380px';
                        } else {
                            if (this.collapseResizeTimeoutId !== null) {
                                clearTimeout(this.collapseResizeTimeoutId);
                            }

                            // Keep expanded bounds a little longer so collapse animation is not cut.
                            this.collapseResizeTimeoutId = window.setTimeout(() => {
                                if (this.iframe !== iframe) {
                                    return;
                                }

                                iframe.style.width = '320px';
                                iframe.style.height = '80px';
                                this.collapseResizeTimeoutId = null;
                            }, 1000);
                        }
                        break;
                    case 'video-pill-track-state':
                        this.videoPillEmptyTrack = !!message.emptySubtitleTrack;
                        break;
                    case 'pill-drag-delta':
                        if (message.source !== 'global' || !this.iframe) {
                            break;
                        }

                        {
                            const deltaX = Number(message.deltaX ?? 0);
                            if (!Number.isFinite(deltaX)) {
                                break;
                            }

                            this.horizontalOffsetX = this.clampHorizontalOffset(this.horizontalOffsetX + deltaX);
                            this.isDraggingPill = true;
                            this.applyIframeTransform();
                        }
                        break;
                    case 'pill-drag-end':
                        if (message.source !== 'global') {
                            break;
                        }

                        this.isDraggingPill = false;
                        this.applyIframeTransform();
                        void browser.storage.local.set({
                            [GLOBAL_PILL_OFFSET_X_KEY]: Math.round(this.horizontalOffsetX),
                        });
                        break;
                    case 'hide-overlay':
                        // Hide the pill
                        if (this.collapseResizeTimeoutId !== null) {
                            clearTimeout(this.collapseResizeTimeoutId);
                            this.collapseResizeTimeoutId = null;
                        }
                        this.userHidden = true;
                        void browser.storage.local.set({ [GLOBAL_PILL_HIDDEN_KEY]: true });
                        iframe.remove();
                        this.iframe = null;
                        break;
                    case 'toggle-colorize':
                        // Toggle colorization
                        this.colorizeEnabled = !this.colorizeEnabled;
                        void browser.storage.local.set({ [GLOBAL_COLORIZER_ENABLED_KEY]: this.colorizeEnabled });
                        if (this.colorizeEnabled) {
                            // Reset processed count to allow re-colorization
                            this.processedCount = 0;
                            this.colorizeSafeElements();
                            console.log('[LN Page Colorizer] Colorize ENABLED');
                        } else {
                            this.decolorizeElements();
                            console.log('[LN Page Colorizer] Colorize DISABLED - text restored');
                        }
                        break;
                    case 'open-subtitle-tracks':
                        // Open side panel
                        browser.runtime.sendMessage({
                            sender: 'asbplayerv2',
                            message: { command: 'open-side-panel' },
                        });
                        console.log('[LN Page Colorizer] Opening side panel');
                        break;
                }
            });

            // Add to page
            if (document.body) {
                document.body.appendChild(iframe);
            } else {
                document.documentElement.appendChild(iframe);
            }

            this.iframe = iframe;
            this.applyIframeTransform();
            this.updateGlobalPillVisibility();
            console.log('[LN Page Colorizer] REAL SmartHubPill iframe mounted successfully!');
        } catch (e) {
            console.error('[LN Page Colorizer] Error creating iframe overlay:', e);
        }
    }

    private hasVisibleVideoOnScreen(): boolean {
        const videos = Array.from(document.querySelectorAll('video'));
        return videos.some((video) => isVideoVisibleInViewport(video as HTMLVideoElement));
    }

    private hasVisibleVideoPillOnScreen(): boolean {
        if (this.videoPillEmptyTrack) {
            return false;
        }

        const overlayContainers = Array.from(
            document.querySelectorAll<HTMLElement>(
                '.asbplayer-mobile-video-overlay-container-top, .asbplayer-mobile-video-overlay-container-bottom'
            )
        );

        return overlayContainers.some((container) => {
            const style = window.getComputedStyle(container);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) {
                return false;
            }

            const hasIframe = container.querySelector('iframe') !== null;
            if (!hasIframe) {
                return false;
            }

            const rect = container.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 20) {
                return false;
            }

            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const overlapX = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
            const overlapY = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

            return overlapX * overlapY > 0;
        });
    }

    private updateGlobalPillVisibility(): void {
        if (!this.iframe) {
            return;
        }

        this.applyIframeTransform();

        if (this.userHidden) {
            this.iframe.style.display = 'none';
            return;
        }

        const hasVisibleVideo = this.hasVisibleVideoOnScreen();
        const hasVisibleVideoPill = this.hasVisibleVideoPillOnScreen();
        const playingVideoNow = hasActiveVideo();

        this.iframe.contentWindow?.postMessage(
            {
                sender: 'asbplayer-page-colorizer',
                message: {
                    command: 'global-playback-state',
                    isPlaying: playingVideoNow,
                },
            },
            '*'
        );

        // Global pill is the fallback: if video pill is missing/not visible, keep global visible.
        const showGlobal = !hasVisibleVideo || this.videoPillEmptyTrack || !hasVisibleVideoPill;
        this.iframe.style.display = showGlobal ? 'block' : 'none';
    }

    private colorizeSafeElements(): void {
        if (!this.colorizer || !this.colorizeEnabled) {
            console.log('[LN Page Colorizer] Skipping colorize:', {
                hasColorizer: !!this.colorizer,
                colorizeEnabled: this.colorizeEnabled,
                processedCount: this.processedCount,
                maxElements: this.maxElements,
            });
            return;
        }

        console.log('[LN Page Colorizer] Scanning for elements...');
        let totalFound = 0;
        let colorizedCount = 0;
        let rejectedSafeCheck = 0;
        let subtitleFallbackColorizedCount = 0;

        // Check each selector
        this.isApplyingColorization = true;
        for (const selector of SAFE_COLORIZE_SELECTORS) {
            const elements = document.querySelectorAll<HTMLElement>(selector);

            if (elements.length > 0) {
                console.log(`[LN Page Colorizer] Selector "${selector}": ${elements.length} elements`);

                for (const el of elements) {
                    totalFound++;

                    if (this.processedCount >= this.maxElements) break;

                    // Use new stricter check
                    if (!isSafeToColorize(el)) {
                        rejectedSafeCheck++;
                        if (rejectedSafeCheck <= 5) {
                            // Log why it was rejected (briefly)
                            const hasKids = el.children.length > 0;
                            const cls = el.className ? `.${String(el.className).substring(0, 20)}` : '';
                            console.log(`  [Rejected] ${el.tagName}${cls} (Kids: ${hasKids})`);
                        }
                        continue;
                    }

                    // Colorize it!
                    try {
                        // Save original HTML before colorizing
                        if (!el.dataset.lnOriginalHtml) {
                            el.dataset.lnOriginalHtml = el.innerHTML;
                        }

                        const changed = this.colorizeTextNodesInElement(el);

                        if (changed) {
                            el.dataset.lnPageColorized = 'true';
                            this.processedCount++;
                            colorizedCount++;
                            if (colorizedCount <= 3) {
                                const textPreview = (el.textContent || '').trim().substring(0, 30);
                                console.log(`  [Colorized] ${el.tagName}: "${textPreview}..."`);
                            }
                        }
                    } catch (e) {
                        console.error('[LN Page Colorizer] Error colorizing element:', e);
                        // Restore if failed
                        delete el.dataset.lnPageColorized;
                    }
                }
            }

            if (this.processedCount >= this.maxElements) break;
        }

        subtitleFallbackColorizedCount = this.colorizeSubtitleLikeElements();
        this.isApplyingColorization = false;

        console.log('[LN Page Colorizer] Summary:', {
            totalElementsFound: totalFound,
            rejectedBySafeCheck: rejectedSafeCheck,
            colorized: colorizedCount,
            subtitleFallbackColorized: subtitleFallbackColorizedCount,
            totalProcessed: this.processedCount,
        });
    }

    private colorizeSubtitleLikeElements(): number {
        if (!this.colorizer || !this.colorizeEnabled) {
            return 0;
        }

        if (document.querySelector('[data-track], [data-ln-colorized="true"]')) {
            return 0;
        }

        if (this.hasVisibleVideoPillOnScreen() && !this.videoPillEmptyTrack) {
            return 0;
        }

        let colorizedCount = 0;

        for (const selector of SUBTITLE_FALLBACK_SELECTORS) {
            const elements = document.querySelectorAll<HTMLElement>(selector);
            for (const el of elements) {
                try {
                    if (!isSafeSubtitleFallbackTarget(el)) {
                        continue;
                    }

                    this.unwrapLnWords(el);

                    const changed = this.colorizeTextNodesInElement(el, { allowSubtitleLike: true });
                    if (changed) {
                        el.dataset.lnPageColorized = 'true';
                        el.dataset.lnSubtitleFallback = 'true';
                        colorizedCount++;
                    }
                } catch (e) {
                    console.error('[LN Page Colorizer] Error in subtitle fallback colorizer:', e);
                    delete el.dataset.lnPageColorized;
                }
            }
        }

        return colorizedCount;
    }

    private colorizeTextNodesInElement(root: HTMLElement, options?: { allowSubtitleLike?: boolean }): boolean {
        if (!this.colorizer) {
            return false;
        }

        const allowSubtitleLike = options?.allowSubtitleLike === true;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const replacements: Array<{ textNode: Text; colorized: string; originalText: string }> = [];

        while (walker.nextNode()) {
            const textNode = walker.currentNode as Text;
            const originalText = textNode.nodeValue || '';
            if (!originalText.trim()) {
                continue;
            }

            const parent = textNode.parentElement;
            if (!parent) {
                continue;
            }

            if (!allowSubtitleLike && isSubtitleLikeElement(parent)) {
                continue;
            }

            const activeExcludeSelector = allowSubtitleLike
                ? SUBTITLE_TEXT_NODE_EXCLUDE_ANCESTOR_SELECTOR
                : TEXT_NODE_EXCLUDE_ANCESTOR_SELECTOR;

            if (parent.closest(activeExcludeSelector)) {
                continue;
            }

            const normalizedLength = originalText.trim().length;
            if (normalizedLength < (allowSubtitleLike ? 2 : MIN_TEXT_LENGTH)) {
                continue;
            }

            const colorized = this.colorizer.tokenizeAndColorizeSync(originalText);
            if (colorized === originalText) {
                continue;
            }

            replacements.push({ textNode, colorized, originalText });
        }

        if (replacements.length === 0) {
            return false;
        }

        for (const { textNode, colorized } of replacements) {
            const template = document.createElement('template');
            template.innerHTML = colorized;
            textNode.replaceWith(template.content.cloneNode(true));
        }

        return true;
    }

    private decolorizeElements(): void {
        console.log('[LN Page Colorizer] Restoring original text...');
        let restoredCount = 0;

        // Find all colorized elements and restore their original HTML
        const colorizedElements = document.querySelectorAll('[data-ln-page-colorized="true"]');

        for (const el of colorizedElements) {
            const htmlElement = el as HTMLElement;
            const originalHtml = htmlElement.dataset.lnOriginalHtml;

            if (originalHtml && htmlElement.dataset.lnSubtitleFallback !== 'true') {
                htmlElement.innerHTML = originalHtml;
                restoredCount++;
            } else {
                this.unwrapLnWords(htmlElement);
            }

            // Remove the colorized flag but keep originalHtml for potential re-colorization
            delete htmlElement.dataset.lnPageColorized;
            delete htmlElement.dataset.lnSubtitleFallback;
        }

        console.log('[LN Page Colorizer] Restored', restoredCount, 'elements');
    }

    private setupObserver(): void {
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
            if (this.isApplyingColorization) {
                return;
            }

            if (!this.colorizeEnabled || this.processedCount >= this.maxElements) return;

            let hasNewContent = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    hasNewContent = true;
                    break;
                }
            }

            if (hasNewContent) {
                if (this.subtitleDebounceId !== null) {
                    clearTimeout(this.subtitleDebounceId);
                }

                this.subtitleDebounceId = window.setTimeout(() => {
                    this.colorizeSubtitleLikeElements();
                }, 80);

                if (this.colorizeDebounceId !== null) {
                    clearTimeout(this.colorizeDebounceId);
                }

                this.colorizeDebounceId = window.setTimeout(() => {
                    this.colorizeSafeElements();
                }, 320);
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    private unwrapLnWords(root: HTMLElement): void {
        const wrappedWords = root.querySelectorAll('span.ln-word');
        for (const wordNode of wrappedWords) {
            const text = document.createTextNode(wordNode.textContent || '');
            wordNode.replaceWith(text);
        }
    }
}

export default defineContentScript({
    matches: ['<all_urls>'],
    excludeGlobs: [
        '*://killergerbah.github.io/asbplayer*',
        '*://app.asbplayer.dev/*',
        '*://metheus.app/*',
        '*://*.metheus.app/*',
        'http://localhost:*/*',
        'http://127.0.0.1:*/*',
        'https://localhost:*/*',
        'https://127.0.0.1:*/*',
    ],
    allFrames: false,
    runAt: 'document_idle',

    main(ctx: ContentScriptContext) {
        const host = window.location.hostname.toLowerCase();
        const referrer = document.referrer.toLowerCase();
        const shouldDisableOnHost =
            host === 'metheus.app' || host === 'www.metheus.app' || host === 'localhost' || host === '127.0.0.1';
        const shouldDisableOnReferrer =
            referrer.includes('metheus.app') || referrer.includes('localhost') || referrer.includes('127.0.0.1');

        if (shouldDisableOnHost || shouldDisableOnReferrer) {
            return;
        }

        console.log('[LN Page Colorizer] Loaded - REAL SmartHubPill iframe version');

        // Wait for page to fully load, then initialize
        const init = () => {
            const colorizer = new PageColorizer();
            void colorizer.initialize();
        };

        if (document.readyState === 'complete') {
            setTimeout(init, 1000);
        } else {
            window.addEventListener('load', () => setTimeout(init, 1000));
        }
    },
});
