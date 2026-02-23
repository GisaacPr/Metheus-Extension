/**
 * METHEUS SAVE CARD HANDLER
 *
 * Handles card creation requests from the content script
 * and forwards them via the Mochila (backpack) pattern.
 * Data flows: Extension → broadcastUpdate → Bridge → Web App → IDB → Blob Sync → B2
 * Zero API calls, zero Firebase ops.
 */

import { Command, Message } from '@metheus/common';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '@/services/extension-settings-storage';

interface MetheusSaveCardMessage extends Message {
    command: 'metheus-save-card';
    data: {
        word: string;
        sentence: string;
        definition?: string;
        language: string;
        deckId?: string;
        url?: string;
        timestamp?: number;
        noteTypeId?: string;
        phonetic?: string;
        wordTranslation?: string;
        definitionTranslation?: string;
        contextTranslation?: string;
        translations?: any;
        cefr?: string;
        frequency?: string;
        imageUrl?: string;
        audioUrl?: string;
    };
}

export default class MetheusSaveCardHandler {
    private settings: SettingsProvider;

    constructor() {
        this.settings = new SettingsProvider(new ExtensionSettingsStorage());
    }

    get sender() {
        return 'asbplayer-video';
    }

    get command() {
        return 'metheus-save-card';
    }

    handle(
        command: Command<Message>,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        console.log('[LN Handler] handle() called, command:', command.message.command);

        const message = command.message as MetheusSaveCardMessage;

        console.log('[LN Handler] Processing save-card request for word:', message.data?.word);

        this._saveCard(message.data)
            .then((result) => {
                console.log('[LN Handler] Sending response:', result);
                sendResponse(result);
            })
            .catch((error) => {
                console.error('[LN Handler] Caught error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Async response
    }

    private async _saveCard(data: MetheusSaveCardMessage['data']): Promise<{ success: boolean; error?: string }> {
        try {
            console.log('[LN Handler] _saveCard via mochila, word:', data.word);

            const settings = await this.settings.get(['metheusTargetDeckId', 'metheusNoteType']);

            const { metheusTargetDeckId, metheusNoteType } = settings;

            const { getMetheusSyncService } = await import('@/services/metheus-sync');
            const syncService = getMetheusSyncService(this.settings);

            const extractTranslation = (translations: any): string => {
                if (typeof translations === 'string') {
                    return translations;
                }

                if (Array.isArray(translations) && translations.length > 0) {
                    const first = translations[0];
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

            const sourceUrl = data.url || '';
            const wordTranslation = data.wordTranslation || extractTranslation(data.translations);

            // Broadcast card data through mochila → bridge → web app → IDB → blob sync
            await syncService.broadcastUpdate({
                type: 'card-created',
                card: {
                    fields: {
                        front: data.word,
                        back: data.definition || '',
                        sentence: data.sentence,
                        source: sourceUrl,
                        url: sourceUrl,
                        phonetic: data.phonetic || '',
                        wordTranslation,
                        definitionTranslation: data.definitionTranslation || '',
                        contextTranslation: data.contextTranslation || '',
                        cefr: data.cefr || '',
                        frequency: data.frequency || '',
                        imageUrl: data.imageUrl || '',
                        frontAudioUrl: data.audioUrl || '',
                    },
                    deckId: data.deckId || metheusTargetDeckId || 'default',
                    noteTypeId: data.noteTypeId || metheusNoteType || 'STANDARD',
                    targetLanguage: data.language || 'en',
                    createdAt: data.timestamp || Date.now(),
                },
            });

            // Update stats
            syncService.incrementDailyMinedCount();

            console.log('[LN Handler] Card sent via mochila successfully');

            return { success: true };
        } catch (error: any) {
            console.error('[LN Handler] Mochila save failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }
}
