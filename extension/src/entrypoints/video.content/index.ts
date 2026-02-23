import Binding from '@/services/binding';
import { PageDelegate, currentPageDelegate } from '@/services/pages';
import VideoSelectController from '@/controllers/video-select-controller';
import {
    CopyToClipboardMessage,
    CropAndResizeMessage,
    TabToExtensionCommand,
    ToggleSidePanelMessage,
} from '@metheus/common';
import { SettingsProvider } from '@metheus/common/settings';
import { FrameInfoBroadcaster, FrameInfoListener } from '@/services/frame-info';
import { cropAndResize } from '@metheus/common/src/image-transformer';
// import { TabAnkiUiController } from '@/controllers/tab-anki-ui-controller';
import { ExtensionSettingsStorage } from '@/services/extension-settings-storage';
import { DefaultKeyBinder } from '@metheus/common/key-binder';
import { incrementallyFindShadowRoots, shadowRootHosts } from '@/services/shadow-roots';
import { isFirefoxBuild } from '@/services/build-flags';
import { getWordPopup } from '@/services/word-popup';

import type { ContentScriptContext } from '#imports';
import './video.css';

const excludeGlobs = [
    '*://killergerbah.github.io/asbplayer*',
    '*://app.asbplayer.dev/*',
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
];

if (import.meta.env.DEV) {
    excludeGlobs.push('*://localhost:3000/*');
}

export default defineContentScript({
    // Set manifest options
    matches: ['<all_urls>'],
    excludeGlobs,
    allFrames: true,
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

        const extensionSettingsStorage = new ExtensionSettingsStorage();
        const settingsProvider = new SettingsProvider(extensionSettingsStorage);

        let unbindToggleSidePanel: (() => void) | undefined;

        const bindToggleSidePanel = () => {
            settingsProvider.getSingle('keyBindSet').then((keyBindSet) => {
                unbindToggleSidePanel?.();
                unbindToggleSidePanel = new DefaultKeyBinder(keyBindSet).bindToggleSidePanel(
                    (event) => {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        const command: TabToExtensionCommand<ToggleSidePanelMessage> = {
                            sender: 'asbplayer-video-tab',
                            message: {
                                command: 'toggle-side-panel',
                            },
                        };
                        browser.runtime.sendMessage(command);
                    },
                    () => false,
                    true
                );
            });
        };

        const hasValidVideoSource = (videoElement: HTMLVideoElement, page?: PageDelegate) => {
            if (page?.config?.allowVideoElementsWithBlankSrc) {
                return true;
            }

            if (videoElement.src) {
                return true;
            }

            for (let index = 0, length = videoElement.children.length; index < length; index++) {
                const elm = videoElement.children[index];

                if ('SOURCE' === elm.tagName && (elm as HTMLSourceElement).src) {
                    return true;
                }
            }

            return false;
        };

        const bind = async () => {
            const bindings: Binding[] = [];
            const page = await currentPageDelegate();
            let hasPageScript = page?.config.pageScript !== undefined;
            let frameInfoListener: FrameInfoListener | undefined;
            let frameInfoBroadcaster: FrameInfoBroadcaster | undefined;
            const isParentDocument = window.self === window.top;

            if (isParentDocument) {
                // Parent document, listen for child iframe info
                frameInfoListener = new FrameInfoListener();
                frameInfoListener.bind();
            } else {
                // Child iframe, broadcast frame info
                frameInfoBroadcaster = new FrameInfoBroadcaster();
            }

            const bindToVideoElements = () => {
                const videoElements = [...document.getElementsByTagName('video')];

                for (const shadowRootHost of shadowRootHosts) {
                    if (!shadowRootHost.shadowRoot) {
                        continue;
                    }

                    for (const video of shadowRootHost.shadowRoot.querySelectorAll('video')) {
                        videoElements.push(video);
                    }
                }

                for (let i = 0; i < videoElements.length; ++i) {
                    const videoElement = videoElements[i];
                    const bindingExists = bindings.filter((b) => b.video.isSameNode(videoElement)).length > 0;

                    // Check if Metheus extension is explicitly disabled via URL param OR Route Blacklist
                    // The user requested to disable the extension on /learn/ and /browser
                    const isMetheusDisabled =
                        new URLSearchParams(window.location.search).has('ln_no_ext') ||
                        window.location.pathname.includes('/learn/') ||
                        window.location.pathname.includes('/browser');

                    if (
                        !bindingExists &&
                        hasValidVideoSource(videoElement, page) &&
                        !page?.shouldIgnore(videoElement) &&
                        !isMetheusDisabled
                    ) {
                        const b = new Binding(
                            videoElement,
                            hasPageScript,
                            settingsProvider,
                            frameInfoBroadcaster?.frameId
                        );
                        b.bind();
                        bindings.push(b);
                    }
                }

                for (let i = bindings.length - 1; i >= 0; --i) {
                    const b = bindings[i];

                    let videoElementExists = false;

                    for (let j = 0; j < videoElements.length; ++j) {
                        const videoElement = videoElements[j];

                        if (videoElement.isSameNode(b.video) && hasValidVideoSource(videoElement, page)) {
                            videoElementExists = true;
                            break;
                        }
                    }

                    if (!videoElementExists) {
                        bindings.splice(i, 1);
                        b.unbind();
                    }
                }

                if (bindings.length === 0) {
                    frameInfoBroadcaster?.unbind();
                } else {
                    frameInfoBroadcaster?.bind();
                }
            };

            bindToVideoElements();
            const videoInterval = setInterval(bindToVideoElements, 1000);
            const shadowRootInterval = page?.config.searchShadowRootsForVideoElements
                ? setInterval(incrementallyFindShadowRoots, 100)
                : undefined;

            const videoSelectController = new VideoSelectController(bindings);
            videoSelectController.bind();

            // const ankiUiController = new TabAnkiUiController(settingsProvider);

            if (isParentDocument) {
                bindToggleSidePanel();
            }

            const messageListener = (
                request: any,
                sender: Browser.runtime.MessageSender,
                sendResponse: (response?: any) => void
            ) => {
                if (!isParentDocument) {
                    // Inside iframe - only root window is allowed to handle messages here
                    return;
                }

                if (request.sender !== 'asbplayer-extension-to-video') {
                    return;
                }

                switch (request.message.command) {
                    case 'metheus-toggle-popup': {
                        // "Global" popup: try to use current text selection as (word, sentence)
                        // and position the popup near the selection.
                        const selection = window.getSelection?.();
                        const selectedText = (selection?.toString?.() ?? '').trim();

                        // Best-effort: a single word token.
                        const word = selectedText.split(/\s+/)[0] ?? '';
                        const sentence = selectedText;

                        // Anchor position near the selection range.
                        let x = Math.floor(window.innerWidth * 0.5);
                        let y = Math.floor(window.innerHeight * 0.25);
                        let anchorRect: any | undefined;

                        try {
                            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
                            const rect = range ? range.getBoundingClientRect() : undefined;
                            if (rect && rect.width + rect.height > 0) {
                                x = rect.left + rect.width / 2;
                                y = rect.bottom;
                                anchorRect = {
                                    top: rect.top,
                                    bottom: rect.bottom,
                                    left: rect.left,
                                    right: rect.right,
                                    width: rect.width,
                                    height: rect.height,
                                };
                            }
                        } catch {
                            // Ignore and fallback to center.
                        }

                        const popup = getWordPopup(settingsProvider);
                        void popup.show(word, sentence, { x, y, anchorRect } as any);
                        break;
                    }
                    case 'metheus-show-popup': {
                        console.log('[Metheus][VideoTab] received show-popup', request.message);
                        // Side Panel initiated popup: open on the PAGE and anchor it just to the LEFT
                        // of the browser side panel boundary.
                        //
                        // Key goal: do NOT cover the clicked text. Since we only have a Y from the side panel,
                        // we anchor to the side-panel boundary and make the anchorRect very thin.
                        const { word, sentence, position, subtitleLanguage } = request.message as any;

                        const outerW = window.outerWidth || window.innerWidth;
                        const viewportW = window.innerWidth;
                        const viewportH = window.innerHeight;
                        const inferredSidePanelW = Math.max(0, outerW - viewportW);

                        const marginFromPanel = 12;
                        const effectivePanelW = inferredSidePanelW > 0 ? inferredSidePanelW : 360;

                        // Boundary X where the page ends and the side panel begins.
                        const boundaryX = viewportW - marginFromPanel;

                        // Anchor X: position at the boundary so popup appears to the left
                        const x = boundaryX;

                        // Clamp Y to viewport.
                        const yRaw = position?.y ?? Math.floor(viewportH * 0.5);
                        const y = Math.max(24, Math.min(viewportH - 24, yRaw));

                        // Create a TALL anchor rect at the boundary that spans most of the viewport height.
                        // This forces the DictionaryPopup positioning logic to use the "left of anchor" strategy,
                        // making the popup appear consistently adjacent to the side panel.
                        const anchorRect = {
                            top: Math.max(0, y - viewportH * 0.3),
                            bottom: Math.min(viewportH, y + viewportH * 0.3),
                            left: boundaryX - 2,
                            right: boundaryX + 2,
                            width: 4,
                            height: viewportH * 0.6,
                        };

                        console.log('[Metheus][VideoTab] Popup positioning', {
                            boundaryX,
                            x,
                            y,
                            viewportW,
                            inferredSidePanelW,
                        });

                        const popup = getWordPopup(settingsProvider);
                        void popup.show(word, sentence, { x, y, anchorRect, subtitleLanguage } as any);
                        break;
                    }
                    case 'copy-to-clipboard':
                        const copyToClipboardMessage = request.message as CopyToClipboardMessage;
                        fetch(copyToClipboardMessage.dataUrl)
                            .then((response) => response.blob())
                            .then((blob) => {
                                if (isFirefoxBuild) {
                                    if (blob.type.startsWith('text/plain')) {
                                        blob.text()
                                            .then((text) => navigator.clipboard.writeText(text))
                                            .catch(console.info);
                                    } else {
                                        console.error(`Cannot write blob type ${blob.type} to clipboard on Firefox`);
                                    }
                                } else {
                                    navigator.clipboard
                                        .write([new ClipboardItem({ [blob.type]: blob })])
                                        .catch(console.error);
                                }
                            });
                        break;
                    case 'crop-and-resize':
                        const cropAndResizeMessage = request.message as CropAndResizeMessage;
                        let rect = cropAndResizeMessage.rect;

                        if (cropAndResizeMessage.frameId !== undefined) {
                            const iframe = frameInfoListener?.iframesById?.[cropAndResizeMessage.frameId];

                            if (iframe !== undefined) {
                                const iframeRect = iframe.getBoundingClientRect();
                                rect = {
                                    left: rect.left + iframeRect.left,
                                    top: rect.top + iframeRect.top,
                                    width: rect.width,
                                    height: rect.height,
                                };
                            }
                        }

                        cropAndResize(
                            cropAndResizeMessage.maxWidth,
                            cropAndResizeMessage.maxHeight,
                            rect,
                            cropAndResizeMessage.dataUrl
                        ).then((dataUrl) => sendResponse({ dataUrl }));
                        return true;
                    case 'show-anki-ui':
                        /*
                        if (request.src === undefined) {
                            // Message intended for the tab, and not a specific video binding
                            ankiUiController.show(request.message);
                        }
                        */
                        break;
                    case 'settings-updated':
                        bindToggleSidePanel();
                        // ankiUiController.updateSettings();
                        break;
                    default:
                    // ignore
                }
            };

            browser.runtime.onMessage.addListener(messageListener);

            window.addEventListener('beforeunload', (event) => {
                for (let b of bindings) {
                    b.unbind();
                }

                bindings.length = 0;

                clearInterval(videoInterval);

                if (shadowRootInterval !== undefined) {
                    clearInterval(shadowRootInterval);
                }

                videoSelectController.unbind();
                frameInfoListener?.unbind();
                frameInfoBroadcaster?.unbind();
                unbindToggleSidePanel?.();
                browser.runtime.onMessage.removeListener(messageListener);
            });
        };

        // E-M5 FIX: Guard against readystatechange calling bind() multiple times
        let hasBound = false;

        if (document.readyState === 'complete') {
            bind().catch(console.error);
            hasBound = true;
        } else {
            document.addEventListener('readystatechange', (event) => {
                if (document.readyState === 'complete' && !hasBound) {
                    hasBound = true;
                    bind().catch(console.error);
                }
            });
        }
    },
});
