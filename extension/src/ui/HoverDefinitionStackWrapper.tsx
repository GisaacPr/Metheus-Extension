import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { HoverDefinitionStack } from './components/HoverDefinitionStack';

export interface HoverDefinitionStackViewProps {
    isOpen: boolean;
    anchorRect: DOMRect;
    bestTranslation: string;
    alternatives: string[];
    isLoading: boolean;
}

let hoverRoot: Root | null = null;

export function mountHoverDefinitionStack(container: HTMLElement, props: HoverDefinitionStackViewProps) {
    if (!hoverRoot) {
        hoverRoot = createRoot(container);
    }

    hoverRoot.render(<HoverDefinitionStack {...props} />);
}

export function unmountHoverDefinitionStack() {
    if (hoverRoot) {
        hoverRoot.unmount();
        hoverRoot = null;
    }
}
