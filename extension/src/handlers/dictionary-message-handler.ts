import { CommandHandler } from './command-handler';
import {
    Command,
    Message,
    DictionaryLookupMessage,
    DictionaryDownloadMessage,
    DictionaryGetStatusMessage,
    DictionaryOnlineEnrichMessage,
} from '@metheus/common';
import { getMetheusDictionaryService } from '../services/metheus-dictionary';
import { getOnlineDictionaryService } from '../services/online-dictionary';
import { SettingsProvider } from '@metheus/common/settings';

type DictionaryDownloadRuntimeState = {
    inProgress: boolean;
    queued: boolean;
    progress: number;
    status: string;
    updatedAt: number;
};

type DictionaryDownloadStatusResponse = {
    isDownloaded: boolean;
    isDownloading: boolean;
    progress: number;
    status: string;
};

const DOWNLOAD_STATES_STORAGE_KEY = 'metheusDictionaryDownloadStates_v2';
const DOWNLOAD_QUEUE_STORAGE_KEY = 'metheusDictionaryDownloadQueue_v2';

export default class DictionaryMessageHandler implements CommandHandler {
    sender = ['asbplayer-popup', 'asbplayer-video', 'asbplayer-iframe', 'metheus-client'];
    command = null; // Handle specific commands manually or filter in handle()

    private readonly settingsProvider: SettingsProvider;

    private static _downloadStates = new Map<string, DictionaryDownloadRuntimeState>();
    private static _downloadQueue: string[] = [];
    private static _queueRunning = false;
    private static _hydrated = false;
    private static _hydratePromise: Promise<void> | null = null;

    constructor(settingsProvider: SettingsProvider) {
        this.settingsProvider = settingsProvider;
        void this._ensureHydrated().then(() => this._runDownloadQueueIfNeeded());
    }

    handle(command: Command<Message>, _sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        const dictService = getMetheusDictionaryService(this.settingsProvider);

        if (command.message.command === 'dictionary-lookup') {
            const msg = command.message as DictionaryLookupMessage;
            dictService
                .lookup(msg.word, msg.language, undefined, {
                    skipBlockingOnline: !!(msg as any).skipBlockingOnline,
                })
                .then((result) => {
                    sendResponse(result);
                });
            return true; // Async
        }

        if (command.message.command === 'dictionary-download') {
            const msg = command.message as DictionaryDownloadMessage;
            void this._enqueueDownload(msg.language)
                .then((result) => {
                    sendResponse({ success: true, ...result });
                })
                .catch((e) => {
                    sendResponse({ success: false, error: e?.toString?.() || 'Queue error' });
                });
            return true;
        }

        if (command.message.command === 'dictionary-get-status') {
            const msg = command.message as DictionaryGetStatusMessage;
            void this._getLanguageStatus(msg.language)
                .then((status) => {
                    sendResponse(status);
                })
                .catch((e) => {
                    sendResponse({
                        isDownloaded: false,
                        isDownloading: false,
                        progress: 0,
                        status: e?.toString?.() || 'Status unavailable',
                    });
                });
            return true;
        }

        if (command.message.command === 'dictionary-delete') {
            const msg = command.message as any;
            void this._deleteLanguage(msg.language)
                .then(() => {
                    sendResponse({ success: true });
                })
                .catch((e) => {
                    sendResponse({ success: false, error: e?.toString?.() || 'Delete failed' });
                });
            return true;
        }

        if (command.message.command === 'dictionary-online-enrich') {
            const msg = command.message as DictionaryOnlineEnrichMessage;
            const onlineService = getOnlineDictionaryService();

            // If a specific provider is requested, use single-provider lookup (streaming mode)
            const lookupPromise = msg.provider
                ? onlineService.lookupSingleProvider(msg.word, msg.language, msg.provider)
                : onlineService.lookup(msg.word, msg.language);

            lookupPromise
                .then((result) => {
                    sendResponse({
                        entries: result.entries,
                        fromCache: result.fromCache,
                        sources: result.sources,
                    });
                })
                .catch((e) => {
                    console.error('[DictHandler] Online enrich failed:', e);
                    sendResponse({ entries: [], fromCache: false, sources: [] });
                });
            return true;
        }

        // Handle request for compatible provider names
        if (command.message.command === 'dictionary-online-providers') {
            const msg = command.message as any;
            const onlineService = getOnlineDictionaryService();
            const names = onlineService.getCompatibleProviderNames(msg.language || 'en');
            sendResponse({ providers: names });
            return true;
        }

        return false;
    }

    private _normalizeLanguage(language?: string): string {
        const fallback = 'en';
        if (typeof language !== 'string') {
            return fallback;
        }

        const normalized = language.trim().toLowerCase();
        return normalized.length > 0 ? normalized : fallback;
    }

    private _clampProgress(progress: number): number {
        return Math.max(0, Math.min(100, Math.round(progress)));
    }

    private async _ensureHydrated(): Promise<void> {
        if (DictionaryMessageHandler._hydrated) {
            return;
        }

        if (DictionaryMessageHandler._hydratePromise) {
            return DictionaryMessageHandler._hydratePromise;
        }

        DictionaryMessageHandler._hydratePromise = (async () => {
            const persisted = await browser.storage.local.get([
                DOWNLOAD_STATES_STORAGE_KEY,
                DOWNLOAD_QUEUE_STORAGE_KEY,
            ]);
            const persistedStates = persisted?.[DOWNLOAD_STATES_STORAGE_KEY] as
                | Record<string, Partial<DictionaryDownloadRuntimeState>>
                | undefined;
            const persistedQueue = persisted?.[DOWNLOAD_QUEUE_STORAGE_KEY] as string[] | undefined;

            DictionaryMessageHandler._downloadStates.clear();
            DictionaryMessageHandler._downloadQueue = [];

            if (persistedStates && typeof persistedStates === 'object') {
                for (const [rawLanguage, rawState] of Object.entries(persistedStates)) {
                    const language = this._normalizeLanguage(rawLanguage);
                    const state: DictionaryDownloadRuntimeState = {
                        inProgress: !!rawState?.inProgress,
                        queued: !!rawState?.queued,
                        progress: this._clampProgress(
                            typeof rawState?.progress === 'number'
                                ? rawState.progress
                                : rawState?.inProgress || rawState?.queued
                                  ? 1
                                  : 0
                        ),
                        status: typeof rawState?.status === 'string' ? rawState.status : 'Not downloaded',
                        updatedAt: typeof rawState?.updatedAt === 'number' ? rawState.updatedAt : Date.now(),
                    };

                    DictionaryMessageHandler._downloadStates.set(language, state);
                }
            }

            if (Array.isArray(persistedQueue)) {
                DictionaryMessageHandler._downloadQueue = persistedQueue
                    .map((language) => this._normalizeLanguage(language))
                    .filter((language, index, arr) => arr.indexOf(language) === index);
            }

            // Any download that was in progress must be resumed after SW restart.
            for (const [language, state] of DictionaryMessageHandler._downloadStates.entries()) {
                if (state.inProgress || state.queued) {
                    state.inProgress = false;
                    state.queued = true;
                    state.status =
                        state.progress > 0 ? `Resuming ${state.progress}%` : state.status || 'Queued for resume';

                    if (!DictionaryMessageHandler._downloadQueue.includes(language)) {
                        DictionaryMessageHandler._downloadQueue.push(language);
                    }
                }
            }

            this._refreshQueuedStatuses(false);
            await this._persistRuntimeState();
            DictionaryMessageHandler._hydrated = true;
        })().finally(() => {
            DictionaryMessageHandler._hydratePromise = null;
        });

        return DictionaryMessageHandler._hydratePromise;
    }

    private _refreshQueuedStatuses(emitBroadcast: boolean = true) {
        DictionaryMessageHandler._downloadQueue.forEach((language, index) => {
            const current = DictionaryMessageHandler._downloadStates.get(language) ?? {
                inProgress: false,
                queued: true,
                progress: 0,
                status: '',
                updatedAt: Date.now(),
            };
            const next: DictionaryDownloadRuntimeState = {
                ...current,
                inProgress: false,
                queued: true,
                status: `Queued (#${index + 1})`,
                updatedAt: Date.now(),
            };
            DictionaryMessageHandler._downloadStates.set(language, next);
            if (emitBroadcast) {
                this._broadcastDownloadState(language, false);
            }
        });
    }

    private async _persistRuntimeState(): Promise<void> {
        const serializableStates: Record<string, DictionaryDownloadRuntimeState> = {};
        for (const [language, state] of DictionaryMessageHandler._downloadStates.entries()) {
            serializableStates[language] = state;
        }

        await browser.storage.local.set({
            [DOWNLOAD_STATES_STORAGE_KEY]: serializableStates,
            [DOWNLOAD_QUEUE_STORAGE_KEY]: DictionaryMessageHandler._downloadQueue,
        });
    }

    private async _setRuntimeState(
        language: string,
        partial: Partial<DictionaryDownloadRuntimeState>,
        shouldBroadcast: boolean = true
    ): Promise<void> {
        const normalizedLanguage = this._normalizeLanguage(language);
        const current = DictionaryMessageHandler._downloadStates.get(normalizedLanguage) ?? {
            inProgress: false,
            queued: false,
            progress: 0,
            status: 'Not downloaded',
            updatedAt: Date.now(),
        };

        const next: DictionaryDownloadRuntimeState = {
            ...current,
            ...partial,
            progress: this._clampProgress(typeof partial.progress === 'number' ? partial.progress : current.progress),
            updatedAt: Date.now(),
        };

        DictionaryMessageHandler._downloadStates.set(normalizedLanguage, next);
        await this._persistRuntimeState();
        if (shouldBroadcast) {
            this._broadcastDownloadState(normalizedLanguage, false);
        }
    }

    private _broadcastDownloadState(language: string, isDownloaded: boolean) {
        const normalizedLanguage = this._normalizeLanguage(language);
        const state = DictionaryMessageHandler._downloadStates.get(normalizedLanguage);
        if (!state) {
            return;
        }

        const queueIndex = DictionaryMessageHandler._downloadQueue.indexOf(normalizedLanguage);
        const queueStatus = state.queued && queueIndex >= 0 ? `Queued (#${queueIndex + 1})` : state.status;
        const isDownloading = state.inProgress || state.queued;

        browser.runtime
            .sendMessage({
                type: 'METHEUS_DICTIONARY_DOWNLOAD_PROGRESS',
                language: normalizedLanguage,
                progress: state.progress,
                status: queueStatus,
                isDownloading,
                isDownloaded,
            })
            .catch(() => undefined);
    }

    private async _enqueueDownload(language: string): Promise<Record<string, boolean>> {
        const normalizedLanguage = this._normalizeLanguage(language);
        await this._ensureHydrated();

        const dictService = getMetheusDictionaryService(this.settingsProvider);
        const status = await dictService.getLanguageStatus(normalizedLanguage);
        if (status.isDownloaded) {
            await this._setRuntimeState(
                normalizedLanguage,
                {
                    inProgress: false,
                    queued: false,
                    progress: 100,
                    status: 'Complete',
                },
                true
            );
            this._broadcastDownloadState(normalizedLanguage, true);
            return { alreadyDownloaded: true };
        }

        const current = DictionaryMessageHandler._downloadStates.get(normalizedLanguage);
        if (current?.inProgress) {
            this._broadcastDownloadState(normalizedLanguage, false);
            return { alreadyRunning: true };
        }

        if (current?.queued || DictionaryMessageHandler._downloadQueue.includes(normalizedLanguage)) {
            this._refreshQueuedStatuses(true);
            await this._persistRuntimeState();
            return { alreadyQueued: true };
        }

        DictionaryMessageHandler._downloadQueue.push(normalizedLanguage);
        this._refreshQueuedStatuses(true);
        await this._persistRuntimeState();
        void this._runDownloadQueueIfNeeded();

        return { queued: true };
    }

    private async _runDownloadQueueIfNeeded(): Promise<void> {
        await this._ensureHydrated();
        if (DictionaryMessageHandler._queueRunning) {
            return;
        }

        DictionaryMessageHandler._queueRunning = true;
        const dictService = getMetheusDictionaryService(this.settingsProvider);

        try {
            while (DictionaryMessageHandler._downloadQueue.length > 0) {
                const language = DictionaryMessageHandler._downloadQueue.shift();
                if (!language) {
                    break;
                }

                this._refreshQueuedStatuses(true);
                await this._setRuntimeState(language, {
                    inProgress: true,
                    queued: false,
                    status: 'Starting...',
                });

                try {
                    await dictService.downloadLanguage(language, (percent, status) => {
                        void this._setRuntimeState(language, {
                            inProgress: true,
                            queued: false,
                            progress: this._clampProgress(percent),
                            status,
                        });
                    });

                    await this._setRuntimeState(language, {
                        inProgress: false,
                        queued: false,
                        progress: 100,
                        status: 'Complete',
                    });
                    this._broadcastDownloadState(language, true);
                } catch (e) {
                    const errorMessage = e?.toString?.() || 'Failed';
                    const current = DictionaryMessageHandler._downloadStates.get(language);
                    await this._setRuntimeState(language, {
                        inProgress: false,
                        queued: false,
                        progress: current?.progress ?? 0,
                        status: errorMessage,
                    });
                    this._broadcastDownloadState(language, false);
                }
            }
        } finally {
            DictionaryMessageHandler._queueRunning = false;
            this._refreshQueuedStatuses(true);
            await this._persistRuntimeState();
        }
    }

    private async _getLanguageStatus(language: string): Promise<DictionaryDownloadStatusResponse> {
        const normalizedLanguage = this._normalizeLanguage(language);
        await this._ensureHydrated();

        const dictService = getMetheusDictionaryService(this.settingsProvider);
        const persistedStatus = await dictService.getLanguageStatus(normalizedLanguage);
        const runtimeState = DictionaryMessageHandler._downloadStates.get(normalizedLanguage);
        const queueIndex = DictionaryMessageHandler._downloadQueue.indexOf(normalizedLanguage);

        const runtimeIsDownloading = !!runtimeState && (runtimeState.inProgress || runtimeState.queued);
        const isDownloading = runtimeIsDownloading || persistedStatus.isDownloading;
        const isDownloaded = persistedStatus.isDownloaded;

        const progress = isDownloading
            ? runtimeState
                ? runtimeState.progress
                : persistedStatus.progress
            : isDownloaded
              ? 100
              : Math.max(runtimeState?.progress ?? 0, persistedStatus.progress ?? 0);

        let status = runtimeState?.status || persistedStatus.status || 'Not downloaded';
        if (runtimeState?.queued && queueIndex >= 0) {
            status = `Queued (#${queueIndex + 1})`;
        }
        if (isDownloaded && !isDownloading) {
            status = 'Complete';
        }

        return {
            isDownloaded,
            isDownloading,
            progress: this._clampProgress(progress),
            status,
        };
    }

    private async _deleteLanguage(language: string): Promise<void> {
        const normalizedLanguage = this._normalizeLanguage(language);
        await this._ensureHydrated();

        const activeState = DictionaryMessageHandler._downloadStates.get(normalizedLanguage);
        if (activeState?.inProgress) {
            throw new Error('Cannot delete a dictionary while it is downloading');
        }

        DictionaryMessageHandler._downloadQueue = DictionaryMessageHandler._downloadQueue.filter(
            (queuedLanguage) => queuedLanguage !== normalizedLanguage
        );
        this._refreshQueuedStatuses(true);

        const dictService = getMetheusDictionaryService(this.settingsProvider);
        await dictService.deleteLanguage(normalizedLanguage);

        DictionaryMessageHandler._downloadStates.delete(normalizedLanguage);
        await this._persistRuntimeState();

        browser.runtime
            .sendMessage({
                type: 'METHEUS_DICTIONARY_DOWNLOAD_PROGRESS',
                language: normalizedLanguage,
                progress: 0,
                status: 'Deleted',
                isDownloading: false,
                isDownloaded: false,
            })
            .catch(() => undefined);
    }
}
