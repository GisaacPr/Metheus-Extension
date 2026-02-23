/**
 * METHEUS INTEGRATION
 *
 * Entry point for integrating Metheus features with the extension.
 * This module initializes and coordinates all Metheus services.
 */

import { SettingsProvider } from '@metheus/common/settings';
import { PostMineAction } from '@metheus/common';
import { ExtensionSettingsStorage } from '../services/extension-settings-storage';
import { getMetheusController, MetheusController, resetMetheusController } from '../controllers/metheus-controller';
import SubtitleController from '../controllers/subtitle-controller';
import type { WordStatus } from './metheus-sync';
import { getSubtitleColorizer } from './subtitle-colorizer';
import { normalizeLangCode } from './language-utils';

let _controller: MetheusController | null = null;
let _initialized = false;

/**
 * Initialize Metheus integration
 */
export async function initializeMetheus(
    settingsProvider: SettingsProvider,
    subtitleController?: SubtitleController
): Promise<MetheusController | null> {
    if (_initialized && _controller) {
        return _controller;
    }

    try {
        // Check if Metheus is enabled
        const settings = await settingsProvider.get(['metheusEnabled']);

        console.log('[LN Debug] Initialization settings:', {
            enabled: settings.metheusEnabled,
        });

        // Listen for settings changes to enable/disable dynamically
        // utilizing the unified message bus or storage listener if available
        // For now, we poll or listen to the extension message 'settings-updated'
        if (!_initialized) {
            browser.runtime.onMessage.addListener((payload: any) => {
                const command = payload.command || payload.message?.command;

                if (command === 'settings-updated') {
                    console.log('[LN Debug] Settings updated signal received inside integration. Re-evaluating...');

                    // Re-fetch settings and re-evaluate
                    settingsProvider.get(['metheusEnabled']).then((newSettings) => {
                        if (newSettings.metheusEnabled) {
                            if (!_controller) {
                                console.log('[LN Debug] Enabling Metheus after settings update');
                                getMetheusController(settingsProvider)
                                    .initialize(subtitleController)
                                    .then(() => {
                                        _controller = getMetheusController(settingsProvider);
                                        _initialized = true;
                                        document.addEventListener('metheus-create-card', handleCreateCard);
                                        console.log('[LN Debug] Metheus Enabled & Initialized Live');
                                    });
                            }
                        } else if (_controller) {
                            console.log('[LN Debug] Disabling Metheus after settings update');
                            cleanupMetheus();
                        }
                    });
                } else if (command === 'metheus-force-sync') {
                    console.log('[LN Debug] Force sync signal received');
                    if (_controller) {
                        _controller.forceSync().then(() => console.log('[LN Debug] Force sync complete'));
                    } else {
                        console.warn('[LN Debug] Cannot sync: Controller not initialized');
                    }
                } else if (command === 'metheus-word-status-updated') {
                    const updateWord = payload?.message?.word;
                    const updateStatus = payload?.message?.status;
                    const updateLanguage = payload?.message?.language;

                    if (!updateWord || typeof updateStatus !== 'number') {
                        return;
                    }

                    const colorizer = getSubtitleColorizer(settingsProvider);
                    colorizer.applyWordStatusLocally(updateWord, updateStatus as WordStatus);

                    document.dispatchEvent(
                        new CustomEvent('metheus-word-status-updated', {
                            detail: {
                                word: updateWord,
                                status: updateStatus,
                                language: updateLanguage,
                                source: 'background',
                            },
                        })
                    );

                    if (subtitleController) {
                        void subtitleController.cacheHtml().then(() => {
                            subtitleController.refreshCurrentSubtitle = true;
                        });
                    }
                }
            });
        }

        console.log('[LN Integration] Initializing...');

        _controller = getMetheusController(settingsProvider);
        await _controller.initialize(subtitleController);

        // Hook into SubtitleController for native rendering
        if (subtitleController) {
            const colorizer = getSubtitleColorizer(settingsProvider);

            // -------- Language detection helpers (track label/name + attributes + script fallback) --------

            // Imported from language-utils

            const detectLangFromText = (t: string): string | undefined => {
                // Japanese: Hiragana/Katakana
                if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';
                // Korean: Hangul
                if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
                // Chinese (Han): CJK ideographs (rough)
                if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
                return undefined;
            };

            const detectLangFromTrackElement = (el: HTMLElement | null): string | undefined => {
                if (!el) return undefined;

                // Try attributes commonly used by different players
                const attrCandidates = [
                    el.getAttribute('data-track-language'),
                    el.getAttribute('data-language'),
                    el.getAttribute('data-lang'),
                    el.getAttribute('lang'),
                    el.getAttribute('hreflang'),
                    el.getAttribute('title'),
                    el.getAttribute('aria-label'),
                    el.getAttribute('label'),
                ];

                for (const c of attrCandidates) {
                    const code = normalizeLangCode(c);
                    if (code) return code;
                }

                // Look at nearby text too (labels often live on parent)
                const parent = el.parentElement;
                if (parent) {
                    const parentText = (
                        parent.getAttribute('aria-label') ||
                        parent.getAttribute('title') ||
                        parent.textContent ||
                        ''
                    ).trim();
                    const code = normalizeLangCode(parentText);
                    if (code) return code;
                }

                return undefined;
            };

            subtitleController.htmlProcessor = async (text, track) => {
                let trackLang: string | undefined;
                if (track !== undefined) {
                    const el = document.querySelector(`[data-track="${track}"]`) as HTMLElement | null;
                    trackLang = detectLangFromTrackElement(el);
                }

                const langOverride = trackLang || detectLangFromText(text);
                return colorizer.getHtmlForSubtitles(text, langOverride);
            };

            // Fix for race condition: Subtitles might have already rendered as plain text
            // before this async initialization completed. Force a re-render now that
            // the processor is attached.
            void subtitleController.cacheHtml().then(() => {
                subtitleController.refreshCurrentSubtitle = true;
                console.log('[LN Integration] Forced subtitle re-render after initialization');
            });
        }

        // Set up event listener for card creation from popup
        document.addEventListener('metheus-create-card', handleCreateCard);

        // Apply immediate color updates when the popup changes a word status
        // (so the underline changes instantly without waiting for a full refresh/sync)
        document.addEventListener('metheus-word-status-updated', (event: Event) => {
            try {
                const customEvent = event as CustomEvent;
                const { word, status, source } = customEvent.detail ?? {};
                if (!word || typeof status !== 'number') {
                    return;
                }

                const colorizer = getSubtitleColorizer(settingsProvider);
                if (source === 'background') {
                    colorizer.applyWordStatusLocally(word, status as WordStatus);
                    return;
                }

                void colorizer.updateWordStatus(word, status as WordStatus);
            } catch (e) {
                console.error('[LN Integration] Failed to apply immediate word status update', e);
            }
        });

        // Word clicks
        const handleLnWordPointerDownCapture = (event: PointerEvent) => {
            if (!_controller) {
                return;
            }

            if (event.defaultPrevented) {
                return;
            }

            // In Shadow DOM, event.target is retargeted to the host.
            // Use composedPath() to reliably detect clicks inside the popup.
            const path = event.composedPath?.() ?? [];
            const clickedInsidePopup = path.some((node) => {
                if (node instanceof HTMLElement) {
                    return node.id === 'metheus-popup-host' || node.id === 'ln-popup-root';
                }
                return false;
            });
            if (clickedInsidePopup) {
                return;
            }

            const target = event.target as HTMLElement | null;
            if (!target) {
                return;
            }

            const wordEl = target.closest('.ln-word') as HTMLElement | null;
            if (!wordEl) {
                return;
            }

            const word = wordEl.dataset.word;
            const sentence = wordEl.dataset.sentence;
            if (!word || !sentence) {
                return;
            }

            // Ensure a clear visual indicator of the clicked token.
            document.querySelectorAll('.ln-word-active').forEach((el) => {
                el.classList.remove('ln-word-active');
            });
            wordEl.classList.add('ln-word-active');

            event.preventDefault();
            event.stopPropagation();

            void _controller.handleWordClick(word, sentence, wordEl);
        };

        document.addEventListener('pointerdown', handleLnWordPointerDownCapture, true);

        _initialized = true;
        console.log('[LN Integration] Initialized successfully');

        return _controller;
    } catch (error) {
        console.error('[LN Integration] Failed to initialize:', error);
        return null;
    }
}

/**
 * Cleanup Metheus integration
 */
export function cleanupMetheus(): void {
    if (_controller) {
        _controller.unbind();
        resetMetheusController();
        _controller = null;
    }

    document.removeEventListener('metheus-create-card', handleCreateCard);
    _initialized = false;

    console.log('[LN Integration] Cleaned up');
}

/**
 * Handle card creation event from popup — uses MOCHILA pattern.
 * Instead of calling an API (which doesn't exist), we buffer the card
 * locally and broadcast to the Web App to absorb it.
 */
async function handleCreateCard(event: Event): Promise<void> {
    const customEvent = event as CustomEvent;
    const {
        word,
        sentence,
        definition,
        language,
        deckId,
        noteTypeId,
        translations,
        audio,
        cefr,
        frequency,
        requestId,
        phonetic,
        phoneticLabel,
        details,
        wordTranslation,
        definitionTranslation,
        contextTranslation,
        mediaStartMs,
        mediaEndMs,
        mediaTimestampMs,
        subtitleStartMs,
        subtitleEndMs,
        startMs: explicitStartMs,
        endMs: explicitEndMs,
    } = customEvent.detail;

    console.log('[LN Integration] Creating card via Mochila:', { word, language, deckId, hasDefinition: !!definition });

    try {
        const extractTranslation = (value: any): string => {
            if (typeof value === 'string') {
                return value;
            }

            if (Array.isArray(value) && value.length > 0) {
                const first = value[0];
                if (typeof first === 'string') {
                    return first;
                }
                if (typeof first?.translation === 'string') {
                    return first.translation;
                }
                if (typeof first?.text === 'string') {
                    return first.text;
                }
            }

            return '';
        };

        const normalizeAudioUrl = (value: any): string => {
            if (!value) {
                return '';
            }

            if (typeof value === 'string') {
                return value;
            }

            if (typeof value?.url === 'string') {
                return value.url;
            }

            if (Array.isArray(value) && typeof value[0]?.url === 'string') {
                return value[0].url;
            }

            return '';
        };

        const sourceUrl = window.location.href;
        const resolvedWordTranslation = extractTranslation(wordTranslation) || extractTranslation(translations);
        const resolvedDefinitionTranslation = extractTranslation(definitionTranslation);
        const resolvedContextTranslation = extractTranslation(contextTranslation);

        const isYoutubeSource = /(?:youtube\.com|youtu\.be)/i.test(sourceUrl);
        const currentVideoTime = (() => {
            const activeVideo = document.querySelector('video') as HTMLVideoElement | null;
            if (!activeVideo || Number.isNaN(activeVideo.currentTime)) {
                return undefined;
            }

            return Math.max(0, Math.floor(activeVideo.currentTime));
        })();
        const inferredClipEnd = currentVideoTime !== undefined ? currentVideoTime + 6 : undefined;

        let sourceUrlWithTime = sourceUrl;
        if (isYoutubeSource && currentVideoTime !== undefined) {
            try {
                const parsed = new URL(sourceUrlWithTime);
                parsed.searchParams.set('t', `${currentVideoTime}s`);
                if (inferredClipEnd !== undefined) {
                    parsed.searchParams.set('end', `${inferredClipEnd}`);
                }
                sourceUrlWithTime = parsed.toString();
            } catch {
                // Keep original URL if parsing fails
            }
        }

        if (!isYoutubeSource) {
            const activeVideo = document.querySelector('video') as HTMLVideoElement | null;
            if (activeVideo) {
                const miningSrc = activeVideo.currentSrc || activeVideo.src || sourceUrl;
                const miningSentence = sentence || word;
                const tokenCount = miningSentence
                    .split(/\s+/)
                    .map((value: string) => value.trim())
                    .filter((value: string) => value.length > 0).length;
                const dynamicCaptureMs = Math.min(10000, Math.max(5000, tokenCount * 520 + 1800));
                const currentMs = Number.isFinite(activeVideo.currentTime)
                    ? Math.max(0, Math.floor(activeVideo.currentTime * 1000))
                    : Date.now();

                const pickFinite = (...values: any[]): number | undefined => {
                    for (const value of values) {
                        const numeric = Number(value);
                        if (Number.isFinite(numeric)) {
                            return numeric;
                        }
                    }

                    return undefined;
                };

                const explicitStart = pickFinite(
                    mediaStartMs,
                    subtitleStartMs,
                    explicitStartMs,
                    customEvent.detail?.start,
                    customEvent.detail?.originalStart
                );
                const explicitEnd = pickFinite(
                    mediaEndMs,
                    subtitleEndMs,
                    explicitEndMs,
                    customEvent.detail?.end,
                    customEvent.detail?.originalEnd
                );
                const explicitTiming =
                    explicitStart !== undefined && explicitEnd !== undefined && explicitEnd > explicitStart + 120;

                const inferredTimestamp =
                    pickFinite(
                        mediaTimestampMs,
                        customEvent.detail?.mediaTimestamp,
                        customEvent.detail?.timestamp,
                        currentMs
                    ) || currentMs;

                const startMs = explicitTiming
                    ? Math.max(0, Math.floor(explicitStart!))
                    : Math.max(0, Math.floor(inferredTimestamp - 4000));

                const durationMs = Number.isFinite(activeVideo.duration)
                    ? Math.max(0, Math.floor(activeVideo.duration * 1000))
                    : undefined;

                const rawEndMs = explicitTiming
                    ? Math.floor(explicitEnd!)
                    : Math.max(Math.floor(inferredTimestamp + 2200), Math.floor(startMs + dynamicCaptureMs));
                const endMs = durationMs !== undefined ? Math.min(rawEndMs, durationMs) : rawEndMs;
                const isNetflixSource = /(?:^|\.)netflix\.com$/i.test(window.location.hostname);

                const dispatchNetflixPlayerEvent = (eventName: string, detail?: number) => {
                    const event =
                        detail === undefined ? new CustomEvent(eventName) : new CustomEvent(eventName, { detail });
                    document.dispatchEvent(event);
                };

                const seekVideoToMs = async (targetMs: number): Promise<void> => {
                    const boundedMs = durationMs !== undefined ? Math.min(targetMs, durationMs) : targetMs;
                    const boundedSeconds = Math.max(0, boundedMs / 1000);

                    if (isNetflixSource) {
                        dispatchNetflixPlayerEvent('asbplayer-netflix-seek', Math.floor(boundedSeconds * 1000));
                        await new Promise((resolve) => setTimeout(resolve, 140));
                        return;
                    }

                    if (!Number.isFinite(activeVideo.currentTime)) {
                        activeVideo.currentTime = boundedSeconds;
                        return;
                    }

                    if (Math.abs(activeVideo.currentTime - boundedSeconds) < 0.035) {
                        return;
                    }

                    await new Promise<void>((resolve) => {
                        let settled = false;
                        const done = () => {
                            if (settled) {
                                return;
                            }

                            settled = true;
                            activeVideo.removeEventListener('seeked', onSeeked);
                            clearTimeout(fallbackTimeout);
                            resolve();
                        };

                        const onSeeked = () => done();
                        const fallbackTimeout = window.setTimeout(done, 900);

                        activeVideo.addEventListener('seeked', onSeeked, { once: true });
                        try {
                            activeVideo.currentTime = boundedSeconds;
                        } catch {
                            done();
                        }
                    });
                };

                let clipUrl = sourceUrl;
                try {
                    const parsed = new URL(sourceUrl);
                    parsed.hash = `t=${Math.floor(startMs / 1000)},${Math.floor(endMs / 1000)}`;
                    clipUrl = parsed.toString();
                } catch {
                    // Keep original URL
                }

                const rect = activeVideo.getBoundingClientRect();
                const targetAspect = 16 / 9;
                let captureWidth = rect.width;
                let captureHeight = captureWidth / targetAspect;

                if (captureHeight > rect.height) {
                    captureHeight = rect.height;
                    captureWidth = captureHeight * targetAspect;
                }

                const captureRect = {
                    left: rect.left + (rect.width - captureWidth) / 2,
                    top: rect.top + (rect.height - captureHeight) / 2,
                    width: captureWidth,
                    height: captureHeight,
                };

                const extractFrameDataUrl = (): string | undefined => {
                    try {
                        const vw = activeVideo.videoWidth || 0;
                        const vh = activeVideo.videoHeight || 0;
                        if (vw <= 0 || vh <= 0) {
                            return undefined;
                        }

                        let sw = vw;
                        let sh = sw / targetAspect;
                        if (sh > vh) {
                            sh = vh;
                            sw = sh * targetAspect;
                        }
                        const sx = (vw - sw) / 2;
                        const sy = (vh - sh) / 2;

                        const canvas = document.createElement('canvas');
                        canvas.width = 1280;
                        canvas.height = 720;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            return undefined;
                        }

                        ctx.drawImage(activeVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

                        try {
                            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                            let maxChannel = 0;
                            for (let i = 0; i < imageData.length; i += 4000) {
                                const r = imageData[i];
                                const g = imageData[i + 1];
                                const b = imageData[i + 2];
                                maxChannel = Math.max(maxChannel, r, g, b);
                            }

                            if (maxChannel < 10) {
                                console.warn(
                                    '[LN Integration] Frame capture appears black; falling back to screenshot capture'
                                );
                                return undefined;
                            }
                        } catch {
                            // Ignore analysis errors and continue with data URL generation
                        }

                        return canvas.toDataURL('image/jpeg', 0.9);
                    } catch {
                        return undefined;
                    }
                };

                const directFrameDataUrl = extractFrameDataUrl();

                const popupHost = document.getElementById('metheus-popup-host') as HTMLElement | null;
                const popupPrevVisibility = popupHost?.style.visibility;
                const popupPrevPointerEvents = popupHost?.style.pointerEvents;
                const popupPrevDisplay = popupHost?.style.display;
                const hiddenElements = [
                    ...Array.from(document.querySelectorAll<HTMLElement>('#ln-smart-hub-pill-iframe')),
                    ...Array.from(
                        document.querySelectorAll<HTMLElement>('.asbplayer-mobile-video-overlay-container-top')
                    ),
                    ...Array.from(
                        document.querySelectorAll<HTMLElement>('.asbplayer-mobile-video-overlay-container-bottom')
                    ),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-mobile-video-overlay')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-subtitles-container-bottom')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-subtitles-container-top')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-bottom-subtitles')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-top-subtitles')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('.player-timedtext')),
                    ...Array.from(document.querySelectorAll<HTMLElement>('[data-uia="subtitle-text"]')),
                ];
                const elementStyles = hiddenElements.map((el) => ({
                    el,
                    visibility: el.style.visibility,
                    opacity: el.style.opacity,
                    pointerEvents: el.style.pointerEvents,
                }));

                const wasPaused = activeVideo.paused;
                if (popupHost) {
                    popupHost.style.visibility = 'hidden';
                    popupHost.style.pointerEvents = 'none';
                    popupHost.style.display = 'none';
                }
                for (const item of elementStyles) {
                    item.el.style.visibility = 'hidden';
                    item.el.style.opacity = '0';
                    item.el.style.pointerEvents = 'none';
                }

                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
                await new Promise((resolve) => setTimeout(resolve, 120));

                try {
                    await seekVideoToMs(startMs);

                    if (wasPaused) {
                        try {
                            if (isNetflixSource) {
                                dispatchNetflixPlayerEvent('asbplayer-netflix-play');
                            } else {
                                await activeVideo.play();
                            }
                        } catch {
                            // Keep going even if autoplay fails
                        }
                    }

                    await browser.runtime.sendMessage({
                        sender: 'asbplayer-video',
                        message: {
                            command: 'record-media-and-forward-subtitle',
                            subtitle: {
                                text: sentence || word,
                                start: startMs,
                                end: endMs,
                                originalStart: startMs,
                                originalEnd: endMs,
                                track: 0,
                            },
                            surroundingSubtitles: [
                                {
                                    text: miningSentence,
                                    start: startMs,
                                    end: endMs,
                                    originalStart: startMs,
                                    originalEnd: endMs,
                                    track: 0,
                                },
                            ],
                            record: true,
                            screenshot: !directFrameDataUrl,
                            url: clipUrl,
                            mediaTimestamp: startMs,
                            subtitleFileName: '',
                            postMineAction: PostMineAction.exportCard,
                            audioPaddingStart: 0,
                            audioPaddingEnd: 0,
                            imageDelay: 150,
                            playbackRate: activeVideo.playbackRate || 1,
                            text: sentence || '',
                            definition: definition || '',
                            word,
                            customFieldValues: {
                                Translation: resolvedWordTranslation,
                                'Definition Translation': resolvedDefinitionTranslation,
                                'Context Translation': resolvedContextTranslation,
                                Phonetic: phonetic || '',
                                Details: typeof details === 'string' ? details : '',
                                'Image URL': directFrameDataUrl || '',
                                __ln_requestId: requestId || '',
                            },
                            maxWidth: 1280,
                            maxHeight: 720,
                            rect: captureRect,
                        },
                        src: miningSrc,
                    });

                    const restoreDelayMs = Math.min(12000, Math.max(1400, endMs - startMs + 500));
                    await new Promise((resolve) => setTimeout(resolve, restoreDelayMs));
                } finally {
                    if (popupHost) {
                        popupHost.style.visibility = popupPrevVisibility || '';
                        popupHost.style.pointerEvents = popupPrevPointerEvents || '';
                        popupHost.style.display = popupPrevDisplay || '';
                    }
                    for (const item of elementStyles) {
                        item.el.style.visibility = item.visibility;
                        item.el.style.opacity = item.opacity;
                        item.el.style.pointerEvents = item.pointerEvents;
                    }
                    if (wasPaused) {
                        if (isNetflixSource) {
                            dispatchNetflixPlayerEvent('asbplayer-netflix-pause');
                        } else {
                            void activeVideo.pause();
                        }
                    }
                }

                console.log('[LN Integration] Card media capture requested via legacy pipeline', {
                    word,
                    requestId,
                    startMs,
                    endMs,
                    dynamicCaptureMs,
                    tokenCount,
                    usedDirectFrame: !!directFrameDataUrl,
                    restoreDelayMs: Math.min(12000, Math.max(1400, endMs - startMs + 500)),
                });
                return;
            }
        }

        // Build card fields
        const cardFields: Record<string, any> = {
            front: word,
            back: definition,
            source: sourceUrlWithTime,
            word,
            sentence,
            definition,
            url: sourceUrlWithTime,
            wordTranslation: resolvedWordTranslation,
            definitionTranslation: resolvedDefinitionTranslation,
            contextTranslation: resolvedContextTranslation,
            phonetic: phonetic || '',
            phoneticLabel: typeof phoneticLabel === 'string' ? phoneticLabel : '',
            details: typeof details === 'string' ? details : '',
            frontAudioUrl: normalizeAudioUrl(audio),
        };
        if (isYoutubeSource) {
            cardFields.videoUrl = sourceUrlWithTime;
            if (currentVideoTime !== undefined) {
                cardFields.videoStart = currentVideoTime;
            }
            if (inferredClipEnd !== undefined) {
                cardFields.videoEnd = inferredClipEnd;
            }
        }
        if (translations) cardFields.translations = translations;
        if (audio) cardFields.audio = audio;
        if (cefr) cardFields.cefr = cefr;
        if (frequency) cardFields.frequency = frequency;
        if (language) cardFields.language = language;

        const response = await browser.runtime.sendMessage({
            type: 'METHEUS_CREATE_CARD',
            payload: {
                fields: cardFields,
                deckId,
                noteTypeId,
                language,
                requestId,
            },
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to create card via background');
        }

        console.log('[LN Integration] Card sent via background bridge', {
            deckId: response?.card?.deckId,
            noteTypeId: response?.card?.noteTypeId,
            word,
            requestId: response?.requestId || requestId,
        });
    } catch (error) {
        console.error('[LN Integration] Error creating card via Mochila:', error);
    }
}

/**
 * Get the current controller instance
 */
export function getMetheusControllerInstance(): MetheusController | null {
    return _controller;
}

/**
 * Check if Metheus is initialized
 */
export function isMetheusInitialized(): boolean {
    return _initialized && _controller !== null;
}

/**
 * Start observing subtitle elements for colorization
 */
export function startSubtitleObservation(container: HTMLElement, selector: string = '[data-track]'): void {
    if (_controller && _controller.enabled) {
        _controller.startObserving(container, selector);
    }
}

/**
 * Stop observing subtitle elements
 */
export function stopSubtitleObservation(): void {
    if (_controller) {
        _controller.stopObserving();
    }
}

/**
 * Force sync with Metheus server
 */
export async function forceSyncMetheus(): Promise<void> {
    if (_controller) {
        await _controller.forceSync();
    }
}

/**
 * Get sync status
 */
export async function getMetheusSyncStatus() {
    if (_controller) {
        return _controller.getSyncStatus();
    }
    return null;
}
