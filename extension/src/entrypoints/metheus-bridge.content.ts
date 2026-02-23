/**
 * METHEUS BRIDGE
 *
 * Takes the Extension ID and shouts it to the window so the Web App can hear it.
 * Runs on metheus.app, localhost, and 127.0.0.1 (any port, http/https)
 */

export default defineContentScript({
    matches: [
        'http://metheus.app/*',
        'https://metheus.app/*',
        'http://www.metheus.app/*',
        'https://www.metheus.app/*',
        'http://localhost/*',
        'https://localhost/*',
        'http://127.0.0.1/*',
        'https://127.0.0.1/*',
        'http://localhost:*/*',
        'https://localhost:*/*',
        'http://127.0.0.1:*/*',
        'https://127.0.0.1:*/*',
    ],
    main() {
        const pendingImportStorageKey = 'metheusPendingYoutubeImport';
        const pendingCardStorageKey = 'metheusPendingCardCreates';
        const pendingYoutubeImportRetries = new Map<string, number>();
        const pendingCardCreateRetries = new Map<string, number>();

        const stopYoutubeImportRetries = (requestId: string) => {
            const intervalId = pendingYoutubeImportRetries.get(requestId);
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
                pendingYoutubeImportRetries.delete(requestId);
            }
        };

        const forwardYoutubeImportToWeb = (payload: any, requestId?: string) => {
            const effectiveRequestId = requestId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            let attempts = 0;
            const maxAttempts = 20;

            const post = () => {
                attempts += 1;
                window.postMessage(
                    {
                        type: 'METHEUS_IMPORT_YOUTUBE_VIDEO',
                        payload,
                        requestId: effectiveRequestId,
                    },
                    window.location.origin
                );

                if (attempts >= maxAttempts) {
                    console.warn('[Metheus Extension] YouTube import ACK timeout; stopping retries', {
                        requestId: effectiveRequestId,
                        attempts,
                    });
                    stopYoutubeImportRetries(effectiveRequestId);
                }
            };

            post();
            const intervalId = window.setInterval(post, 500);
            pendingYoutubeImportRetries.set(effectiveRequestId, intervalId);
        };

        const stopCardCreateRetries = (requestId: string) => {
            const intervalId = pendingCardCreateRetries.get(requestId);
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
                pendingCardCreateRetries.delete(requestId);
            }
        };

        const loadPendingCardCreates = async (): Promise<
            { requestId: string; senderTabId?: number; data: any; createdAt: number }[]
        > => {
            const result = await browser.storage.local.get(pendingCardStorageKey);
            const pending = result?.[pendingCardStorageKey];
            if (!Array.isArray(pending)) {
                return [];
            }

            const now = Date.now();
            return pending.filter(
                (item): item is { requestId: string; senderTabId?: number; data: any; createdAt: number } => {
                    if (!item || typeof item.requestId !== 'string' || !item.data) {
                        return false;
                    }

                    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : 0;
                    return now - createdAt <= 60 * 60 * 1000;
                }
            );
        };

        const savePendingCardCreates = async (
            pending: { requestId: string; senderTabId?: number; data: any; createdAt: number }[]
        ) => {
            await browser.storage.local.set({ [pendingCardStorageKey]: pending });
        };

        const upsertPendingCardCreate = async (item: {
            requestId: string;
            senderTabId?: number;
            data: any;
            createdAt: number;
        }) => {
            const pending = await loadPendingCardCreates();
            const withoutCurrent = pending.filter((existing) => existing.requestId !== item.requestId);
            withoutCurrent.push(item);
            await savePendingCardCreates(withoutCurrent);
        };

        const removePendingCardCreate = async (requestId: string) => {
            const pending = await loadPendingCardCreates();
            const filtered = pending.filter((item) => item.requestId !== requestId);
            await savePendingCardCreates(filtered);
        };

        const forwardCardCreateToWeb = (data: any, requestId: string) => {
            let attempts = 0;
            const maxAttempts = 40;

            const post = () => {
                attempts += 1;
                window.postMessage(
                    {
                        type: 'METHEUS_BACKPACK_UPDATED',
                        timestamp: Date.now(),
                        data,
                    },
                    window.location.origin
                );

                if (attempts >= maxAttempts) {
                    console.warn('[Metheus Extension] Card create ACK timeout; stopping retries', {
                        requestId,
                        attempts,
                    });
                    stopCardCreateRetries(requestId);
                }
            };

            post();
            const intervalId = window.setInterval(post, 500);
            pendingCardCreateRetries.set(requestId, intervalId);
        };

        const flushPendingYoutubeImport = async () => {
            try {
                const result = await browser.storage.local.get(pendingImportStorageKey);
                const pending = result?.[pendingImportStorageKey] as
                    | { requestId?: string; payload?: any; createdAt?: number }
                    | undefined;

                if (!pending?.payload) {
                    return;
                }

                const ageMs = Date.now() - (pending.createdAt ?? 0);
                if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
                    await browser.storage.local.remove(pendingImportStorageKey);
                    return;
                }

                console.log('[Metheus Extension] Flushing pending YouTube import to Web');
                forwardYoutubeImportToWeb(pending.payload, pending.requestId);
            } catch (error) {
                console.warn('[Metheus Extension] Failed to flush pending YouTube import', error);
            }
        };

        const flushPendingCardCreates = async () => {
            try {
                const pending = await loadPendingCardCreates();
                for (const item of pending) {
                    if (!item.data?.card || !item.requestId) {
                        continue;
                    }

                    console.log('[Metheus Extension] Flushing pending card-create to Web', {
                        requestId: item.requestId,
                    });
                    forwardCardCreateToWeb(item.data, item.requestId);
                }
            } catch (error) {
                console.warn('[Metheus Extension] Failed to flush pending card creates', error);
            }
        };

        const injectExtensionId = () => {
            const extensionId = browser.runtime.id;

            // Method 1: Post Message (Immediate)
            // E-H6 FIX: Use specific target origin instead of '*' to avoid leaking extension ID
            window.postMessage(
                {
                    type: 'METHEUS_EXTENSION_DETECTED',
                    extensionId: extensionId,
                    version: browser.runtime.getManifest().version,
                },
                window.location.origin
            );

            console.log('[Metheus Extension] Bridge established. ID:', extensionId);
        };

        // Forward messages from Extension Background -> Web Page
        browser.runtime.onMessage.addListener((message) => {
            if (message && message.type === 'METHEUS_BACKPACK_UPDATED') {
                if (message.data?.type === 'card-created' && message.data?.requestId) {
                    const requestId = message.data.requestId;
                    void upsertPendingCardCreate({
                        requestId,
                        senderTabId: message.data.senderTabId,
                        data: message.data,
                        createdAt: Date.now(),
                    });
                    forwardCardCreateToWeb(message.data, requestId);
                } else {
                    console.log('[Metheus Extension] Forwarding Backpack Update signal to Web', message.data);
                    window.postMessage(
                        {
                            type: 'METHEUS_BACKPACK_UPDATED',
                            timestamp: Date.now(),
                            data: message.data,
                        },
                        window.location.origin
                    );
                }
            }

            if (message && message.type === 'METHEUS_AUTH_REQUEST') {
                console.log('[Metheus Extension] Forwarding Auth Request from Background to Web');
                window.postMessage(
                    {
                        type: 'METHEUS_AUTH_REQUEST',
                    },
                    window.location.origin
                );
            }

            if (message && message.type === 'METHEUS_EXTENSION_SETTINGS_UPDATED') {
                window.postMessage(
                    {
                        type: 'METHEUS_EXTENSION_SETTINGS_UPDATED',
                        settings: message.settings || {},
                    },
                    window.location.origin
                );
            }

            if (message && message.type === 'METHEUS_IMPORT_YOUTUBE_VIDEO') {
                void browser.storage.local.set({
                    [pendingImportStorageKey]: {
                        requestId: message.requestId,
                        payload: message.payload,
                        createdAt: Date.now(),
                    },
                });
                forwardYoutubeImportToWeb(message.payload, message.requestId);
            }
        });

        // Listen for PING from Web App (Late Discovery) & Upstream Stats
        window.addEventListener('message', (event) => {
            // E-L8 FIX: Validate event.origin to prevent cross-origin message injection
            if (event.origin !== window.location.origin) {
                console.log('[Bridge] Ignoring message from different origin:', event.origin);
                return;
            }

            console.log('[Bridge] Received from Web:', event.data?.type);

            if (event.data?.type === 'METHEUS_PING') {
                console.log('[Bridge] Web sent PING, re-injecting Extension ID');
                injectExtensionId();
            }

            if (event.data?.type === 'METHEUS_IMPORT_YOUTUBE_VIDEO_ACK' && event.data?.requestId) {
                stopYoutubeImportRetries(event.data.requestId);
                void browser.storage.local
                    .get(pendingImportStorageKey)
                    .then((result) => {
                        const pending = result?.[pendingImportStorageKey] as { requestId?: string } | undefined;
                        if (pending?.requestId && pending.requestId === event.data.requestId) {
                            return browser.storage.local.remove(pendingImportStorageKey);
                        }

                        return undefined;
                    })
                    .catch(() => undefined);
            }

            if (event.data?.type === 'METHEUS_CARD_CREATED_ACK' && event.data?.requestId) {
                stopCardCreateRetries(event.data.requestId);
                void removePendingCardCreate(event.data.requestId).catch(() => undefined);
                browser.runtime.sendMessage({
                    type: 'METHEUS_CARD_CREATED_ACK',
                    requestId: event.data.requestId,
                    cardId: event.data.cardId,
                    senderTabId: event.data.senderTabId,
                });
            }

            // NEW: Forward Stats from Web App to Extension Background
            if (event.data?.type === 'METHEUS_UPDATE_STATS') {
                console.log('[Bridge] Forwarding Stats to Background');
                browser.runtime.sendMessage({
                    type: 'METHEUS_UPDATE_STATS',
                    stats: event.data.stats,
                });
            }

            // NEW: Forward Config (decks, noteTypes) from Web App to Extension Background
            if (event.data?.type === 'METHEUS_UPDATE_CONFIG') {
                const config = event.data.config || {
                    decks: event.data.decks,
                    noteTypes: event.data.noteTypes,
                    nativeLanguage: event.data.nativeLanguage,
                    targetLanguage: event.data.targetLanguage,
                    miningDeckId: event.data.miningDeckId,
                    interfaceLanguage: event.data.interfaceLanguage,
                    knownWords: event.data.knownWords,
                    vocabularyCache: event.data.vocabularyCache,
                    vocabulary: event.data.vocabulary,
                };

                if (!config.knownWords && event.data.knownWords) {
                    config.knownWords = event.data.knownWords;
                }
                if (!config.vocabularyCache && event.data.vocabularyCache) {
                    config.vocabularyCache = event.data.vocabularyCache;
                }
                if (!config.vocabulary && event.data.vocabulary) {
                    config.vocabulary = event.data.vocabulary;
                }

                console.log('[Bridge] Forwarding Config to Background');
                browser.runtime.sendMessage({
                    type: 'METHEUS_UPDATE_CONFIG',
                    config,
                });
            }

            // FORWARD DELETE
            if (event.data?.type === 'METHEUS_DELETE_WORD') {
                console.log('[Bridge] Forwarding delete request');
                browser.runtime.sendMessage({
                    type: 'METHEUS_DELETE_WORD',
                    word: event.data.word,
                });
            }

            if (event.data?.type === 'METHEUS_UPDATE_WORD_STATUS') {
                browser.runtime.sendMessage({
                    type: 'METHEUS_UPDATE_WORD_STATUS',
                    word: event.data.word,
                    language: event.data.language,
                    status: event.data.status,
                });
            }

            // NEW: Forward Auth Push from Web App to Extension Background
            if (event.data?.type === 'METHEUS_AUTH_PUSH') {
                console.log(
                    '[Bridge] Received AUTH_PUSH from Web with key preview:',
                    event.data.apiKey?.substring(0, 8)
                );
                browser.runtime.sendMessage(
                    {
                        type: 'METHEUS_AUTH_PUSH',
                        apiKey: event.data.apiKey,
                        userId: event.data.userId,
                    },
                    (response) => {
                        if (response?.success) {
                            console.log('[Bridge] Auth Push confirmed by background');
                            // Notify web app that auth was successful
                            window.postMessage(
                                {
                                    type: 'METHEUS_AUTH_CONFIRMED',
                                    timestamp: Date.now(),
                                },
                                window.location.origin
                            );
                        } else {
                            console.error('[Metheus Extension] Auth Push failed or got no response');
                        }
                    }
                );
            }
        });

        injectExtensionId();
        void flushPendingYoutubeImport();
        void flushPendingCardCreates();
    },
});
