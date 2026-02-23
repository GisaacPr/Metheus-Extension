/**
 * METHEUS CONTROLLER
 *
 * Integrates Metheus services with the extension's subtitle system.
 * Handles word colorization, popup lookups, and sync with the platform.
 */

import { SettingsProvider, MetheusSettings } from '@metheus/common/settings';
import { getMetheusSyncService, MetheusSyncService, WordStatus } from '../services/metheus-sync';
import { getMetheusDictionaryService, MetheusDictionaryService, DictionaryEntry } from '../services/metheus-dictionary';
import { getSubtitleColorizer, SubtitleColorizer } from '../services/subtitle-colorizer';
import { getWordPopup, WordPopup } from '../services/word-popup';
import { VocabularyService } from '../services/vocabulary-service';
import { tokenizeText } from '../ui/dictionary-adapter';
import SubtitleController from './subtitle-controller';

export interface MetheusControllerOptions {
    onCardCreated?: (word: string, deckId: string) => void;
    onWordStatusChanged?: (word: string, status: WordStatus) => void;
}

export class MetheusController {
    private readonly _settingsProvider: SettingsProvider;
    private readonly _syncService: MetheusSyncService;
    private readonly _dictionaryService: MetheusDictionaryService;
    private readonly _colorizer: SubtitleColorizer;
    private readonly _popup: WordPopup;
    private readonly _options: MetheusControllerOptions;

    private _enabled: boolean = false;
    private _language: string = 'en';
    private _subtitleController?: SubtitleController;
    private _initialized: boolean = false;
    private _boundHandleWordClick?: (word: string, sentence: string, element: HTMLElement) => void;
    private _pausedForDictionaryPopup: boolean = false;

    constructor(settingsProvider: SettingsProvider, options: MetheusControllerOptions = {}) {
        this._settingsProvider = settingsProvider;
        this._syncService = getMetheusSyncService(settingsProvider);
        this._dictionaryService = getMetheusDictionaryService(settingsProvider);
        this._colorizer = getSubtitleColorizer(settingsProvider);
        this._popup = getWordPopup(settingsProvider);
        this._options = options;
    }

    /**
     * Initialize the controller with settings and subtitle controller
     */
    async initialize(subtitleController?: SubtitleController): Promise<void> {
        if (this._initialized) {
            return;
        }

        this._subtitleController = subtitleController;

        // Load settings
        const settings = await this._settingsProvider.get([
            'metheusEnabled',
            'metheusApiKey',
            'metheusToken',
            'metheusTargetLanguage',
            'metheusSyncKnownWords',
        ]);

        const hasAuth = !!(settings.metheusApiKey || settings.metheusToken);
        // Relaxed check: Ignore settings.metheusEnabled as it may be stale (false)
        // If we have auth, we are enabled.
        this._enabled = hasAuth;
        this._language = settings.metheusTargetLanguage || 'en';

        if (!this._enabled) {
            console.log('[Metheus] Integration disabled or not configured');
            return;
        }

        console.log('[Metheus] Initializing controller for language:', this._language);

        // Initialize services
        try {
            // Load known words
            if (settings.metheusSyncKnownWords) {
                await this._syncService.loadKnownWords(this._language);
            }

            // Initialize colorizer
            await this._colorizer.initialize();
            this._colorizer.setLanguage(this._language);

            // Set up word click handler
            this._boundHandleWordClick = this.handleWordClick.bind(this);
            this._colorizer.setOnWordClick(this._boundHandleWordClick);

            // Initialize popup callbacks
            this._popup.setOnKnowIt((word) => this._handleKnowIt(word));
            this._popup.setOnAddCard((word, sentence, definition) => this._handleAddCard(word, sentence, definition));
            this._popup.setOnClose(() => {
                if (!this._pausedForDictionaryPopup) {
                    return;
                }

                this._pausedForDictionaryPopup = false;
                const video = this._subtitleController?.videoElement;
                if (video && video.paused && !video.ended && video.readyState > 2) {
                    void video.play().catch(() => undefined);
                }
            });

            // Preload popup to avoid cold start delay on first click
            this._popup.preload();

            // Note: Side Panel popup requests are handled by MetheusShowPopupHandler in background.ts
            // That handler correctly forwards messages with sender='asbplayer-extension-to-video'

            this._initialized = true;
            console.log('[Metheus] Controller initialized successfully');
        } catch (error) {
            console.error('[Metheus] Failed to initialize:', error);
        }
    }

    /**
     * Called when subtitle text is rendered - colorize it
     */
    async colorizeSubtitle(text: string, element: HTMLElement): Promise<void> {
        if (!this._enabled || !this._initialized) {
            return;
        }

        try {
            await this._colorizer.colorize(element);
        } catch (error) {
            console.error('[Metheus] Colorization error:', error);
        }
    }

    /**
     * Start observing a container for subtitle changes
     */
    startObserving(container: HTMLElement, subtitleSelector: string = '[data-track]'): void {
        if (!this._enabled || !this._initialized) {
            return;
        }

        this._colorizer.startObserving(container, subtitleSelector);
        console.log('[Metheus] Started observing subtitles');
    }

    /**
     * Stop observing subtitles
     */
    stopObserving(): void {
        this._colorizer.stopObserving();
    }

    /**
     * Handle word click from colorizer
     */
    async handleWordClick(word: string, sentence: string, element: HTMLElement): Promise<void> {
        if (!this._enabled) return;

        console.log('[Metheus] Word clicked:', word);

        // Calculate position based on element
        // V3 Fix: Use 'div[data-track]' to find the specific subtitle line container.
        const container = element.closest('div[data-track]') || element.closest('.asbplayer-subtitles') || element;
        const containerRect = container.getBoundingClientRect();
        const wordRect = element.getBoundingClientRect();

        const position = {
            x: wordRect.left + wordRect.width / 2,
            y: wordRect.bottom,
            anchorRect: {
                // Serialized DOMRect for the popup to use
                top: containerRect.top, // Use container top to stack above the whole line
                bottom: containerRect.bottom, // Use container bottom for 'below' positioning too, to clear the line
                left: containerRect.left,
                right: containerRect.right,
                width: containerRect.width,
                height: containerRect.height,
            },
        };

        // Infer subtitle language from the clicked subtitle line (if available), otherwise fallback by script.
        const trackLangAttr = (container as HTMLElement).getAttribute?.('data-track-language') || undefined;
        const detectLangFromText = (t: string): string | undefined => {
            if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';
            if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
            if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
            return undefined;
        };
        const subtitleLanguage = trackLangAttr || detectLangFromText(sentence);

        // PHRASE DETECTION (Longest Match)
        let longestMatch: string | undefined;
        try {
            // 1. Find index of clicked word in the DOM container to enable context matching
            const wordElements = Array.from(container.querySelectorAll('.ln-word'));
            const clickedDomIndex = wordElements.indexOf(element);

            if (clickedDomIndex !== -1) {
                // 2. Tokenize sentence to get full list (words + punctuation)
                // We need `tokenizeText` - importing from adapter
                const tokens = tokenizeText(sentence, subtitleLanguage || this._language);
                const tokenStrings = tokens.map((t) => t.text);

                // 3. Map DOM index (only words) to Token Index (words + punctuation)
                let currentWordCount = 0;
                let validTokenIndex = -1;

                for (let i = 0; i < tokens.length; i++) {
                    if (tokens[i].isWord) {
                        if (currentWordCount === clickedDomIndex) {
                            validTokenIndex = i;
                            break;
                        }
                        currentWordCount++;
                    }
                }

                if (validTokenIndex !== -1) {
                    // 4. Find longest match using VocabularyService
                    const match = await VocabularyService.findLongestMatch(
                        tokenStrings,
                        validTokenIndex,
                        this._dictionaryService,
                        subtitleLanguage || this._language
                    );

                    if (match && match !== word.toLowerCase()) {
                        longestMatch = match;
                        console.log(`[Metheus] Phrase detected: "${longestMatch}"`);
                    }
                }
            }
        } catch (e) {
            console.error('[Metheus] Phrase detection failed', e);
        }

        // Show popup - it handles loading and dictionary lookup internally
        const video = this._subtitleController?.videoElement;
        this._pausedForDictionaryPopup = false;

        if (video && !video.paused && !video.ended && video.readyState > 2) {
            video.pause();
            this._pausedForDictionaryPopup = true;
        }

        await this._popup.show(word, sentence, { ...position, subtitleLanguage } as any, longestMatch);
    }

    /**
     * Handle "Know It" button click
     */
    private async _handleKnowIt(word: string): Promise<void> {
        console.log('[Metheus] Marking as known:', word);

        try {
            await this._syncService.updateWordStatus(word, this._language, 5);

            // Update colorizer cache and refresh
            this._colorizer.updateWordStatus(word, 5);

            // Notify callback
            this._options.onWordStatusChanged?.(word, 5);
        } catch (error) {
            console.error('[Metheus] Failed to update word status:', error);
        }
    }

    /**
     * Handle "Add Card" button click
     */
    private async _handleAddCard(word: string, sentence: string, definition: DictionaryEntry | null): Promise<void> {
        console.log('[Metheus] Creating card for:', word);

        // This will be handled by the card publisher service
        // Send message to background script
        try {
            const settings = await this._settingsProvider.get(['metheusTargetDeckId']);

            // Dispatch custom event for card creation
            document.dispatchEvent(
                new CustomEvent('metheus-create-card', {
                    detail: {
                        word,
                        sentence,
                        definition: definition?.definitions?.[0]?.meaning,
                        language: this._language,
                        deckId: settings.metheusTargetDeckId,
                    },
                })
            );

            this._options.onCardCreated?.(word, settings.metheusTargetDeckId || '');
        } catch (error) {
            console.error('[Metheus] Failed to create card:', error);
        }
    }

    /**
     * Handle popup request from Side Panel
     */
    private async _handleSidePanelPopupRequest(data: any): Promise<void> {
        const { word, sentence, position, subtitleLanguage } = data;

        // We want the popup to appear OUTSIDE the Side Panel document, on the actual page,
        // and visually to the LEFT of the browser Side Panel (right side of the window).
        //
        // In Chrome, the Side Panel reduces the page viewport width (window.innerWidth)
        // and shifts the visible area; however depending on platform/version, relying only on
        // window.innerWidth can still place the popup too close to the right edge.
        //
        // Strategy:
        // 1) Try to detect the actual side panel width by comparing the outer window width vs viewport width.
        // 2) Place an anchor X just to the LEFT of the side panel boundary.
        const outerW = window.outerWidth || window.innerWidth;
        const viewportW = window.innerWidth;
        const inferredSidePanelW = Math.max(0, outerW - viewportW);

        const marginFromPanel = 12;
        // If we can't infer, fallback to a conservative virtual width to avoid the very edge.
        const effectivePanelW = inferredSidePanelW > 0 ? inferredSidePanelW : 360;

        // Anchor X in page coordinates (viewport). Keep it inside the visible viewport.
        const x = Math.max(24, viewportW - effectivePanelW - marginFromPanel);
        const y = position?.y || window.innerHeight / 2;

        const popupPosition = {
            x,
            y,
            anchorRect: {
                // Mock anchor rect at the boundary between page and side panel.
                top: y,
                bottom: y + 20,
                left: x - 10,
                right: x,
                width: 10,
                height: 20,
            },
        };

        await this._popup.show(word, sentence, { ...popupPosition, subtitleLanguage } as any);
    }

    /**
     * Update word status manually
     */
    async setWordStatus(word: string, status: WordStatus): Promise<void> {
        if (!this._enabled) return;

        await this._syncService.updateWordStatus(word, this._language, status);
        this._colorizer.updateWordStatus(word, status);
        this._options.onWordStatusChanged?.(word, status);
    }

    /**
     * Get current sync status
     */
    async getSyncStatus() {
        return this._syncService.getSyncStatus();
    }

    /**
     * Force sync with server
     */
    async forceSync(): Promise<void> {
        if (!this._enabled) return;
        await this._syncService.syncToServer();
    }

    /**
     * Check if Metheus is enabled
     */
    get enabled(): boolean {
        return this._enabled;
    }

    /**
     * Get current language
     */
    get language(): string {
        return this._language;
    }

    /**
     * Update language
     */
    async setLanguage(language: string): Promise<void> {
        this._language = language;

        if (this._enabled && this._initialized) {
            this._colorizer.setLanguage(language);
            await this._syncService.loadKnownWords(language);
        }
    }

    /**
     * Unbind and cleanup
     */
    unbind(): void {
        this._colorizer.stopObserving();
        this._popup.hide();
        this._initialized = false;
    }
}

// Singleton instance
let metheusControllerInstance: MetheusController | null = null;

export function getMetheusController(settingsProvider: SettingsProvider): MetheusController {
    if (!metheusControllerInstance) {
        metheusControllerInstance = new MetheusController(settingsProvider);
    }
    return metheusControllerInstance;
}

export function resetMetheusController(): void {
    if (metheusControllerInstance) {
        metheusControllerInstance.unbind();
        metheusControllerInstance = null;
    }
}
