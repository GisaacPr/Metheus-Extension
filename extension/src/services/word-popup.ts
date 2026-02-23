/**
 * WORD POPUP COMPONENT (Refactored for React + Shadow DOM)
 *
 * Shows dictionary definition and actions when clicking a word in subtitles.
 * Allows users to mark words as known or create flashcards.
 */

import { SettingsProvider } from '@metheus/common/settings';
import { DictionaryEntry } from './metheus-dictionary';
import { mountDictionaryPopup, unmountDictionaryPopup } from '../ui/DictionaryPopupWrapper';
// @ts-ignore
import styles from '../ui/styles.css?inline';

export interface PopupPosition {
    x: number;
    y: number;
    anchorRect?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
        width: number;
        height: number;
    };
    /** Optional: detected subtitle language for this click */
    subtitleLanguage?: string;
}

export interface PopupOptions {
    onAddCard?: (word: string, sentence: string, definition: DictionaryEntry | null) => void;
    onMarkKnown?: (word: string) => void;
    onClose?: () => void;
}

export class WordPopup {
    private settingsProvider: SettingsProvider;
    private options: PopupOptions;
    private _lastProps: any = null;
    private hostElement: HTMLElement | null = null;
    private shadowRoot: ShadowRoot | null = null;

    constructor(settingsProvider: SettingsProvider, options: PopupOptions = {}) {
        this.settingsProvider = settingsProvider;
        this.options = options;
    }

    /**
     * Preload the popup (create DOM, inject styles, warm up React)
     */
    async preload(): Promise<void> {
        this._ensureInit();
        const container = this.shadowRoot?.getElementById('ln-popup-root');
        if (container) {
            // Mount hidden/closed to warm up MUI engine and React root
            mountDictionaryPopup(container, {
                word: '',
                sentence: '',
                position: { x: 0, y: 0 },
                isOpen: false,
                onClose: () => {},
                settingsProvider: this.settingsProvider,
            });
        }
    }

    private _ensureInit() {
        if (this.hostElement) return;

        // Create host element
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'metheus-popup-host';

        // Fail-safe theme sync:
        // The dictionary UI lives in a ShadowRoot and uses Tailwind `dark:` variants.
        // Those variants only activate if the `dark` class exists in the same DOM tree.
        // We therefore keep the theme state directly on the host element, sourced from
        // the same SettingsProvider instance used by the rest of the extension.
        const applyThemeFromSettings = async () => {
            try {
                const { themeType } = await this.settingsProvider.get(['themeType']);
                const isDark = themeType === 'dark';
                this.hostElement?.classList.toggle('dark', isDark);
                // Helps native form controls/scrollbars follow the expected mode.
                // @ts-ignore
                this.hostElement && ((this.hostElement.style as any).colorScheme = isDark ? 'dark' : 'light');
            } catch {
                // ignore
            }
        };

        // Initial apply (async)
        void applyThemeFromSettings();

        // Update on settings changes (support both message shapes)
        const runtimeListener = (request: any) => {
            const command = request?.message?.command ?? request?.command;
            if (command === 'settings-updated') {
                void applyThemeFromSettings();
            }
        };
        browser.runtime.onMessage.addListener(runtimeListener);

        this.hostElement.style.position = 'absolute';
        this.hostElement.style.top = '0';
        this.hostElement.style.left = '0';
        this.hostElement.style.width = '0';
        this.hostElement.style.height = '0';
        this.hostElement.style.zIndex = '2147483647';
        // Ensure host never captures clicks (popup content will override this)
        this.hostElement.style.pointerEvents = 'none';

        document.body.appendChild(this.hostElement);

        // Attach Shadow DOM
        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

        // Inject Styles
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        this.shadowRoot.appendChild(styleEl);

        // Create Container
        const container = document.createElement('div');
        container.id = 'ln-popup-root';
        this.shadowRoot.appendChild(container);
    }

    /**
     * Show the popup for a word
     */
    async show(word: string, sentence: string, position: PopupPosition, longestMatch?: string): Promise<void> {
        this._ensureInit();
        document.body.classList.add('asbplayer-popup-active');

        // Ensure popup is visible in fullscreen
        if (this.hostElement) {
            const fsElement = document.fullscreenElement;
            if (fsElement && this.hostElement.parentElement !== fsElement) {
                fsElement.appendChild(this.hostElement);
            } else if (!fsElement && this.hostElement.parentElement !== document.body) {
                document.body.appendChild(this.hostElement);
            }
        }

        const props = {
            word,
            sentence,
            longestMatch,
            subtitleLanguage: position.subtitleLanguage,
            position,
            isOpen: true,
            onClose: () => {
                this.close();
                this.options.onClose?.();
            },
            settingsProvider: this.settingsProvider,
        };
        this._lastProps = props;

        const container = this.shadowRoot?.getElementById('ln-popup-root');
        if (container) {
            mountDictionaryPopup(container, props);
        }
    }

    /**
     * Close the popup (Soft close - keep DOM alive)
     */
    close(): void {
        if (this.hostElement && this.shadowRoot && this._lastProps) {
            // Soft close: Trigger exit animation by setting isOpen = false.
            // Do NOT remove hostElement or unmount React root.
            const container = this.shadowRoot.getElementById('ln-popup-root');
            if (container) {
                mountDictionaryPopup(container, {
                    ...this._lastProps,
                    isOpen: false,
                });
            }

            document.body.classList.remove('asbplayer-popup-active');
        }
    }

    /**
     * Set callback for "Add Card" action
     */
    setOnAddCard(callback: (word: string, sentence: string, definition: DictionaryEntry | null) => void): void {
        this.options.onAddCard = callback;
    }

    /**
     * Set callback for "Know It" action
     */
    setOnKnowIt(callback: (word: string) => void): void {
        this.options.onMarkKnown = callback;
    }

    /**
     * Set callback for popup close
     */
    setOnClose(callback: () => void): void {
        this.options.onClose = callback;
    }

    /**
     * Hide the popup (alias for close)
     */
    hide(): void {
        this.close();
    }

    /**
     * Cleanup (Actually destroy)
     */
    destroy(): void {
        // Only called on extension disable/reload/page unload
        if (this.hostElement) {
            unmountDictionaryPopup();
            this.hostElement.remove();
            this.hostElement = null;
            this.shadowRoot = null;
            this.hostElement = null;
            this.shadowRoot = null;
            this._lastProps = null;
            document.body.classList.remove('asbplayer-popup-active');
        }
    }
}

// Singleton instance
let _instance: WordPopup | null = null;

export function getWordPopup(settingsProvider: SettingsProvider): WordPopup {
    if (!_instance) {
        _instance = new WordPopup(settingsProvider);
    }
    return _instance;
}
