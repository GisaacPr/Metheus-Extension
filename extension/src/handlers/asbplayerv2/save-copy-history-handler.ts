import type { Command, Message, SaveCopyHistoryMessage } from '@metheus/common';
import { IndexedDBCopyHistoryRepository } from '@metheus/common/copy-history';
import { SettingsProvider } from '@metheus/common/settings';

export default class SaveCopyHistoryHandler {
    private readonly _settings: SettingsProvider;
    constructor(settings: SettingsProvider) {
        this._settings = settings;
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'save-copy-history';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (r?: any) => void) {
        const message = command.message as SaveCopyHistoryMessage;

        this._settings
            .getSingle('miningHistoryStorageLimit')
            .then((limit) => new IndexedDBCopyHistoryRepository(limit))
            .then((copyHistoryRepository) => {
                return Promise.all(
                    message.copyHistoryItems.map((copyHistoryItem) => copyHistoryRepository.save(copyHistoryItem))
                ).then(() => {
                    sendResponse({});
                });
            });

        return true;
    }
}
