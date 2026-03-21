import { SettingsProvider } from '@metheus/common/settings';
import { mountHoverDefinitionStack, unmountHoverDefinitionStack } from '../ui/HoverDefinitionStackWrapper';
// @ts-ignore
import styles from '../ui/styles.css?inline';

export interface HoverStackPayload {
    anchorRect: DOMRect;
    bestTranslation: string;
    alternatives: string[];
    isLoading?: boolean;
}

export class WordHoverStack {
    private hostElement: HTMLElement | null = null;
    private shadowRoot: ShadowRoot | null = null;

    constructor(private readonly settingsProvider: SettingsProvider) {}

    private ensureInit() {
        if (this.hostElement) {
            return;
        }

        this.hostElement = document.createElement('div');
        this.hostElement.id = 'metheus-hover-stack-host';
        this.hostElement.style.position = 'absolute';
        this.hostElement.style.top = '0';
        this.hostElement.style.left = '0';
        this.hostElement.style.width = '0';
        this.hostElement.style.height = '0';
        this.hostElement.style.zIndex = '2147483646';
        this.hostElement.style.pointerEvents = 'none';
        document.body.appendChild(this.hostElement);

        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        this.shadowRoot.appendChild(styleEl);

        const container = document.createElement('div');
        container.id = 'metheus-hover-stack-root';
        this.shadowRoot.appendChild(container);
    }

    show(payload: HoverStackPayload) {
        this.ensureInit();
        const container = this.shadowRoot?.getElementById('metheus-hover-stack-root');
        if (!container) {
            return;
        }

        mountHoverDefinitionStack(container, {
            isOpen: true,
            anchorRect: payload.anchorRect,
            bestTranslation: payload.bestTranslation,
            alternatives: payload.alternatives,
            isLoading: payload.isLoading ?? false,
        });
    }

    hide() {
        const container = this.shadowRoot?.getElementById('metheus-hover-stack-root');
        if (!container) {
            return;
        }

        mountHoverDefinitionStack(container, {
            isOpen: false,
            anchorRect: new DOMRect(0, 0, 0, 0),
            bestTranslation: '',
            alternatives: [],
            isLoading: false,
        });
    }

    destroy() {
        unmountHoverDefinitionStack();
        if (this.hostElement) {
            this.hostElement.remove();
            this.hostElement = null;
            this.shadowRoot = null;
        }
    }
}

let hoverInstance: WordHoverStack | null = null;

export function getWordHoverStack(settingsProvider: SettingsProvider): WordHoverStack {
    if (!hoverInstance) {
        hoverInstance = new WordHoverStack(settingsProvider);
    }

    return hoverInstance;
}
