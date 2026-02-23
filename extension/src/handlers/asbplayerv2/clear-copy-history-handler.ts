import type { Command, Message } from '@metheus/common';
import { IndexedDBCopyHistoryRepository } from '@metheus/common/copy-history';
import { SettingsProvider } from '@metheus/common/settings';

export default class ClearCopyHistoryHandler {
    private readonly _settings: SettingsProvider;
    constructor(settings: SettingsProvider) {
        this._settings = settings;
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'clear-copy-history';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (r?: any) => void) {
        this._settings
            .getSingle('miningHistoryStorageLimit')
            .then((limit) => new IndexedDBCopyHistoryRepository(limit))
            .then((copyHistoryRepository) => {
                copyHistoryRepository.clear().then(() => {
                    sendResponse({});
                });
            });

        return true;
    }
}
