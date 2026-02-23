import React, { useMemo } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SettingsProvider } from '@metheus/common/settings';
import { getMetheusDictionaryService } from '../services/metheus-dictionary';
import { getMetheusSyncService } from '../services/metheus-sync';
import { normalizeAndMergeEntries, normalizeEntry, tokenizeText } from './dictionary-adapter';
import { DictionaryPopup } from './components/DictionaryPopup';
import { UnifiedEntry } from './types';
import { getSubtitleColorizer } from '../services/subtitle-colorizer';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import { createTheme } from '@metheus/common/theme';
import { type Theme, StyledEngineProvider } from '@mui/material/styles';
import ScopedCssBaseline from '@mui/material/ScopedCssBaseline';
// Note: Dictionary popup must use the *same* SettingsProvider instance passed in props,
// otherwise it can read from a different storage namespace and never reflect theme updates.
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';

interface DictionaryPopupWrapperProps {
    word: string;
    sentence: string;
    /** Detected language of the active subtitle track (not the user's target language) */
    subtitleLanguage?: string;
    longestMatch?: string;
    isOpen?: boolean;
    position: {
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
    };
    onClose: () => void;
    settingsProvider: SettingsProvider;
    rootElement?: HTMLElement;
}

export const DictionaryPopupWrapper: React.FC<DictionaryPopupWrapperProps> = ({
    word,
    sentence,
    subtitleLanguage,
    longestMatch,

    position,
    isOpen = true,
    onClose,
    settingsProvider,
    rootElement,
}) => {
    // IMPORTANT: use the SettingsProvider instance we receive via props (single source of truth)
    const [settings, setSettings] = React.useState<any>(undefined);

    React.useEffect(() => {
        let alive = true;
        settingsProvider.getAll().then((s) => {
            if (alive) setSettings(s);
        });
        return () => {
            alive = false;
        };
    }, [settingsProvider]);

    React.useEffect(() => {
        // Use the same message shape used across the extension: { sender, message: { command: ... } }
        const listener = (request: any) => {
            const command = request?.message?.command ?? request?.command;
            if (command === 'settings-updated') {
                settingsProvider.getAll().then(setSettings);
            }
        };
        browser.runtime.onMessage.addListener(listener);
        return () => {
            browser.runtime.onMessage.removeListener(listener);
        };
    }, [settingsProvider]);

    // CRITICAL FIX: Also listen to storage changes directly (more reliable in Shadow DOM)
    React.useEffect(() => {
        const handleStorageChange = (changes: any, areaName: string) => {
            // Check if themeType changed
            const themeChanged = Object.keys(changes).some((key) => key.includes('themeType'));
            if (themeChanged) {
                console.log('[DictionaryPopup] Theme changed via storage, refreshing settings...');
                settingsProvider.getAll().then(setSettings);
            }
        };

        if (browser?.storage?.onChanged) {
            browser.storage.onChanged.addListener(handleStorageChange);
        }
        return () => {
            if (browser?.storage?.onChanged) {
                browser.storage.onChanged.removeListener(handleStorageChange);
            }
        };
    }, [settingsProvider]);

    const theme = useMemo(() => {
        if (!settings) return undefined;
        return createTheme(settings.themeType);
    }, [settings]);

    const dictionaryService = getMetheusDictionaryService(settingsProvider);
    const syncService = getMetheusSyncService(settingsProvider);

    const rankDefinitionsByContext = (entry: UnifiedEntry, ctx: string): UnifiedEntry => {
        if (!entry.definitions || entry.definitions.length <= 1 || !ctx) {
            return entry;
        }

        const contextTokens = tokenizeText(ctx, entry.language || 'en')
            .filter((t) => t.isWord)
            .map((t) => t.text.toLowerCase())
            .filter(Boolean);

        if (contextTokens.length === 0) {
            return entry;
        }

        const scored = entry.definitions.map((def) => {
            const corpus = `${def.meaning} ${def.examples?.map((e) => e.sentence).join(' ') ?? ''}`.toLowerCase();
            let score = 0;
            for (const token of contextTokens) {
                if (token.length < 2) continue;
                if (corpus.includes(token)) score++;
            }
            return { def, score };
        });

        scored.sort((a, b) => b.score - a.score);

        // Keep stable indices after ranking
        const ranked = scored.map((s, i) => ({ ...s.def, index: i + 1 }));

        return {
            ...entry,
            definitions: ranked,
        };
    };

    const lookupEntry = React.useCallback(
        async (text: string, langOrder: string[]): Promise<UnifiedEntry | null> => {
            console.log(`[PopupWrapper] lookupEntry called for '${text}' with languages: [${langOrder.join(', ')}]`);
            const collected: any[] = [];
            for (const lang of langOrder) {
                try {
                    console.log(`[PopupWrapper] Looking up '${text}' in language '${lang}'`);
                    const r = await dictionaryService.lookup(text, lang);
                    console.log(
                        `[PopupWrapper] Result for '${text}' in '${lang}': found=${r.found}, entries=${r.allEntries?.length || (r.found ? 1 : 0)}`
                    );
                    if (r.allEntries && r.allEntries.length > 0) {
                        collected.push(...r.allEntries);
                    } else if (r.found && r.entry) {
                        collected.push(r.entry);
                    }
                } catch (e) {
                    console.error(`[PopupWrapper] Error looking up '${text}' in '${lang}':`, e);
                }
            }
            console.log(`[PopupWrapper] Total collected entries for '${text}': ${collected.length}`);
            if (collected.length > 0) {
                return normalizeAndMergeEntries(collected as any);
            }
            console.log(`[PopupWrapper] No entries found for '${text}' in any language`);
            return null;
        },
        [dictionaryService]
    );

    const handleGetDefinition = React.useCallback(
        async (w: string): Promise<UnifiedEntry | null> => {
            if (!isOpen) return null; // Avoid work during preload/hidden state

            console.log(`[PopupWrapper] handleGetDefinition called for word: '${w}'`);
            const settings = await settingsProvider.get(['metheusTargetLanguage']);
            const targetLang = settings.metheusTargetLanguage || 'en';

            // ONLY search the user's current study language + subtitle language.
            // Do NOT iterate all 21 supported languages — this was the main perf bottleneck.
            const languageOrder: string[] = [];
            if (targetLang) languageOrder.push(targetLang);
            if (subtitleLanguage && subtitleLanguage !== targetLang) languageOrder.push(subtitleLanguage);

            console.log(`[PopupWrapper] Language order: [${languageOrder.join(', ')}]`);
            console.log(`[PopupWrapper] Target language from settings: '${targetLang}'`);
            console.log(`[PopupWrapper] Subtitle language: '${subtitleLanguage}'`);

            // 1. Lookup Longest Match (if exists)
            let longestEntry: UnifiedEntry | null = null;
            if (longestMatch && longestMatch.length > w.length) {
                // Clean logic similar to web app
                const cleanLongest = longestMatch.trim().replace(/[.,!?;:()]/g, '');
                longestEntry = await lookupEntry(cleanLongest, languageOrder);
            }

            // 2. Lookup Clicked Word
            const mainEntry = await lookupEntry(w, languageOrder);

            // 3. Merge Strategies
            if (mainEntry) {
                // Context ranking first
                let result = rankDefinitionsByContext(mainEntry, sentence);

                // If we found a longest match, prepend its definitions!
                if (longestEntry && longestEntry.definitions.length > 0) {
                    // We might want to mark them visually as "Phrase Match" in the future
                    result.definitions = [...longestEntry.definitions, ...result.definitions];
                    // Also merge badges if useful
                    if (longestEntry.badges) {
                        result.badges = [...longestEntry.badges, ...result.badges];
                    }
                }
                console.log(
                    `[PopupWrapper] Returning entry for '${w}': ${result.definitions?.length || 0} definitions`
                );
                return result;
            } else if (longestEntry) {
                // Fallback: Clicked word not found, but phrase was? Show phrase.
                const result = rankDefinitionsByContext(longestEntry, sentence);
                console.log(
                    `[PopupWrapper] Returning longest match entry for '${w}': ${result.definitions?.length || 0} definitions`
                );
                return result;
            }

            console.log(`[PopupWrapper] No entry found for '${w}', returning null`);
            return null;
        },
        [longestMatch, sentence, subtitleLanguage, settingsProvider, isOpen, lookupEntry]
    );

    /**
     * Online enrichment: fetch additional definitions/examples/audio from external APIs.
     * Called after local results are shown.
     * STREAMING MODE: Fires separate parallel requests per provider.
     * Each provider's results are merged into the popup as they arrive via onBatch callback.
     */
    const handleOnlineEnrich = React.useCallback(
        async (w: string, language: string, onBatch: (entry: UnifiedEntry) => void): Promise<void> => {
            // Known provider names — all will be tried in parallel.
            // Providers that don't support the language will return empty arrays harmlessly.
            const PROVIDER_NAMES = ['Free Dictionary API', 'Wiktionary', 'Jisho', 'NIKL Korean', 'Tatoeba'];

            const promises = PROVIDER_NAMES.map(async (providerName) => {
                try {
                    const response = await browser.runtime.sendMessage({
                        sender: 'metheus-client',
                        message: {
                            command: 'dictionary-online-enrich',
                            messageId: `enrich-${providerName}-${Date.now()}`,
                            word: w,
                            language,
                            provider: providerName,
                        },
                    });

                    const result = response as { entries?: any[]; fromCache?: boolean; sources?: string[] } | undefined;
                    if (!result?.entries || result.entries.length === 0) return;

                    // Normalize through the adapter pipeline and deliver to popup
                    const unified = normalizeAndMergeEntries(result.entries);
                    if (unified) {
                        onBatch(unified);
                    }
                } catch (e) {
                    // Individual provider failure is fine — others keep running
                    console.warn(`[PopupWrapper] Online enrichment (${providerName}) failed:`, e);
                }
            });

            await Promise.allSettled(promises);
        },
        []
    );

    const handleMarkKnown = React.useCallback(
        async (w: string, status: number) => {
            const settings = await settingsProvider.get(['metheusTargetLanguage']);
            const lang = settings.metheusTargetLanguage || 'en';

            // Update status in sync service
            await syncService.updateWordStatus(w, lang, status as any);

            // Immediately update subtitle styling on the page
            document.dispatchEvent(
                new CustomEvent('metheus-word-status-updated', {
                    detail: {
                        word: w,
                        status,
                        language: lang,
                    },
                })
            );

            // Notify other extension parts (Side Panel) via runtime message
            try {
                // Small delay to ensure storage write propagates to other views
                await new Promise((r) => setTimeout(r, 200));
                await browser.runtime.sendMessage({
                    sender: 'metheus-popup',
                    message: {
                        command: 'metheus-word-status-updated',
                        word: w,
                        status,
                        language: lang,
                    },
                });
            } catch (e) {
                console.error('Failed to broadcast status update via runtime:', e);
            }
        },
        [settingsProvider, syncService]
    );

    const handleCreateCard = React.useCallback(
        async (
            entry: UnifiedEntry,
            context: string,
            definition: string,
            metadata?: {
                contextTranslation?: string;
                definitionTranslation?: string;
                wordTranslation?: string;
                phonetic?: string;
                phoneticLabel?: string;
                details?: string;
            }
        ) => {
            const settings = await settingsProvider.get([
                'metheusTargetDeckId',
                'metheusTargetLanguage',
                'metheusNoteType',
            ]);
            const lang = settings.metheusTargetLanguage || 'en';
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const activeVideoForMediaCapture = document.querySelector('video') as HTMLVideoElement | null;
            const mediaCaptureLikely =
                !!activeVideoForMediaCapture &&
                Number.isFinite(activeVideoForMediaCapture.currentTime) &&
                activeVideoForMediaCapture.readyState >= 2;
            const ackTimeoutMs = mediaCaptureLikely ? 22000 : 12000;

            const popupHideSelectors = ['#metheus-popup-host'];

            const hiddenPopupElements = popupHideSelectors
                .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
                .map((el) => ({
                    el,
                    visibility: el.style.visibility,
                    opacity: el.style.opacity,
                    pointerEvents: el.style.pointerEvents,
                    display: el.style.display,
                }));

            for (const item of hiddenPopupElements) {
                item.el.style.visibility = 'hidden';
                item.el.style.opacity = '0';
                item.el.style.pointerEvents = 'none';
                item.el.style.display = 'none';
            }

            await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
            await new Promise((resolve) => setTimeout(resolve, 220));

            try {
                // Try to pass extra metadata (CEFR/frequency/translations/audio) along with the card request.
                const cefr = entry.linguisticData?.find((x) => x.key === 'cefr')?.value;
                const frequency = entry.linguisticData?.find((x) => x.key === 'frequency')?.value;

                const cardId = await new Promise<string | undefined>((resolve) => {
                    let listener: (request: any) => void;
                    const timeout = window.setTimeout(() => {
                        browser.runtime.onMessage.removeListener(listener);
                        resolve(undefined);
                    }, ackTimeoutMs);

                    listener = (request: any) => {
                        const command = request?.message?.command ?? request?.command;
                        if (command !== 'metheus-card-created-ack') {
                            return;
                        }

                        if (request?.message?.requestId !== requestId) {
                            return;
                        }

                        window.clearTimeout(timeout);
                        browser.runtime.onMessage.removeListener(listener);
                        resolve(request?.message?.cardId);
                    };

                    browser.runtime.onMessage.addListener(listener);

                    document.dispatchEvent(
                        new CustomEvent('metheus-create-card', {
                            detail: {
                                word: entry.word,
                                sentence: context,
                                definition: definition,
                                language: lang,
                                deckId: settings.metheusTargetDeckId,
                                noteTypeId: settings.metheusNoteType || 'STANDARD',
                                translations: entry.translations,
                                wordTranslation: metadata?.wordTranslation,
                                definitionTranslation: metadata?.definitionTranslation,
                                contextTranslation: metadata?.contextTranslation,
                                phonetic: metadata?.phonetic || entry.phonetic,
                                phoneticLabel: metadata?.phoneticLabel || entry.phoneticLabel,
                                details: metadata?.details,
                                audio: entry.audio,
                                cefr,
                                frequency,
                                mediaTimestampMs:
                                    activeVideoForMediaCapture &&
                                    Number.isFinite(activeVideoForMediaCapture.currentTime)
                                        ? Math.max(0, Math.floor(activeVideoForMediaCapture.currentTime * 1000))
                                        : undefined,
                                requestId,
                            },
                        })
                    );
                });

                if (cardId) {
                    return { requestId, cardId };
                }

                const sourceUrl = window.location.href;
                const isYoutubeSource = /(?:youtube\.com|youtu\.be)/i.test(sourceUrl);
                const activeVideo = activeVideoForMediaCapture;

                const hideForCaptureSelectors = [
                    '#ln-smart-hub-pill-iframe',
                    '.asbplayer-mobile-video-overlay-container-top',
                    '.asbplayer-mobile-video-overlay-container-bottom',
                    '.asbplayer-mobile-video-overlay',
                ];

                const temporarilyHidden = hideForCaptureSelectors
                    .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
                    .map((el) => ({
                        el,
                        visibility: el.style.visibility,
                        opacity: el.style.opacity,
                        pointerEvents: el.style.pointerEvents,
                        display: el.style.display,
                    }));

                for (const item of temporarilyHidden) {
                    item.el.style.visibility = 'hidden';
                    item.el.style.opacity = '0';
                    item.el.style.pointerEvents = 'none';
                    item.el.style.display = 'none';
                }

                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

                let screenshotUrl = '';
                try {
                    const dataUrl = await browser.runtime.sendMessage({
                        sender: 'asbplayer-foreground',
                        message: { command: 'capture-visible-tab' },
                    });
                    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                        screenshotUrl = dataUrl;
                    }
                } catch (captureError) {
                    console.warn('[DictionaryPopup] Fallback screenshot capture failed', captureError);
                } finally {
                    for (const item of temporarilyHidden) {
                        item.el.style.visibility = item.visibility;
                        item.el.style.opacity = item.opacity;
                        item.el.style.pointerEvents = item.pointerEvents;
                        item.el.style.display = item.display;
                    }
                }

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

                const cardFields: Record<string, any> = {
                    front: entry.word,
                    back: definition,
                    source: sourceUrl,
                    word: entry.word,
                    sentence: context,
                    definition,
                    url: sourceUrl,
                    wordTranslation:
                        extractTranslation(metadata?.wordTranslation) || extractTranslation(entry.translations),
                    definitionTranslation: extractTranslation(metadata?.definitionTranslation),
                    contextTranslation: extractTranslation(metadata?.contextTranslation),
                    phonetic: metadata?.phonetic || entry.phonetic || '',
                    phoneticLabel: metadata?.phoneticLabel || entry.phoneticLabel || '',
                    details: typeof metadata?.details === 'string' ? metadata.details : '',
                    frontAudioUrl: typeof entry.audio === 'string' ? entry.audio : '',
                };

                if (screenshotUrl) {
                    cardFields.imageUrl = screenshotUrl;
                }

                if (isYoutubeSource) {
                    cardFields.videoUrl = sourceUrl;
                } else if (activeVideo) {
                    cardFields.videoUrl = sourceUrl;
                }

                const response = await browser.runtime.sendMessage({
                    type: 'METHEUS_CREATE_CARD',
                    payload: {
                        fields: cardFields,
                        deckId: settings.metheusTargetDeckId,
                        noteTypeId: settings.metheusNoteType || 'STANDARD',
                        language: lang,
                        requestId,
                    },
                });

                if (!response?.success) {
                    throw new Error(response?.error || 'Fallback create card failed');
                }

                return { requestId, cardId: response?.card?.id };
            } finally {
                await new Promise((resolve) => setTimeout(resolve, 900));
                for (const item of hiddenPopupElements) {
                    item.el.style.visibility = item.visibility;
                    item.el.style.opacity = item.opacity;
                    item.el.style.pointerEvents = item.pointerEvents;
                    item.el.style.display = item.display;
                }
            }
        },
        [settingsProvider]
    );

    const handleOpenSavedCard = React.useCallback(
        async (cardId: string) => {
            const response = await browser.runtime.sendMessage({
                type: 'METHEUS_OPEN_CARD_EDITOR',
                payload: { cardId },
            });

            if (response?.success) {
                return;
            }

            const settings = await settingsProvider.get(['metheusUrl']);
            const baseOrigin =
                typeof settings.metheusUrl === 'string' && settings.metheusUrl.trim().length > 0
                    ? settings.metheusUrl.replace(/\/$/, '')
                    : 'https://metheus.app';
            window.open(`${baseOrigin}/browser?mode=edit&cardId=${encodeURIComponent(cardId)}`, '_blank');
        },
        [settingsProvider]
    );

    const handleGetWordStatus = React.useCallback(
        async (w: string): Promise<number> => {
            const settings = await settingsProvider.get(['metheusTargetLanguage']);
            const lang = settings.metheusTargetLanguage || 'en';
            const status = await syncService.getWordStatus(w, lang);
            return status ?? 0;
        },
        [settingsProvider, syncService]
    );

    // Create emotion cache optimized for Shadow DOM
    const cache = React.useMemo(() => {
        return createCache({
            key: 'css',
            prepend: true,
            container: rootElement,
        });
    }, [rootElement]);

    // Early return if settings not loaded yet (like SettingsUi pattern)
    if (!settings || theme == null) {
        return null;
    }

    return (
        <div className={settings?.themeType === 'dark' ? 'dark' : ''}>
            <CacheProvider value={cache}>
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={theme}>
                        <ScopedCssBaseline>
                            <DictionaryPopup
                                word={word}
                                context={sentence}
                                contextLanguage={subtitleLanguage}
                                themeType={settings.themeType}
                                position={position}
                                isOpen={isOpen}
                                onClose={() => {
                                    const colorizer = getSubtitleColorizer(settingsProvider);
                                    colorizer.clearActiveHighlight();
                                    onClose();
                                }}
                                onGetDefinition={handleGetDefinition}
                                onOnlineEnrich={
                                    settings.metheusOnlineDictionary !== false ? handleOnlineEnrich : undefined
                                }
                                onMarkKnown={handleMarkKnown}
                                onCreateCard={handleCreateCard}
                                onOpenSavedCard={handleOpenSavedCard}
                                onGetWordStatus={handleGetWordStatus}
                            />
                        </ScopedCssBaseline>
                    </ThemeProvider>
                </StyledEngineProvider>
            </CacheProvider>
        </div>
    );
};

// Mount helper
let popupRoot: Root | null = null;
let popupContainer: HTMLElement | null = null;

export function mountDictionaryPopup(container: HTMLElement, props: DictionaryPopupWrapperProps) {
    if (!popupRoot) {
        popupRoot = createRoot(container);
    }

    // We need to wrap in StrictMode or similar if desired, but direct is fine.
    // Important: styling injection. Tailwind styles must be present in the shadow root.
    // The container should be inside the shadow root.

    popupRoot.render(<DictionaryPopupWrapper {...props} rootElement={container} />);
}

export function unmountDictionaryPopup() {
    if (popupRoot) {
        popupRoot.unmount();
        popupRoot = null;
    }
}
