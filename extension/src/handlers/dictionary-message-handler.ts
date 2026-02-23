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

export default class DictionaryMessageHandler implements CommandHandler {
    sender = ['asbplayer-popup', 'asbplayer-video', 'asbplayer-iframe', 'metheus-client'];
    command = null; // Handle specific commands manually or filter in handle()

    private readonly settingsProvider: SettingsProvider;

    constructor(settingsProvider: SettingsProvider) {
        this.settingsProvider = settingsProvider;
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        const dictService = getMetheusDictionaryService(this.settingsProvider);

        if (command.message.command === 'dictionary-lookup') {
            const msg = command.message as DictionaryLookupMessage;
            dictService.lookup(msg.word, msg.language).then((result) => {
                sendResponse(result);
            });
            return true; // Async
        }

        if (command.message.command === 'dictionary-download') {
            const msg = command.message as DictionaryDownloadMessage;
            dictService
                .downloadLanguage(msg.language, (percent, status) => {
                    // Progress updates via direct message/port?
                    // For now, fire-and-forget or long-polling.
                    // Complex progress reporting might require Port connection or broadcast.
                    // We'll log to background console.
                    console.log(`[DictHandler] Download ${msg.language}: ${percent}% - ${status}`);
                })
                .then(() => {
                    sendResponse({ success: true });
                })
                .catch((e) => {
                    sendResponse({ success: false, error: e.toString() });
                });
            return true;
        }

        if (command.message.command === 'dictionary-get-status') {
            const msg = command.message as DictionaryGetStatusMessage;
            dictService.isLanguageDownloaded(msg.language).then((isDownloaded) => {
                sendResponse({ isDownloaded });
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
}
