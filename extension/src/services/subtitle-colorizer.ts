/**
 * SUBTITLE COLORIZER
 *
 * Colorizes subtitle text based on word knowledge levels from Metheus.
 * Integrates with the sync service to get word status and updates colors in real-time.
 * Also detects L+1 words (unknown but learnable) using frequency data.
 */

import { SettingsProvider } from '@metheus/common/settings';
import { getMetheusSyncService, MetheusSyncService, WordStatus } from './metheus-sync';
import {
    LPlusOneEngine,
    getEmbeddedEnglishFrequency,
    getWordFrequencyRank,
    isL1Candidate as checkL1Candidate,
    normalizeWord,
    type FrequencyData,
} from '@metheus/common/l-plus-one';
import { KnownWordsProviderAdapter } from './known-words-provider-adapter';

// Word status to CSS class mapping
const STATUS_CLASSES: Record<WordStatus, string> = {
    0: 'ln-unknown',
    1: 'ln-learning',
    2: 'ln-familiar',
    3: 'ln-almost-known',
    4: 'ln-known',
    5: 'ln-known',
};

// E-M2 FIX: Cache Intl.Segmenter instances per language to avoid re-instantiation
const _segmenterCache = new Map<string, any>();

// Tokenization using Intl.Segmenter (same as web app)
function tokenizeText(text: string, language: string = 'en'): { text: string; isWord: boolean }[] {
    if (!text) return [];

    try {
        // Use cached Intl.Segmenter instance
        let segmenter = _segmenterCache.get(language);
        if (!segmenter) {
            // @ts-ignore
            segmenter = new Intl.Segmenter(language, { granularity: 'word' });
            _segmenterCache.set(language, segmenter);
        }

        // @ts-ignore
        const segments = segmenter.segment(text);

        const tokens: { text: string; isWord: boolean }[] = [];

        // @ts-ignore
        for (const segment of segments) {
            // isWordLike is available in most modern browsers for 'word' granularity
            // Fallback: simple regex check if isWordLike is undefined
            const isWord =
                segment.isWordLike !== undefined
                    ? segment.isWordLike
                    : /[a-zA-Z0-9À-ÿ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(segment.segment);

            tokens.push({
                text: segment.segment,
                isWord,
            });
        }

        return tokens;
    } catch (e) {
        console.warn('Intl.Segmenter not supported or failed, falling back to regex', e);
        // Fallback to original regex logic for older environments or errors
        const parts = text.split(/([a-zA-Z0-9À-ÿ]+)/g);
        return parts
            .map((token) => {
                if (!token) return null;
                const isWord = /[a-zA-Z0-9À-ÿ]/.test(token);
                return { text: token, isWord };
            })
            .filter((t): t is { text: string; isWord: boolean } => t !== null);
    }
}

// E-L2 FIX: normalizeWord imported from @metheus/common/l-plus-one/tokenizer
// to ensure consistent normalization across colorizer and tokenizer

export interface ColorizerOptions {
    skipCommonWords?: boolean;
    minWordLength?: number;
    enableL1Detection?: boolean;
    /** Minimum frequency score (1-10) for L+1 highlighting */
    l1MinFrequency?: number;
}

export class SubtitleColorizer {
    private syncService: MetheusSyncService;
    private settingsProvider: SettingsProvider;
    private observer: MutationObserver | null = null;
    private language: string = 'en';
    private options: ColorizerOptions;
    private styleInjected: boolean = false;
    private wordClickHandlers: Map<HTMLElement, (e: MouseEvent) => void> = new Map();
    public onWordClick?: (word: string, sentence: string, element: HTMLElement) => void;
    private frequencyData: FrequencyData | null = null;
    private knownWordsAdapter: KnownWordsProviderAdapter | null = null;

    constructor(settingsProvider: SettingsProvider, options: ColorizerOptions = {}) {
        this.settingsProvider = settingsProvider;
        this.syncService = getMetheusSyncService(settingsProvider);
        this.options = {
            skipCommonWords: true,
            minWordLength: 2,
            enableL1Detection: true,
            l1MinFrequency: 5,
            ...options,
        };
    }

    /**
     * Initialize the colorizer
     */
    async initialize(): Promise<void> {
        const settings = await this.settingsProvider.get([
            'metheusEnabled',
            'metheusSyncKnownWords',
            'metheusTargetLanguage',
        ]);

        if (!settings.metheusEnabled || !settings.metheusSyncKnownWords) {
            console.log('[LN Colorizer] Disabled or sync not enabled');
            return;
        }

        this.language = settings.metheusTargetLanguage || 'en';

        // Load known words
        await this.syncService.loadKnownWords(this.language);

        // Create known words adapter for L+1 detection
        this.knownWordsAdapter = new KnownWordsProviderAdapter(this.syncService, this.language);
        await this.knownWordsAdapter.initialize();

        // Load frequency data for L+1 detection
        if (this.options.enableL1Detection) {
            // Use embedded data for now (fast startup)
            if (this.language === 'en') {
                this.frequencyData = getEmbeddedEnglishFrequency();
            }
            // TODO: Load full frequency data from platform asynchronously
        }

        // Inject styles
        this.injectStyles();

        // Global Capture Trap for Netflix/etc.
        this.boundHandleGlobalClick = this.handleGlobalClick.bind(this);
        window.addEventListener('click', this.boundHandleGlobalClick, { capture: true });
        window.addEventListener('mousedown', this.boundHandleGlobalClick, { capture: true });
        window.addEventListener('mouseup', this.boundHandleGlobalClick, { capture: true });

        console.log('[LN Colorizer] Initialized for language:', this.language);
    }

    private boundHandleGlobalClick: (e: MouseEvent) => void = () => {};

    /**
     * Global Capture Handler to intercept clicks before video players
     */
    private handleGlobalClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const wordEl = target.closest('.ln-word') as HTMLElement;

        if (wordEl) {
            // It's one of ours! Kill the event immediately.
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Only trigger action on correct event phase (usually click)
            if (e.type === 'click') {
                const word = wordEl.dataset.word || wordEl.textContent || '';
                const sentence = wordEl.dataset.sentence || '';

                // Reuse existing logic
                // Clear previous active highlights
                this.clearActiveHighlight();
                wordEl.classList.add('ln-word-active');

                if (this.onWordClick) {
                    this.onWordClick(word, sentence, wordEl);
                }
            }
        }
    }

    /**
     * Set the target language
     */
    setLanguage(language: string): void {
        if (this.language !== language) {
            this.language = language;
            console.log('[LN Colorizer] Language changed to:', language);
        }
    }

    /**
     * Get the current language
     */
    getLanguage(): string {
        return this.language;
    }

    /**
     * Inject CSS styles into the page
     */
    private injectStyles(): void {
        if (this.styleInjected) return;

        const styleId = 'ln-subtitle-styles';
        if (document.getElementById(styleId)) {
            this.styleInjected = true;
            return;
        }

        // Context-aware separation strategy - BORDER APPROACH
        // Panel: background-image works perfectly
        // Video: Use border-bottom which ALWAYS puts line below content
        const isExtensionContext = window.location.protocol.includes('extension');

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .ln-word {
                cursor: pointer;
                transition: all 0.15s ease;
                display: inline-block;
                pointer-events: auto !important;
                color: inherit;
                text-shadow: inherit;
                border-radius: 0;
                -webkit-box-decoration-break: clone;
                box-decoration-break: clone;
                ${isExtensionContext ? 'text-decoration-skip-ink: auto;' : ''}
                
                margin: 0 1px; /* drastically reduced from 3px to 1px */
                padding: 0 1px ${isExtensionContext ? '2px' : '0'} 1px; /* reduced from 2px to 1px */
                vertical-align: baseline;
                line-height: inherit;
            }

            .ln-word:hover {
                background-color: rgba(131, 131, 131, 0.2);
                border-radius: 2px;
            }

            .ln-word-active:hover {
                background-color: transparent !important;
            }

            /* KNOWN = No special styling, just inherit */
            .ln-known { 
                font-weight: 700;
            }

            /* NEW = Cyan underline (scales with text size, 80% width) */
            .ln-unknown { 
                font-weight: 700;
                text-decoration: none;
                border-bottom: none;
                background-image: linear-gradient(to right, #00F0FF, #00F0FF);
                background-repeat: no-repeat;
                background-position: center bottom;
                background-size: 80% 0.15em;
            }

            /* LEARNING = Yellow underline (scales with text size) */
            .ln-learning {
                font-weight: 700 !important;
                color: inherit !important;
                text-decoration: none !important;
                border-bottom: none !important;
                background-image: linear-gradient(to right, #FCEE0A, #FCEE0A) !important;
                background-repeat: no-repeat !important;
                background-position: center bottom !important;
                background-size: 80% 0.15em !important;
            }

            /* FAMILIAR = Yellow underline (78% opacity) */
            .ln-familiar {
                font-weight: 800 !important;
                color: inherit !important;
                text-decoration: none !important;
                border-bottom: none !important;
                background-image: linear-gradient(to right, rgba(252, 238, 10, 0.78), rgba(252, 238, 10, 0.78)) !important;
                background-repeat: no-repeat !important;
                background-position: center bottom !important;
                background-size: 80% 0.15em !important;
            }

            /* ALMOST KNOWN = Yellow underline (58% opacity) */
            .ln-almost-known {
                font-weight: 800 !important;
                color: inherit !important;
                text-decoration: none !important;
                border-bottom: none !important;
                background-image: linear-gradient(to right, rgba(252, 238, 10, 0.58), rgba(252, 238, 10, 0.58)) !important;
                background-repeat: no-repeat !important;
                background-position: center bottom !important;
                background-size: 80% 0.15em !important;
            }

            /* L+1 = Violet neon box - important learnable words */
            .ln-l-plus-one {
                font-weight: 700 !important;
                color: #a855f7 !important; /* Strong violet text */
                text-decoration: none !important;
                border: 2px solid rgba(168, 85, 247, 0.8) !important; /* Strong violet border */
                border-radius: 12px !important;
                background-color: rgba(168, 85, 247, 0.15) !important; /* Soft violet background */
                padding: 1px 4px !important;
                box-shadow: 0 0 8px rgba(168, 85, 247, 0.4) !important; /* Neon glow */
            }

            /* Active highlight style */
            .ln-word-active {
                text-decoration: none !important;
                border: none !important;
                outline: 2px solid rgba(0, 240, 255, 0.75) !important; 
                outline-offset: 1px !important;
                border-radius: 12px !important;
                box-shadow: 0 2px 10px rgba(0,0,0,0.35) !important;
                z-index: 2147483640 !important;
                position: relative;
                display: inline-block !important;
                background-image: none !important;
                background-size: 0 0 !important;
                background-position: 0 0 !important;
                background-repeat: no-repeat !important;
                background-color: rgba(0, 240, 255, 0.4) !important;
                color: inherit !important;
                padding: 0 2px ${isExtensionContext ? '2px' : '0'} 2px !important; /* Match .ln-word */
            }

            .ln-word-active.ln-unknown {
                outline-color: rgba(0, 240, 255, 0.85) !important;
                background-color: rgba(0, 240, 255, 0.4) !important;
            }

            .ln-word-active.ln-learning,
            .ln-word-active.ln-familiar,
            .ln-word-active.ln-almost-known {
                outline-color: rgba(252, 238, 10, 0.9) !important;
                background-color: rgba(252, 238, 10, 0.4) !important;
            }

            .ln-word-active.ln-known {
                outline-color: rgba(57, 255, 20, 0.9) !important;
                background-color: rgba(57, 255, 20, 0.4) !important;
            }
        `;
        document.head.appendChild(style);
        this.styleInjected = true;
    }

    /**
     * Set word click handler
     */
    setOnWordClick(handler: (word: string, sentence: string, element: HTMLElement) => void): void {
        this.onWordClick = handler;
    }

    /**
     * Process text and return HTML with Metheus coloring.
     * This replaces the old DOM mutation approach.
     */
    /**
     * Get HTML for subtitles (Synchronous version for performance)
     */
    getHtmlForSubtitlesSync(text: string, languageOverride?: string): string {
        return this.tokenizeAndColorizeSync(text, languageOverride);
    }

    /**
     * Process text and return HTML with Metheus coloring.
     * This replaces the old DOM mutation approach.
     */
    async getHtmlForSubtitles(text: string, languageOverride?: string): Promise<string> {
        return this.tokenizeAndColorizeSync(text, languageOverride);
    }

    /**
     * Colorize a subtitle element
     * @deprecated Use getHtmlForSubtitles instead
     */
    async colorize(element: HTMLElement): Promise<void> {
        if (!element || element.dataset.lnColorized === 'true') {
            return;
        }

        const text = element.textContent || '';
        if (!text.trim()) return;

        // Mark as colorized to prevent re-processing
        element.dataset.lnColorized = 'true';

        // Tokenize and colorize
        const colorizedHTML = await this.tokenizeAndColorize(text);

        // Only update if we actually colorized something
        if (colorizedHTML !== text) {
            element.innerHTML = colorizedHTML;
            this.attachClickHandlers(element, text);
        }
    }

    /**
     * Tokenize text and wrap words with appropriate classes (Synchronous)
     */
    public tokenizeAndColorizeSync(text: string, languageOverride?: string): string {
        const lang = languageOverride || this.language;
        const tokens = tokenizeText(text, lang);
        const result: string[] = [];

        for (const token of tokens) {
            if (!token.isWord) {
                result.push(token.text);
                continue;
            }

            if (this.isClickableToken(token.text)) {
                const normalized = normalizeWord(token.text);

                let className = 'ln-unknown';
                if (this.shouldApplyStatusStyle(token.text)) {
                    const status = this.syncService.getWordStatusSync(normalized, lang);
                    className = this.getWordClass(normalized, status);
                }

                const cjkClass = ['ja', 'zh', 'ko'].includes(lang) ? ' ln-cjk' : '';
                result.push(
                    `<span class="ln-word ${className}${cjkClass}" data-word="${this.escapeHtml(normalized)}" data-sentence="${this.escapeHtml(text)}">${this.escapeHtml(token.text)}</span>`
                );
            } else {
                result.push(this.escapeHtml(token.text));
            }
        }

        return result.join('');
    }

    /**
     * Tokenize text and wrap words with appropriate classes
     * @deprecated Use tokenizeAndColorizeSync
     */
    private async tokenizeAndColorize(text: string, languageOverride?: string): Promise<string> {
        return this.tokenizeAndColorizeSync(text, languageOverride);
    }

    /**
     * Determine if a token should be clickable.
     *
     * Important: Clickability must be more permissive than styling.
     * Otherwise, tokens in some languages (CJK, etc.) will remain plain text and cannot open the popup.
     */
    private isClickableToken(token: string): boolean {
        const normalized = normalizeWord(token);

        if (!normalized) {
            return false;
        }

        // Exclude pure numbers
        if (/^\d+$/.test(normalized)) {
            return false;
        }

        // Require at least one letter/mark/number in *any* script
        // This is intentionally permissive to keep rare-language tokens clickable.
        return /[\p{L}\p{M}\p{N}]/u.test(normalized);
    }

    /**
     * Determine if a token should receive status styling.
     * Kept for compatibility with previous behavior.
     */
    private shouldApplyStatusStyle(token: string): boolean {
        const normalized = normalizeWord(token);

        // Check minimum length
        if (normalized.length < (this.options.minWordLength || 1)) {
            return false;
        }

        // Exclude pure numbers
        if (/^\d+$/.test(normalized)) {
            return false;
        }

        return true;
    }

    /**
     * Get CSS class for a word based on its status
     */
    private getWordClass(word: string, status: WordStatus | null): string {
        const normalized = normalizeWord(word);

        if (status === null || status === 0) {
            // Unknown word - check if it's L+1 (learnable)
            if (this.options.enableL1Detection && this.frequencyData) {
                const rank = getWordFrequencyRank(normalized, this.frequencyData);
                const isL1 = checkL1Candidate(rank, this.frequencyData.totalWords, this.options.l1MinFrequency || 5);

                if (isL1) {
                    return 'ln-l-plus-one';
                }
            }
            return 'ln-unknown';
        }

        return STATUS_CLASSES[status] || 'ln-unknown';
    }

    /**
     * Check if a word is L+1 (unknown but learnable)
     */
    isL1Word(word: string): boolean {
        // Already known or learning = not L+1
        if (this.knownWordsAdapter?.isKnown(word) || this.knownWordsAdapter?.isLearning(word)) {
            return false;
        }

        // Check frequency
        if (this.frequencyData) {
            const rank = getWordFrequencyRank(normalizeWord(word), this.frequencyData);
            return checkL1Candidate(rank, this.frequencyData.totalWords, this.options.l1MinFrequency || 5);
        }

        return false;
    }

    /**
     * Attach click handlers to colorized words
     */
    private attachClickHandlers(element: HTMLElement, originalSentence: string): void {
        const wordElements = element.querySelectorAll('.ln-word');

        wordElements.forEach((wordEl) => {
            const htmlElement = wordEl as HTMLElement;
            const word = htmlElement.dataset.word || htmlElement.textContent || '';

            const handler = (e: MouseEvent) => {
                e.preventDefault();
                e.stopImmediatePropagation();

                // Clear previous active highlights
                document.querySelectorAll('.ln-word-active').forEach((el) => {
                    el.classList.remove('ln-word-active');
                });

                // Add highlight to current word
                htmlElement.classList.add('ln-word-active');

                if (this.onWordClick) {
                    this.onWordClick(word, originalSentence, htmlElement);
                }
            };

            htmlElement.addEventListener('click', handler);
            this.wordClickHandlers.set(htmlElement, handler);
        });
    }

    /**
     * Start observing for subtitle changes
     */
    startObserving(container: HTMLElement, subtitleSelector: string): void {
        if (this.observer) {
            this.observer.disconnect();
        }

        // Initial colorization
        const subtitles = container.querySelectorAll(subtitleSelector);
        subtitles.forEach((el) => this.colorize(el as HTMLElement));

        // Observe for new subtitles
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Check if this is a subtitle element
                        if (node.matches(subtitleSelector)) {
                            this.colorize(node);
                        }

                        // Check children
                        const subtitles = node.querySelectorAll(subtitleSelector);
                        subtitles.forEach((el) => this.colorize(el as HTMLElement));
                    }
                });

                // Handle characterData changes (subtitle text updates)
                if (mutation.type === 'characterData' && mutation.target.parentElement) {
                    const parent = mutation.target.parentElement;
                    if (parent.matches(subtitleSelector) || parent.closest(subtitleSelector)) {
                        // Re-colorize the subtitle
                        const subtitleEl = parent.closest(subtitleSelector) || parent;
                        subtitleEl.removeAttribute('data-ln-colorized');
                        this.colorize(subtitleEl as HTMLElement);
                    }
                }
            });
        });

        this.observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        console.log('[LN Colorizer] Started observing:', subtitleSelector);
    }

    /**
     * Stop observing
     */
    stopObserving(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        // Clean up click handlers
        this.wordClickHandlers.forEach((handler, element) => {
            element.removeEventListener('click', handler);
        });
        this.wordClickHandlers.clear();
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update word status and re-colorize
     */
    async updateWordStatus(word: string, status: WordStatus): Promise<void> {
        await this.syncService.updateWordStatus(word, this.language, status);
        this.applyWordStatusLocally(word, status);
    }

    applyWordStatusLocally(word: string, status: WordStatus): void {
        // Update all instances of this word in the DOM
        const wordElements = document.querySelectorAll(`[data-word="${word.toLowerCase()}"]`);
        wordElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            // Remove old status classes
            Object.values(STATUS_CLASSES).forEach((cls) => htmlEl.classList.remove(cls));
            htmlEl.classList.remove('ln-l-plus-one');
            // Add new status class
            htmlEl.classList.add(STATUS_CLASSES[status]);
        });
    }

    /**
     * Get sync service instance
     */
    getSyncService(): MetheusSyncService {
        return this.syncService;
    }

    /**
     * Refresh all colorization (after settings change or sync)
     */
    async refresh(): Promise<void> {
        // Reload known words
        await this.syncService.loadKnownWords(this.language);

        // Remove colorization from all elements
        const colorizedElements = document.querySelectorAll('[data-ln-colorized="true"]');
        colorizedElements.forEach((el) => {
            el.removeAttribute('data-ln-colorized');
        });

        // Re-colorize
        // This will be handled by the observer or manual call
    }

    /**
     * Refresh known words from local storage (useful for syncing between extension components)
     */
    async refreshLocal(): Promise<void> {
        await this.syncService.reloadLocalCache();
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.stopObserving();

        // Remove injected styles
        const style = document.getElementById('ln-subtitle-styles');
        if (style) {
            style.remove();
        }

        this.styleInjected = false;

        window.removeEventListener('click', this.boundHandleGlobalClick, { capture: true });
        window.removeEventListener('mousedown', this.boundHandleGlobalClick, { capture: true });
        window.removeEventListener('mouseup', this.boundHandleGlobalClick, { capture: true });
    }
    /**
     * Clear any active word highlights
     */
    clearActiveHighlight(): void {
        document.querySelectorAll('.ln-word-active').forEach((el) => {
            el.classList.remove('ln-word-active');
        });
    }
}

// Singleton instance
let _colorizer: SubtitleColorizer | null = null;

export function getSubtitleColorizer(settingsProvider: SettingsProvider): SubtitleColorizer {
    if (!_colorizer) {
        _colorizer = new SubtitleColorizer(settingsProvider);
    }
    return _colorizer;
}
