/**
 * METHEUS DICTIONARY HOVER - Global Website Support
 *
 * Shows dictionary popup when user presses the configured keyboard shortcut on any webpage.
 */

import type { ContentScriptContext } from '#imports';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../services/extension-settings-storage';
import { getWordPopup, WordPopup } from '../services/word-popup';

const extensionDisabledOnMetheusContexts = () => {
    const host = window.location.hostname.toLowerCase();
    const referrer = document.referrer.toLowerCase();

    const hostBlocked =
        host === 'metheus.app' || host === 'www.metheus.app' || host === 'localhost' || host === '127.0.0.1';

    const referrerBlocked =
        referrer.includes('metheus.app') || referrer.includes('localhost') || referrer.includes('127.0.0.1');

    return hostBlocked || referrerBlocked;
};

const normalizeSentence = (text: string): string => {
    return text
        .replace(/\u200B/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s*-\s*/g, '-')
        .trim();
};

const resolveSentenceForLnWord = (wordEl: HTMLElement): string => {
    const candidateContainers = [
        wordEl.closest('[data-ln-subtitle-fallback="true"]'),
        wordEl.closest('.subtitle-text'),
        wordEl.closest('.subtitle-container'),
        wordEl.closest('[data-track]'),
        wordEl.closest('.asbplayer-subtitles'),
        wordEl.parentElement,
    ].filter(Boolean) as HTMLElement[];

    for (const container of candidateContainers) {
        const normalized = normalizeSentence(container.textContent || '');
        if (normalized.length >= 8 && normalized.split(' ').length >= 2) {
            return normalized;
        }
    }

    const dataSentence = normalizeSentence(wordEl.dataset.sentence || '');
    if (dataSentence.length > 0) {
        return dataSentence;
    }

    return normalizeSentence(wordEl.textContent || '');
};

// Get the word at the mouse position within a text node
function getWordAtPosition(
    element: HTMLElement,
    clientX: number,
    clientY: number
): { word: string; context: string } | null {
    const range =
        document.caretRangeFromPoint?.(clientX, clientY) ||
        (() => {
            const pos = (document as any).caretPositionFromPoint?.(clientX, clientY);
            if (!pos?.offsetNode) {
                return null;
            }
            const fallbackRange = document.createRange();
            fallbackRange.setStart(pos.offsetNode, Math.max(0, pos.offset || 0));
            fallbackRange.collapse(true);
            return fallbackRange;
        })();
    if (!range) return null;

    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return null;

    const text = textNode.textContent || '';
    const offset = range.startOffset;

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /[\w']/.test(text[start - 1])) {
        start--;
    }

    while (end < text.length && /[\w']/.test(text[end])) {
        end++;
    }

    const word = text.substring(start, end).trim();
    if (!word || word.length < 2) return null;

    const sentenceStart = Math.max(0, start - 50);
    const sentenceEnd = Math.min(text.length, end + 50);
    let context = text.substring(sentenceStart, sentenceEnd).trim();
    context = context.replace(/\s+/g, ' ');

    return { word, context };
}

function getWordFromSelection(): { word: string; context: string } | null {
    const selection = window.getSelection();
    const text = (selection?.toString() || '').trim();
    if (text.length >= 2 && text.length <= 48) {
        return { word: text, context: text };
    }

    const node = selection?.focusNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    const content = node.textContent || '';
    const offset = selection?.focusOffset || 0;
    let start = offset;
    let end = offset;

    while (start > 0 && /[\w'’-]/.test(content[start - 1])) {
        start--;
    }
    while (end < content.length && /[\w'’-]/.test(content[end])) {
        end++;
    }

    const word = content.substring(start, end).trim();
    if (!word || word.length < 2) {
        return null;
    }

    const sentenceStart = Math.max(0, start - 60);
    const sentenceEnd = Math.min(content.length, end + 60);
    const context = content.substring(sentenceStart, sentenceEnd).replace(/\s+/g, ' ').trim();
    return { word, context };
}

function findLnWordElement(target: HTMLElement | null, x: number, y: number): HTMLElement | null {
    const fromTarget = target?.closest('.ln-word') as HTMLElement | null;
    if (fromTarget) {
        return fromTarget;
    }

    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
        const lnWord = (el as HTMLElement).closest?.('.ln-word') as HTMLElement | null;
        if (lnWord) {
            return lnWord;
        }
    }

    return null;
}

function resolveTargetAtPoint(lastTarget: HTMLElement | null, x: number, y: number): HTMLElement | null {
    if (lastTarget) {
        return lastTarget;
    }

    const fromPoint = document.elementFromPoint(x, y) as HTMLElement | null;
    if (fromPoint) {
        return fromPoint;
    }

    return document.body;
}

// Check if element is editable
function isEditableElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') return true;
    if (element.isContentEditable) return true;
    return false;
}

// Check if element is inside the dictionary popup
function isInsideDictionaryPopup(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        if (current.id === 'metheus-popup-host' || current.id === 'ln-popup-root') {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

// Parse shortcut string (e.g., "ctrl+d", "alt+s")
function parseShortcut(shortcut: string): { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; key: string } {
    const parts = shortcut.toLowerCase().split('+');
    return {
        ctrl: parts.includes('ctrl'),
        alt: parts.includes('alt'),
        shift: parts.includes('shift'),
        meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
        key: parts[parts.length - 1] || '',
    };
}

class GlobalDictionaryHover {
    private settingsProvider: SettingsProvider;
    private popup: WordPopup;
    private shortcut: string = 'ctrl+d';
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;
    private lastTarget: HTMLElement | null = null;

    constructor() {
        const storage = new ExtensionSettingsStorage();
        this.settingsProvider = new SettingsProvider(storage);
        this.popup = getWordPopup(this.settingsProvider);
    }

    async initialize(): Promise<void> {
        const s = await this.settingsProvider.get([
            'metheusGlobalHoverShortcut',
            'metheusTargetLanguage',
            'metheusEnabled',
        ]);

        if (!s.metheusEnabled) {
            console.log('[LN Global Hover] Metheus disabled');
            return;
        }

        this.shortcut = (s.metheusGlobalHoverShortcut || 'ctrl+D').toLowerCase();
        console.log('[LN Global Hover] Shortcut:', this.shortcut);

        this.setupEventListeners();
        this.popup.preload();
    }

    private setupEventListeners(): void {
        // Track mouse position
        document.addEventListener('mousemove', this.handleMouseMove, true);
        // Listen for keyboard shortcut
        document.addEventListener('keydown', this.handleKeyDown, true);
    }

    private handleMouseMove = (e: MouseEvent): void => {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.lastTarget = e.target as HTMLElement;
    };

    private handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
        const parsed = parseShortcut(this.shortcut);

        // Check if the pressed key matches
        if (e.key.toLowerCase() !== parsed.key) return;

        // Check if modifier keys match
        if (parsed.ctrl !== e.ctrlKey) return;
        if (parsed.alt !== e.altKey) return;
        if (parsed.shift !== e.shiftKey) return;
        if (parsed.meta !== e.metaKey) return;

        const target = resolveTargetAtPoint(this.lastTarget, this.lastMouseX, this.lastMouseY);
        if (!target) return;

        // Skip if inside popup or editable
        if (isInsideDictionaryPopup(target)) return;
        if (isEditableElement(target)) return;

        const lnWord = findLnWordElement(target, this.lastMouseX, this.lastMouseY);
        if (lnWord) {
            const word = (lnWord.dataset.word || lnWord.textContent || '').trim();
            if (!word) {
                return;
            }

            const sentence = resolveSentenceForLnWord(lnWord);
            const rect = lnWord.getBoundingClientRect();

            e.preventDefault();
            e.stopPropagation();

            await this.showPopup(word, sentence, rect.left + rect.width / 2, rect.bottom + 8, lnWord);
            return;
        }

        const fromSelection = getWordFromSelection();
        if (fromSelection) {
            e.preventDefault();
            e.stopPropagation();

            await this.showPopup(fromSelection.word, fromSelection.context, this.lastMouseX, this.lastMouseY, target);
            return;
        }

        // Get word at last mouse position
        const result = getWordAtPosition(target, this.lastMouseX, this.lastMouseY);
        if (!result) return;

        e.preventDefault();
        e.stopPropagation();

        await this.showPopup(result.word, result.context, this.lastMouseX, this.lastMouseY, target);
    };

    private async showPopup(word: string, context: string, x: number, y: number, target: HTMLElement): Promise<void> {
        const rect = target.getBoundingClientRect();

        const position = {
            x,
            y: y + 20,
            anchorRect: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
            },
        };

        // Detect language from context
        const detectLangFromText = (t: string): string | undefined => {
            if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';
            if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
            if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
            return undefined;
        };

        const detectedLang = detectLangFromText(context) || 'en';

        await this.popup.show(word, context, { ...position, subtitleLanguage: detectedLang });
    }
}

export default defineContentScript({
    matches: ['<all_urls>'],
    excludeGlobs: [
        '*://metheus.app/*',
        '*://www.metheus.app/*',
        'http://localhost/*',
        'https://localhost/*',
        'http://localhost:*/*',
        'https://localhost:*/*',
        'http://127.0.0.1/*',
        'https://127.0.0.1/*',
        'http://127.0.0.1:*/*',
        'https://127.0.0.1:*/*',
    ],
    allFrames: false,
    runAt: 'document_idle',

    main(ctx: ContentScriptContext) {
        if (extensionDisabledOnMetheusContexts()) {
            return;
        }

        console.log('[LN Global Hover] Content script loaded');

        const hover = new GlobalDictionaryHover();
        void hover.initialize();
    },
});
