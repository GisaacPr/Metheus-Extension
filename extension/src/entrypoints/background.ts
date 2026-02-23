import TabRegistry, { Asbplayer } from '@/services/tab-registry';
import ImageCapturer from '@/services/image-capturer';
import VideoHeartbeatHandler from '@/handlers/video/video-heartbeat-handler';
import RecordMediaHandler from '@/handlers/video/record-media-handler';
import RerecordMediaHandler from '@/handlers/video/rerecord-media-handler';
import StartRecordingMediaHandler from '@/handlers/video/start-recording-media-handler';
import StopRecordingMediaHandler from '@/handlers/video/stop-recording-media-handler';
import ToggleSubtitlesHandler from '@/handlers/video/toggle-subtitles-handler';
import SyncHandler from '@/handlers/video/sync-handler';
import HttpPostHandler from '@/handlers/video/http-post-handler';
import VideoToAsbplayerCommandForwardingHandler from '@/handlers/video/video-to-asbplayer-command-forwarding-handler';
import AsbplayerToVideoCommandForwardingHandler from '@/handlers/asbplayer/asbplayer-to-video-command-forwarding-handler';
import AsbplayerV2ToVideoCommandForwardingHandler from '@/handlers/asbplayerv2/asbplayer-v2-to-video-command-forwarding-handler';
import AsbplayerHeartbeatHandler from '@/handlers/asbplayerv2/asbplayer-heartbeat-handler';
import RefreshSettingsHandler from '@/handlers/popup/refresh-settings-handler';
import { CommandHandler } from '@/handlers/command-handler';
import TakeScreenshotHandler from '@/handlers/video/take-screenshot-handler';
import AudioRecorderService from '@/services/audio-recorder-service';
import AudioBase64Handler from '@/handlers/offscreen-document/audio-base-64-handler';
import AckTabsHandler from '@/handlers/asbplayerv2/ack-tabs-handler';
import OpenExtensionShortcutsHandler from '@/handlers/asbplayerv2/open-extension-shortcuts-handler';
import ExtensionCommandsHandler from '@/handlers/asbplayerv2/extension-commands-handler';
import OpenAsbplayerSettingsHandler from '@/handlers/video/open-asbplayer-settings-handler';
import CaptureVisibleTabHandler from '@/handlers/foreground/capture-visible-tab-handler';
import CopyToClipboardHandler from '@/handlers/video/copy-to-clipboard-handler';
import SettingsUpdatedHandler from '@/handlers/asbplayerv2/settings-updated-handler';
import {
    Command,
    CopySubtitleMessage,
    ExtensionToAsbPlayerCommand,
    ExtensionToVideoCommand,
    Message,
    TakeScreenshotMessage,
    ToggleRecordingMessage,
    ToggleVideoSelectMessage,
} from '@metheus/common';
import { SettingsProvider } from '@metheus/common/settings';
import { fetchSupportedLanguages, primeLocalization } from '@/services/localization-fetcher';
import VideoDisappearedHandler from '@/handlers/video/video-disappeared-handler';
import { ExtensionSettingsStorage } from '@/services/extension-settings-storage';
import LoadSubtitlesHandler from '@/handlers/asbplayerv2/load-subtitles-handler';
import ToggleSidePanelHandler from '@/handlers/video/toggle-side-panel-handler';
import OpenSidePanelHandler from '@/handlers/video/open-side-panel-handler';
import CopySubtitleHandler from '@/handlers/asbplayerv2/copy-subtitle-handler';
import { RequestingActiveTabPermissionHandler } from '@/handlers/video/requesting-active-tab-permission';
import { CardPublisher } from '@/services/card-publisher';
import AckMessageHandler from '@/handlers/video/ack-message-handler';
import PublishCardHandler from '@/handlers/asbplayerv2/publish-card-handler';
import BulkExportCancellationHandler from '@/handlers/asbplayerv2/bulk-export-cancellation-handler';
import BulkExportStartedHandler from '@/handlers/asbplayerv2/bulk-export-started-handler';
import { bindWebSocketClient, unbindWebSocketClient } from '@/services/web-socket-client-binding';
import { isFirefoxBuild } from '@/services/build-flags';
import { CaptureStreamAudioRecorder, OffscreenAudioRecorder } from '@/services/audio-recorder-delegate';
import RequestModelHandler from '@/handlers/mobile-overlay/request-model-handler';
import CurrentTabHandler from '@/handlers/mobile-overlay/current-tab-handler';
import UpdateMobileOverlayModelHandler from '@/handlers/video/update-mobile-overlay-model-handler';
import { isMobile } from '@metheus/common/device-detection/mobile';
import { enqueueUpdateAlert } from '@/services/update-alert';
import RequestSubtitlesHandler from '@/handlers/asbplayerv2/request-subtitles-handler';
import RequestCurrentSubtitleHandler from '@/handlers/asbplayerv2/request-current-subtitle-handler';
import MobileOverlayForwarderHandler from '@/handlers/mobile-overlay/mobile-overlay-forwarder-handler';
import RequestCopyHistoryHandler from '@/handlers/asbplayerv2/request-copy-history-handler';
import DeleteCopyHistoryHandler from '@/handlers/asbplayerv2/delete-copy-history-handler';
import ClearCopyHistoryHandler from '@/handlers/asbplayerv2/clear-copy-history-handler';
import SaveCopyHistoryHandler from '@/handlers/asbplayerv2/save-copy-history-handler';
import PageConfigHandler from '@/handlers/asbplayerv2/page-config-handler';
import EncodeMp3Handler from '@/handlers/video/encode-mp3-handler';
import MetheusSaveCardHandler from '@/handlers/video/metheus-save-card-handler';
import DictionaryMessageHandler from '@/handlers/dictionary-message-handler';
import MetheusTogglePopupHandler from '@/handlers/metheus/metheus-toggle-popup-handler';
import MetheusShowPopupHandler from '@/handlers/metheus/metheus-show-popup-handler';
import { getMetheusSyncService } from '@/services/metheus-sync';
import { getOnlineDictionaryService } from '@/services/online-dictionary';

export default defineBackground(() => {
    if (!isFirefoxBuild) {
        browser.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    }

    const settings = new SettingsProvider(new ExtensionSettingsStorage());
    const pendingCardCreateStorageKey = 'metheusPendingCardCreates';
    const maxPendingCardAgeMs = 60 * 60 * 1000;

    // Clean expired online dictionary cache on startup
    getOnlineDictionaryService()
        .cleanExpiredCache()
        .catch(() => {});

    type PendingCardCreateEvent = {
        requestId: string;
        senderTabId?: number;
        data: any;
        createdAt: number;
    };

    const loadPendingCardCreates = async (): Promise<PendingCardCreateEvent[]> => {
        const result = await browser.storage.local.get(pendingCardCreateStorageKey);
        const pending = result?.[pendingCardCreateStorageKey];
        if (!Array.isArray(pending)) {
            return [];
        }

        const now = Date.now();
        return pending.filter((item): item is PendingCardCreateEvent => {
            if (!item || typeof item.requestId !== 'string' || !item.data) {
                return false;
            }

            const createdAt = typeof item.createdAt === 'number' ? item.createdAt : 0;
            return now - createdAt <= maxPendingCardAgeMs;
        });
    };

    const savePendingCardCreates = async (pending: PendingCardCreateEvent[]) => {
        await browser.storage.local.set({
            [pendingCardCreateStorageKey]: pending,
        });
    };

    const upsertPendingCardCreate = async (item: PendingCardCreateEvent) => {
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

    const findPendingCardCreate = async (requestId: string): Promise<PendingCardCreateEvent | undefined> => {
        const pending = await loadPendingCardCreates();
        return pending.find((item) => item.requestId === requestId);
    };

    const ensureMetheusWebTab = async () => {
        const tabs = await browser.tabs.query({
            url: ['*://metheus.app/*', '*://www.metheus.app/*', '*://localhost/*', '*://127.0.0.1/*'],
        });

        if (tabs.length > 0) {
            return;
        }

        const origin = await settings.getSingle('metheusUrl');
        const baseOrigin =
            typeof origin === 'string' && origin.trim().length > 0 ? origin.replace(/\/$/, '') : 'https://metheus.app';

        try {
            await browser.tabs.create({ url: `${baseOrigin}/browser`, active: false });
        } catch {
            await browser.tabs.create({ url: baseOrigin, active: false });
        }
    };

    const broadcastWordStatusUpdateToVideoTabs = async (word: string, language: string, status: number) => {
        const payload = {
            sender: 'metheus-web',
            message: {
                command: 'metheus-word-status-updated',
                word,
                language,
                status,
            },
        };

        try {
            const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
            await Promise.all(
                tabs
                    .filter((tab) => tab.id !== undefined)
                    .map((tab) => browser.tabs.sendMessage(tab.id!, payload).catch(() => undefined))
            );
        } catch (error) {
            console.warn('[LN Background] Failed to broadcast word-status update to tabs', error);
        }
    };

    const startListener = async () => {
        primeLocalization(await settings.getSingle('language'));
    };

    // E-C4 FIX: Single unified onMessageExternal listener.
    // CRITICAL for MV3: MUST return true for async operations, false/undefined closes port
    browser.runtime.onMessageExternal.addListener((request: any, sender: any, sendResponse: any) => {
        if (!request || !request.type) return false;

        // --- METHEUS STATS UPDATE ---
        if (request.type === 'METHEUS_UPDATE_STATS') {
            console.log('[LN Background] Received stats update from Web App', request.stats);
            const syncService = getMetheusSyncService(settings);
            syncService.updateStats(request.stats);
            sendResponse({ received: true });
            return true; // CRITICAL: Return true to keep port open
        }

        // --- METHEUS DELETE WORD ---
        if (request.type === 'METHEUS_DELETE_WORD') {
            console.log('[LN Background] Received delete request', request.word);
            const syncService = getMetheusSyncService(settings);
            syncService.removeCachedWord(request.word);
            sendResponse({ success: true });
            return true; // CRITICAL: Return true to keep port open
        }

        console.log('[Background] Received external message:', request.type, sender);

        // --- HANDSHAKE: AUTH ---
        if (request.type === 'METHEUS_AUTH_SUCCESS') {
            const { apiKey, userId } = request;
            console.log('[Background] Auth success message received. Key length:', apiKey?.length, 'UserId:', userId);

            let url = sender.url;
            if (sender.origin) {
                url = sender.origin;
            } else if (sender.url) {
                try {
                    const u = new URL(sender.url);
                    url = u.origin;
                } catch (e) {
                    // ignore
                }
            }

            console.log('[Background] Detected Metheus URL from auth:', url);

            if (apiKey) {
                const updates: any = {
                    metheusApiKey: apiKey,
                    metheusUserId: userId,
                    metheusEnabled: true,
                };

                if (url && (url.includes('lingua') || url.includes('localhost') || url.includes('127.0.0.1'))) {
                    updates.metheusUrl = url;
                }

                settings.set(updates).then(() => {
                    console.log('[Background] Settings saved successfully', updates);
                    sendResponse({ success: true });
                });
                return true; // Keep channel open for async response
            } else {
                console.error('[Background] Missing API Key in auth message');
                return true;
            }
        }

        // --- MOCHILA: HANDOFF ---
        if (request.type === 'METHEUS_GET_BACKPACK') {
            console.log('[Background] Web App requested Backpack contents');
            const syncService = getMetheusSyncService(settings);

            syncService.waitForCache().then(() => {
                const words = syncService.getBackpackData();
                console.log(`[Background] Returning ${words.length} buffered items`);
                sendResponse({ success: true, words });
            });

            return true; // Async response - CRITICAL
        }

        if (request.type === 'METHEUS_CLEAR_BACKPACK') {
            const { wordKeys } = request;
            console.log('[Background] Web App confirmed safe receipt of items:', wordKeys?.length);

            if (Array.isArray(wordKeys) && wordKeys.length > 0) {
                const syncService = getMetheusSyncService(settings);
                syncService.clearBackpackData(wordKeys).then(() => {
                    sendResponse({ success: true });
                });
                return true; // Async
            } else {
                sendResponse({ success: false, error: 'No keys provided' });
                return true;
            }
        }

        // --- PROXY: UPDATE WORD STATUS ---
        if (request.type === 'METHEUS_UPDATE_WORD_STATUS') {
            const { word, language, status } = request;
            console.log(`[Background] Received proxy update for '${word}' (${language}) -> ${status}`);

            const syncService = getMetheusSyncService(settings);
            syncService.waitForCache().then(() => {
                syncService.updateWordStatus(word, language, status).then(() => {
                    void broadcastWordStatusUpdateToVideoTabs(word, language, status);
                    console.log('[Background] Proxy update completed');
                    sendResponse({ success: true });
                });
            });
            return true; // Async
        }

        // If we got here, we don't recognize this message type
        return false;
    });

    // Also listen for internal messages (if sent via bridge/content script)
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
        if (message && message.type === 'METHEUS_UPDATE_WORD_STATUS') {
            const { word, language, status } = message;
            const syncService = getMetheusSyncService(settings);
            syncService
                .waitForCache()
                .then(() => syncService.updateWordStatus(word, language, status))
                .then(() => {
                    void broadcastWordStatusUpdateToVideoTabs(word, language, status);
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.error('[LN Background] Internal word-status update failed', error);
                    sendResponse({ success: false, error: error?.message || 'Unknown error' });
                });
            return true;
        }

        if (message && message.type === 'METHEUS_CARD_CREATED_ACK') {
            const { requestId, cardId, senderTabId } = message;

            if (!requestId || !cardId) {
                sendResponse({ success: false, error: 'Missing requestId/cardId' });
                return true;
            }

            (async () => {
                const pending = await findPendingCardCreate(requestId);
                const resolvedSenderTabId = typeof senderTabId === 'number' ? senderTabId : pending?.senderTabId;
                await removePendingCardCreate(requestId);

                if (typeof resolvedSenderTabId === 'number') {
                    await browser.tabs.sendMessage(resolvedSenderTabId, {
                        sender: 'metheus-web',
                        message: {
                            command: 'metheus-card-created-ack',
                            requestId,
                            cardId,
                        },
                    });
                }

                sendResponse({ success: true });
            })().catch((error) => {
                console.warn('[LN Background] Failed to forward card-created ACK to source tab', error);
                sendResponse({ success: false, error: error?.message || 'Failed to notify source tab' });
            });

            return true;
        }

        if (message && message.type === 'METHEUS_OPEN_CARD_EDITOR') {
            const cardId = message?.payload?.cardId;
            if (!cardId) {
                sendResponse({ success: false, error: 'Missing cardId' });
                return true;
            }

            settings
                .getSingle('metheusUrl')
                .then((origin) => {
                    const baseOrigin =
                        typeof origin === 'string' && origin.trim().length > 0
                            ? origin.replace(/\/$/, '')
                            : 'https://metheus.app';
                    const url = `${baseOrigin}/browser?mode=edit&cardId=${encodeURIComponent(cardId)}`;
                    return browser.tabs.create({ url, active: true });
                })
                .then(() => sendResponse({ success: true }))
                .catch((error) => {
                    console.error('[LN Background] Failed to open card editor URL', error);
                    sendResponse({ success: false, error: error?.message || 'Unknown error' });
                });

            return true;
        }

        if (message && message.type === 'METHEUS_CREATE_CARD') {
            const payload = message.payload || {};
            const syncService = getMetheusSyncService(settings);

            syncService
                .waitForCache()
                .then(async () => {
                    const lnSettings = await settings.get(['metheusTargetDeckId', 'metheusNoteType']);
                    const card = {
                        fields: payload.fields || {},
                        deckId: payload.deckId || lnSettings.metheusTargetDeckId || 'default',
                        noteTypeId: payload.noteTypeId || lnSettings.metheusNoteType || 'STANDARD',
                        targetLanguage: payload.language || 'en',
                        createdAt: Date.now(),
                    };
                    const requestId = payload.requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                    const senderTabId = sender?.tab?.id;
                    const data = { type: 'card-created', card, requestId, senderTabId };

                    await upsertPendingCardCreate({
                        requestId,
                        senderTabId,
                        data,
                        createdAt: Date.now(),
                    });

                    await syncService.broadcastUpdate(data);
                    await ensureMetheusWebTab();
                    await syncService.incrementDailyMinedCount();

                    console.log('[LN Background] Card broadcasted to web', {
                        deckId: card.deckId,
                        noteTypeId: card.noteTypeId,
                        requestId,
                        senderTabId,
                    });

                    sendResponse({ success: true, card, requestId, senderTabId });
                })
                .catch((error) => {
                    console.error('[LN Background] Internal create-card failed', error);
                    sendResponse({ success: false, error: error?.message || 'Unknown error' });
                });

            return true;
        }

        if (message && message.type === 'METHEUS_UPDATE_STATS') {
            console.log('[LN Background] Received stats update via Bridge', message.stats);
            const syncService = getMetheusSyncService(settings);
            syncService.updateStats(message.stats);
            return; // Don't keep port open for this one
        }

        // MOCHILA: Receive config (decks, noteTypes) from Web App via Bridge
        if (message && message.type === 'METHEUS_UPDATE_CONFIG') {
            const config = message.config || {};
            console.log('[LN Background] Received config update via Bridge', config);
            const syncService = getMetheusSyncService(settings);

            syncService
                .updateConfig(config)
                .then(async () => {
                    const settingsUpdates: Record<string, string> = {};
                    const currentDeckSetting = await settings.getSingle('metheusTargetDeckId');

                    if (typeof config.targetLanguage === 'string' && config.targetLanguage.length > 0) {
                        settingsUpdates.metheusTargetLanguage = config.targetLanguage;
                    }

                    if (typeof config.miningDeckId === 'string') {
                        const incomingDeckId = config.miningDeckId.trim();
                        const currentDeckId = typeof currentDeckSetting === 'string' ? currentDeckSetting.trim() : '';
                        const shouldKeepCurrentDeck =
                            (incomingDeckId === '' || incomingDeckId === 'default') &&
                            currentDeckId.length > 0 &&
                            currentDeckId !== 'default';

                        if (!shouldKeepCurrentDeck) {
                            settingsUpdates.metheusTargetDeckId = incomingDeckId;
                        }
                    }

                    if (typeof config.interfaceLanguage === 'string' && config.interfaceLanguage.length > 0) {
                        settingsUpdates.language = config.interfaceLanguage;
                    }

                    if (Object.keys(settingsUpdates).length > 0) {
                        await settings.set(settingsUpdates as any);
                    }

                    // Store auxiliary language metadata for future use
                    await browser.storage.local.set({
                        ln_cached_native_language: config.nativeLanguage || '',
                        ln_cached_interface_language: config.interfaceLanguage || '',
                    });

                    // Notify extension UIs to refresh deck/noteType lists instantly
                    console.log('[LN Bridge] Config applied', {
                        decks: Array.isArray(config.decks) ? config.decks.length : 0,
                        noteTypes: Array.isArray(config.noteTypes) ? config.noteTypes.length : 0,
                        targetLanguage: config.targetLanguage,
                        miningDeckId: config.miningDeckId,
                    });
                    browser.runtime.sendMessage({ type: 'METHEUS_CONFIG_UPDATED' }).catch(() => undefined);

                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.error('[LN Background] Failed to apply config update', error);
                    sendResponse({ success: false, error: error?.message || 'Unknown error' });
                });

            return true;
        }

        // NEW: Handle Auth Push via Bridge Handshake
        if (message && message.type === 'METHEUS_AUTH_PUSH') {
            const ts = Date.now();
            const { apiKey, userId } = message;
            console.log(`[${ts}] [BG AUTH] Received Auth Push via Bridge. Key preview:`, apiKey?.substring(0, 8));
            console.log(`[${ts}] [BG AUTH] Message details:`, {
                apiKeyLength: apiKey?.length,
                userId,
                senderUrl: sender.url,
            });

            if (apiKey) {
                const url = sender.url ? new URL(sender.url).origin : 'https://metheus.app';
                const updates: any = {
                    metheusApiKey: apiKey,
                    metheusUserId: userId,
                    metheusEnabled: true,
                    metheusUrl: url,
                };

                console.log(`[${ts}] [BG AUTH] Calling settings.set() with updates:`, updates);
                settings
                    .set(updates)
                    .then(() => {
                        console.log(`[${ts}] [BG AUTH] ✅ Settings updated via bridge handshake`);
                        console.log(`[${ts}] [BG AUTH] Sending success response back to Bridge/Web`);
                        sendResponse({ success: true });
                    })
                    .catch((e) => {
                        console.error(`[${ts}] [BG AUTH] ❌ Error updating settings:`, e);
                        sendResponse({ success: false, error: e.message });
                    });

                console.log(`[${ts}] [BG AUTH] Returning true to keep port open`);
                return true; // Keep port open for async settings.set
            } else {
                console.log(`[${ts}] [BG AUTH] ❌ No apiKey in message`);
                sendResponse({ success: false, error: 'No apiKey' });
                return true;
            }
        }
    });

    const installListener = async (details: Browser.runtime.InstalledDetails) => {
        if (details.reason !== browser.runtime.OnInstalledReason.INSTALL) {
            return;
        }

        const defaultUiLanguage = browser.i18n.getUILanguage();
        const supportedLanguages = await fetchSupportedLanguages();

        if (supportedLanguages.includes(defaultUiLanguage)) {
            await settings.set({ language: defaultUiLanguage });
            primeLocalization(defaultUiLanguage);
        }

        if (isMobile) {
            // Set reasonable defaults for mobile
            await settings.set({
                streamingTakeScreenshot: false, // Kiwi Browser does not support captureVisibleTab
                subtitleSize: 18,
                subtitlePositionOffset: 25,
                topSubtitlePositionOffset: 25,
                subtitlesWidth: 100,
            });
        }

        browser.tabs.create({ url: 'https://metheus.app', active: true });
    };

    const updateListener = async (details: Browser.runtime.InstalledDetails) => {
        if (details.reason !== browser.runtime.OnInstalledReason.UPDATE) {
            return;
        }

        enqueueUpdateAlert();
    };

    browser.runtime.onInstalled.addListener(installListener);
    browser.runtime.onInstalled.addListener(updateListener);
    browser.runtime.onStartup.addListener(startListener);

    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') {
            return;
        }

        const watchedKeys = ['metheusTargetDeckId', 'metheusTargetLanguage', 'metheusNoteType', 'language'];
        const changed = watchedKeys.some((key) => key in changes);
        if (!changed) {
            return;
        }

        void (async () => {
            const syncService = getMetheusSyncService(settings);
            const cachedLanguageMeta = await browser.storage.local.get([
                'ln_cached_native_language',
                'ln_cached_interface_language',
            ]);

            const payload = {
                miningDeckId: changes.metheusTargetDeckId?.newValue,
                targetLanguage: changes.metheusTargetLanguage?.newValue,
                noteTypeId: changes.metheusNoteType?.newValue,
                interfaceLanguage:
                    changes.language?.newValue || cachedLanguageMeta?.ln_cached_interface_language || undefined,
                nativeLanguage: cachedLanguageMeta?.ln_cached_native_language || undefined,
            };

            await syncService.broadcastUpdate({ type: 'extension-settings-updated', settings: payload });
        })().catch((e) => console.error('[LN Background] Failed to broadcast extension settings update', e));
    });

    const tabRegistry = new TabRegistry(settings);
    const audioRecorder = new AudioRecorderService(
        tabRegistry,
        isFirefoxBuild ? new CaptureStreamAudioRecorder() : new OffscreenAudioRecorder()
    );
    const imageCapturer = new ImageCapturer(settings);
    const cardPublisher = new CardPublisher(settings);

    const handlers: CommandHandler[] = [
        new VideoHeartbeatHandler(tabRegistry),
        new RecordMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
        new RerecordMediaHandler(settings, audioRecorder, cardPublisher),
        new StartRecordingMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
        new StopRecordingMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
        new TakeScreenshotHandler(imageCapturer, cardPublisher),
        new ToggleSubtitlesHandler(settings, tabRegistry),
        new SyncHandler(tabRegistry),
        new HttpPostHandler(),
        new ToggleSidePanelHandler(tabRegistry),
        new OpenSidePanelHandler(),
        new OpenAsbplayerSettingsHandler(),
        new CopyToClipboardHandler(),
        new EncodeMp3Handler(),
        new VideoDisappearedHandler(tabRegistry),
        new RequestingActiveTabPermissionHandler(),
        new CopySubtitleHandler(tabRegistry),
        new LoadSubtitlesHandler(tabRegistry),
        new RequestSubtitlesHandler(),
        new RequestCurrentSubtitleHandler(),
        new RequestCopyHistoryHandler(),
        new SaveCopyHistoryHandler(settings),
        new DeleteCopyHistoryHandler(settings),
        new ClearCopyHistoryHandler(settings),
        new PublishCardHandler(cardPublisher),
        new BulkExportCancellationHandler(cardPublisher),
        new BulkExportStartedHandler(cardPublisher),
        new AckMessageHandler(tabRegistry),
        new AudioBase64Handler(audioRecorder),
        new UpdateMobileOverlayModelHandler(),
        new RefreshSettingsHandler(tabRegistry, settings),
        new VideoToAsbplayerCommandForwardingHandler(tabRegistry),
        new AsbplayerToVideoCommandForwardingHandler(),
        new AsbplayerHeartbeatHandler(tabRegistry),
        new AckTabsHandler(tabRegistry),
        new SettingsUpdatedHandler(tabRegistry, settings),
        new OpenExtensionShortcutsHandler(),
        new ExtensionCommandsHandler(),
        new PageConfigHandler(),
        new AsbplayerV2ToVideoCommandForwardingHandler(),
        new CaptureVisibleTabHandler(),
        new RequestModelHandler(),
        new CurrentTabHandler(),
        new MobileOverlayForwarderHandler(),
        new MetheusSaveCardHandler(),
        new DictionaryMessageHandler(settings),
        new MetheusTogglePopupHandler(),
        new MetheusShowPopupHandler(),
    ];

    // E-C4: Second onMessageExternal listener removed — all external message handling
    // is now in the unified listener above (see E-C4 FIX comment).

    browser.runtime.onMessage.addListener((request: Command<Message>, sender, sendResponse) => {
        const isHeartbeat = request.message?.command === 'heartbeat';
        const incomingSender = request?.sender;
        const incomingCommand = request?.message?.command;

        if (!incomingSender && !incomingCommand) {
            return false;
        }

        if (!isHeartbeat) {
            console.log('[Background] Message received:', {
                sender: incomingSender,
                command: incomingCommand,
            });
        }

        // NEW: Proactive Handshake Check
        // If we receive a message from our bridge/content script and we don't have an API key, ask for one.
        if (sender.url && (sender.url.includes('metheus.app') || sender.url.includes('localhost'))) {
            settings.getSingle('metheusApiKey').then((apiKey) => {
                if (!apiKey && sender.tab?.id) {
                    console.log('[Background] Missing API Key on supported origin. Requesting via bridge...');
                    browser.tabs.sendMessage(sender.tab.id, { type: 'METHEUS_AUTH_REQUEST' });
                }
            });
        }

        for (const handler of handlers) {
            const senderMatches =
                (typeof handler.sender === 'string' && handler.sender === request.sender) ||
                (typeof handler.sender === 'object' && handler.sender.includes(request.sender));

            const commandMatches = handler.command === null || handler.command === request.message?.command;

            if (request.message?.command === 'metheus-save-card') {
                console.log('[Background] Checking handler:', {
                    handlerName: handler.constructor.name,
                    handlerSender: handler.sender,
                    handlerCommand: handler.command,
                    senderMatches,
                    commandMatches,
                });
            }

            if (senderMatches) {
                if (commandMatches) {
                    if (!isHeartbeat) {
                        console.log('[Background] Handler matched:', handler.constructor.name);
                    }
                    if (handler.handle(request, sender, sendResponse) === true) {
                        return true;
                    }

                    break;
                }
            }
        }
    });

    browser.runtime.onInstalled.addListener(() => {
        browser.contextMenus?.create({
            id: 'load-subtitles',
            title: browser.i18n.getMessage('contextMenuLoadSubtitles'),
            contexts: ['page', 'video'],
        });

        browser.contextMenus?.create({
            id: 'mine-subtitle',
            title: browser.i18n.getMessage('contextMenuMineSubtitle'),
            contexts: ['page', 'video'],
        });
    });

    browser.contextMenus?.onClicked.addListener((info) => {
        if (info.menuItemId === 'load-subtitles') {
            const toggleVideoSelectCommand: ExtensionToVideoCommand<ToggleVideoSelectMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'toggle-video-select',
                },
            };
            tabRegistry.publishCommandToVideoElementTabs((tab): ExtensionToVideoCommand<Message> | undefined => {
                if (info.pageUrl !== tab.url) {
                    return undefined;
                }

                return toggleVideoSelectCommand;
            });
        } else if (info.menuItemId === 'mine-subtitle') {
            tabRegistry.publishCommandToVideoElements((videoElement): ExtensionToVideoCommand<Message> | undefined => {
                if (info.srcUrl !== undefined && videoElement.src !== info.srcUrl) {
                    return undefined;
                }

                if (info.srcUrl === undefined && info.pageUrl !== videoElement.tab.url) {
                    return undefined;
                }

                const copySubtitleCommand: ExtensionToVideoCommand<CopySubtitleMessage> = {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        command: 'copy-subtitle',
                        postMineAction: 1, // showAnkiDialog fallback
                    },
                    src: videoElement.src,
                };
                return copySubtitleCommand;
            });
        }
    });

    browser.commands?.onCommand.addListener((command) => {
        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const validAsbplayer = (asbplayer: Asbplayer) => {
                if (asbplayer.sidePanel) {
                    return false;
                }

                const tab = asbplayer.tab;

                if (tab && tabs.find((t) => t.id === tab.id) === undefined) {
                    return false;
                }

                return true;
            };

            switch (command) {
                case 'metheus-toggle-popup':
                    // Forward to the active tab; content script will render the popup.
                    if (tabs[0]?.id !== undefined) {
                        const msg: any = {
                            sender: 'asbplayer-extension-to-video',
                            message: { command: 'metheus-toggle-popup' },
                        };
                        browser.tabs.sendMessage(tabs[0].id, msg);
                    }
                    break;
                case 'copy-subtitle':
                case 'update-last-card':
                case 'export-card':
                case 'copy-subtitle-with-dialog':
                    const postMineAction = postMineActionFromCommand(command);
                    tabRegistry.publishCommandToVideoElements((videoElement) => {
                        if (tabs.find((t) => t.id === videoElement.tab.id) === undefined) {
                            return undefined;
                        }

                        const extensionToVideoCommand: ExtensionToVideoCommand<CopySubtitleMessage> = {
                            sender: 'asbplayer-extension-to-video',
                            message: {
                                command: 'copy-subtitle',
                                postMineAction: postMineAction,
                            },
                            src: videoElement.src,
                        };
                        return extensionToVideoCommand;
                    });

                    tabRegistry.publishCommandToAsbplayers({
                        commandFactory: (asbplayer) => {
                            if (!validAsbplayer(asbplayer)) {
                                return undefined;
                            }

                            const extensionToPlayerCommand: ExtensionToAsbPlayerCommand<CopySubtitleMessage> = {
                                sender: 'asbplayer-extension-to-player',
                                message: {
                                    command: 'copy-subtitle',
                                    postMineAction: postMineAction,
                                },
                                asbplayerId: asbplayer.id,
                            };
                            return extensionToPlayerCommand;
                        },
                    });
                    break;
                case 'toggle-video-select':
                    for (const tab of tabs) {
                        if (typeof tab.id !== 'undefined') {
                            const extensionToVideoCommand: ExtensionToVideoCommand<ToggleVideoSelectMessage> = {
                                sender: 'asbplayer-extension-to-video',
                                message: {
                                    command: 'toggle-video-select',
                                },
                            };
                            browser.tabs.sendMessage(tab.id, extensionToVideoCommand);
                        }
                    }
                    break;
                case 'take-screenshot':
                    tabRegistry.publishCommandToVideoElements((videoElement) => {
                        if (tabs.find((t) => t.id === videoElement.tab.id) === undefined) {
                            return undefined;
                        }

                        const extensionToVideoCommand: ExtensionToVideoCommand<TakeScreenshotMessage> = {
                            sender: 'asbplayer-extension-to-video',
                            message: {
                                command: 'take-screenshot',
                            },
                            src: videoElement.src,
                        };
                        return extensionToVideoCommand;
                    });

                    tabRegistry.publishCommandToAsbplayers({
                        commandFactory: (asbplayer) => {
                            if (!validAsbplayer(asbplayer)) {
                                return undefined;
                            }

                            const extensionToPlayerCommand: ExtensionToAsbPlayerCommand<TakeScreenshotMessage> = {
                                sender: 'asbplayer-extension-to-player',
                                message: {
                                    command: 'take-screenshot',
                                },
                                asbplayerId: asbplayer.id,
                            };
                            return extensionToPlayerCommand;
                        },
                    });
                    break;
                case 'toggle-recording':
                    tabRegistry.publishCommandToVideoElements((videoElement) => {
                        if (tabs.find((t) => t.id === videoElement.tab.id) === undefined) {
                            return undefined;
                        }

                        const extensionToVideoCommand: ExtensionToVideoCommand<ToggleRecordingMessage> = {
                            sender: 'asbplayer-extension-to-video',
                            message: {
                                command: 'toggle-recording',
                            },
                            src: videoElement.src,
                        };
                        return extensionToVideoCommand;
                    });
                    tabRegistry.publishCommandToAsbplayers({
                        commandFactory: (asbplayer) => {
                            if (!validAsbplayer(asbplayer)) {
                                return undefined;
                            }

                            const extensionToPlayerCommand: ExtensionToAsbPlayerCommand<ToggleRecordingMessage> = {
                                sender: 'asbplayer-extension-to-player',
                                message: {
                                    command: 'toggle-recording',
                                },
                                asbplayerId: asbplayer.id,
                            };
                            return extensionToPlayerCommand;
                        },
                    });
                    break;
                default:
                    throw new Error('Unknown command ' + command);
            }
        });
    });

    function postMineActionFromCommand(command: string) {
        switch (command) {
            case 'copy-subtitle':
                return 0; // none
            case 'copy-subtitle-with-dialog':
                return 1; // showAnkiDialog
            case 'update-last-card':
                return 2; // updateLastCard
            case 'export-card':
                return 3; // exportCard
            default:
                throw new Error('Cannot determine post mine action for unknown command ' + command);
        }
    }

    const updateWebSocketClientState = () => {
        settings.getSingle('webSocketClientEnabled').then((webSocketClientEnabled) => {
            if (webSocketClientEnabled) {
                bindWebSocketClient(settings, tabRegistry);
            } else {
                unbindWebSocketClient();
            }
        });
    };

    updateWebSocketClientState();
    tabRegistry.onAsbplayerInstance(updateWebSocketClientState);
    tabRegistry.onSyncedElement(updateWebSocketClientState);

    const action = browser.action || browser.browserAction;

    const defaultAction = (tab: Browser.tabs.Tab) => {
        if (isMobile) {
            if (tab.id !== undefined) {
                const extensionToVideoCommand: ExtensionToVideoCommand<ToggleVideoSelectMessage> = {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        command: 'toggle-video-select',
                    },
                };
                browser.tabs.sendMessage(tab.id, extensionToVideoCommand);
            }
        } else {
            action.openPopup();
        }
    };

    if (isFirefoxBuild) {
        let hasHostPermission = true;

        browser.permissions.contains({ origins: ['<all_urls>'] }, (result) => {
            hasHostPermission = result;

            if (hasHostPermission && !isMobile) {
                action.setPopup({
                    popup: 'popup-ui.html',
                });
            }
        });

        action.onClicked.addListener(async (tab) => {
            if (hasHostPermission) {
                defaultAction(tab);
            } else {
                try {
                    const obtainedHostPermission = await browser.permissions.request({ origins: ['<all_urls>'] });

                    if (obtainedHostPermission) {
                        hasHostPermission = true;
                        browser.runtime.reload();
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        });
    } else {
        if (!isMobile) {
            action.setPopup({
                popup: 'popup-ui.html',
            });
        }

        action.onClicked.addListener(defaultAction);
    }

    if (isFirefoxBuild) {
        // Firefox requires the use of iframe.srcdoc in order to load UI into an about:blank iframe
        // (which is required for UI to be scannable by other extensions like Yomitan).
        // However, such an iframe inherits the content security directives of the parent document,
        // which may prevent loading of extension scripts into the iframe.
        // Because of this, we modify CSP headers below to explicitly allow access to extension-packaged resources.
        browser.webRequest.onHeadersReceived.addListener(
            (details) => {
                const responseHeaders = details.responseHeaders;

                if (!responseHeaders) {
                    return;
                }

                for (const header of responseHeaders) {
                    if (header.name.toLowerCase() === 'content-security-policy') {
                        // E-C1 FIX: Must write modified value back to header.value
                        header.value += ` ; script-src moz-extension://${browser.runtime.id}`;
                    }
                }

                return { responseHeaders };
            },
            { urls: ['<all_urls>'] },
            ['blocking', 'responseHeaders']
        );
    }
});
