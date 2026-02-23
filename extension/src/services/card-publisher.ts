import {
    CardExportedMessage,
    CardModel,
    CardSavedMessage,
    CardUpdatedMessage,
    ExtensionToVideoCommand,
    NotifyErrorMessage,
    PostMineAction,
} from '@metheus/common';
import { humanReadableTime } from '@metheus/common/util';
import { SettingsProvider } from '@metheus/common/settings';
import { v4 as uuidv4 } from 'uuid';
import { getMetheusSyncService } from '@/services/metheus-sync';

export class CardPublisher {
    private readonly _settingsProvider: SettingsProvider;
    bulkExportCancelled = false;

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
    }

    async publish(card: CardModel, postMineAction?: PostMineAction, tabId?: number, src?: string) {
        const id = uuidv4();
        const savePromise = this._saveCardToRepository(id, card);

        if (tabId === undefined || src === undefined) {
            return;
        }

        try {
            if (postMineAction == PostMineAction.showAnkiDialog) {
                console.log('Anki Dialog disabled');
            } else if (postMineAction == PostMineAction.updateLastCard) {
                await this._updateLastCard(card, src, tabId);
            } else if (postMineAction === PostMineAction.exportCard) {
                await this._exportCard(card, src, tabId);
            } else if (postMineAction === PostMineAction.none) {
                this._notifySaved(savePromise, card, src, tabId);
            }
        } catch (e) {
            this._notifyError(e, src, tabId);
            throw e;
        }
    }

    async publishBulk(card: CardModel, tabId?: number, src?: string) {
        const id = uuidv4();
        this._saveCardToRepository(id, card);

        if (tabId === undefined || src === undefined) {
            return;
        }

        if (this.bulkExportCancelled) {
            return;
        }

        await this._exportCardBulk(card, src, tabId);
    }

    private _notifySaved(savePromise: Promise<any>, card: CardModel, src: string, tabId: number) {
        savePromise.then((saved: boolean) => {
            if (saved) {
                const cardSavedCommand: ExtensionToVideoCommand<CardSavedMessage> = {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        ...card,
                        command: 'card-saved',
                        cardName: card.subtitle.text || humanReadableTime(card.mediaTimestamp),
                    },
                    src: src,
                };

                browser.tabs.sendMessage(tabId, cardSavedCommand);
            }
        });
    }

    /**
     * Export card via Mochila pattern: buffer in extension → broadcast to web app.
     * The web app absorbs the card into IDB → blob sync pushes to B2.
     * Zero API calls, zero Firebase ops.
     */
    private async _exportCard(card: CardModel, src: string | undefined, tabId: number) {
        const settings = await this._settingsProvider.get([
            'metheusEnabled',
            'metheusTargetDeckId',
            'metheusTargetLanguage',
            'metheusNoteType',
        ]);
        const { metheusEnabled, metheusTargetDeckId, metheusTargetLanguage, metheusNoteType } = settings;

        if (!metheusEnabled) {
            throw new Error('Metheus integration is disabled. Enable it in extension settings.');
        }

        try {
            console.log('[CardPublisher] Exporting card via mochila:', card.subtitle?.text);

            const syncService = getMetheusSyncService(this._settingsProvider);

            const custom = card.customFieldValues || {};
            const pickCustom = (keys: string[]) => {
                for (const key of keys) {
                    const value = custom[key];
                    if (typeof value === 'string' && value.trim().length > 0) {
                        return value.trim();
                    }
                }
                return '';
            };

            const sourceUrl = card.url || '';
            const imageDataUrl = card.image?.base64
                ? `data:image/${card.image.extension};base64,${card.image.base64}`
                : '';
            const audioDataUrl = card.audio?.base64
                ? `data:audio/${card.audio.extension};base64,${card.audio.base64}`
                : '';
            const audioBase64Length = card.audio?.base64?.length || 0;
            const imageBase64Length = card.image?.base64?.length || 0;
            const requestId = pickCustom(['__ln_requestId', 'requestId', 'RequestId']);
            const details = pickCustom(['Details', 'details', 'DETAILS']);
            const customImageUrl = pickCustom(['Image URL', 'imageUrl', 'screenshotUrl']);

            if (audioBase64Length > 0 && audioBase64Length < 1024) {
                console.warn('[CardPublisher] Legacy audio payload is too small; dropping contextAudioUrl', {
                    audioBase64Length,
                    requestId,
                });
            }

            console.log('[CardPublisher] Legacy media payload diagnostics', {
                requestId,
                audioBase64Length,
                imageBase64Length,
                hasCustomImageUrl: customImageUrl.length > 0,
            });

            // Broadcast card data through mochila → bridge → web app
            await syncService.broadcastUpdate({
                type: 'card-created',
                requestId: requestId || undefined,
                senderTabId: tabId,
                card: {
                    fields: {
                        front: card.word || card.subtitle?.text || '',
                        back: card.definition || '',
                        sentence: card.text || card.subtitle?.text || '',
                        source: sourceUrl,
                        url: sourceUrl,
                        phonetic: pickCustom(['Phonetic', 'phonetic', 'IPA']),
                        wordTranslation: pickCustom(['Translation', 'wordTranslation', 'Word Translation']),
                        definitionTranslation: pickCustom([
                            'Definition Translation',
                            'definitionTranslation',
                            'Back Translation',
                        ]),
                        contextTranslation: pickCustom([
                            'Context Translation',
                            'Sentence Translation',
                            'contextTranslation',
                        ]),
                        details,
                        imageUrl: imageDataUrl || customImageUrl,
                        contextAudioUrl: audioBase64Length >= 1024 ? audioDataUrl : '',
                    },
                    deckId: metheusTargetDeckId || 'default',
                    noteTypeId: metheusNoteType || 'STANDARD',
                    targetLanguage: metheusTargetLanguage || 'en',
                    createdAt: Date.now(),
                },
            });

            // Update stats
            syncService.incrementDailyMinedCount();

            const cardName = card.subtitle.text || 'Card';
            const cardExportedCommand: ExtensionToVideoCommand<CardExportedMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    ...card,
                    command: 'card-exported',
                    cardName: `${cardName}`,
                },
                src,
            };

            browser.tabs.sendMessage(tabId, cardExportedCommand);
        } catch (e) {
            console.error('[CardPublisher] Mochila export failed:', e);
            throw e;
        }
    }

    /**
     * Bulk export via Mochila — same as single export but for batch operations.
     */
    private async _exportCardBulk(card: CardModel, src: string | undefined, tabId: number) {
        const settings = await this._settingsProvider.get([
            'metheusTargetDeckId',
            'metheusTargetLanguage',
            'metheusNoteType',
        ]);
        const { metheusTargetDeckId, metheusTargetLanguage, metheusNoteType } = settings;

        try {
            const syncService = getMetheusSyncService(this._settingsProvider);

            const custom = card.customFieldValues || {};
            const pickCustom = (keys: string[]) => {
                for (const key of keys) {
                    const value = custom[key];
                    if (typeof value === 'string' && value.trim().length > 0) {
                        return value.trim();
                    }
                }
                return '';
            };

            const sourceUrl = card.url || '';
            const imageDataUrl = card.image?.base64
                ? `data:image/${card.image.extension};base64,${card.image.base64}`
                : '';
            const audioDataUrl = card.audio?.base64
                ? `data:audio/${card.audio.extension};base64,${card.audio.base64}`
                : '';
            const audioBase64Length = card.audio?.base64?.length || 0;
            const imageBase64Length = card.image?.base64?.length || 0;
            const requestId = pickCustom(['__ln_requestId', 'requestId', 'RequestId']);
            const details = pickCustom(['Details', 'details', 'DETAILS']);
            const customImageUrl = pickCustom(['Image URL', 'imageUrl', 'screenshotUrl']);

            if (audioBase64Length > 0 && audioBase64Length < 1024) {
                console.warn('[CardPublisher] Legacy bulk audio payload is too small; dropping contextAudioUrl', {
                    audioBase64Length,
                    requestId,
                });
            }

            console.log('[CardPublisher] Legacy bulk media payload diagnostics', {
                requestId,
                audioBase64Length,
                imageBase64Length,
                hasCustomImageUrl: customImageUrl.length > 0,
            });

            await syncService.broadcastUpdate({
                type: 'card-created',
                requestId: requestId || undefined,
                senderTabId: tabId,
                card: {
                    fields: {
                        front: card.word || card.subtitle?.text || '',
                        back: card.definition || '',
                        sentence: card.text || card.subtitle?.text || '',
                        source: sourceUrl,
                        url: sourceUrl,
                        phonetic: pickCustom(['Phonetic', 'phonetic', 'IPA']),
                        wordTranslation: pickCustom(['Translation', 'wordTranslation', 'Word Translation']),
                        definitionTranslation: pickCustom([
                            'Definition Translation',
                            'definitionTranslation',
                            'Back Translation',
                        ]),
                        contextTranslation: pickCustom([
                            'Context Translation',
                            'Sentence Translation',
                            'contextTranslation',
                        ]),
                        details,
                        imageUrl: imageDataUrl || customImageUrl,
                        contextAudioUrl: audioBase64Length >= 1024 ? audioDataUrl : '',
                    },
                    deckId: metheusTargetDeckId || 'default',
                    noteTypeId: metheusNoteType || 'STANDARD',
                    targetLanguage: metheusTargetLanguage || 'en',
                    createdAt: Date.now(),
                },
            });

            syncService.incrementDailyMinedCount();

            const cardName: string = card.subtitle.text || 'Card';
            const cardExportedCommand: ExtensionToVideoCommand<CardExportedMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    ...card,
                    command: 'card-exported',
                    cardName: `${cardName}`,
                    isBulkExport: true,
                },
                src,
            };

            browser.tabs.sendMessage(tabId, cardExportedCommand);
        } catch (e) {
            console.error('[CardPublisher] Bulk mochila export failed:', e);
            throw e;
        }
    }

    private async _updateLastCard(card: CardModel, src: string | undefined, tabId: number) {
        console.warn('Update Last Card not yet implemented for Metheus');
        throw new Error('Update Last Card not supported yet.');
    }

    private async _saveCardToRepository(id: string, card: CardModel): Promise<boolean> {
        return true;
    }

    private _notifyError(e: any, src: string, tabId: number) {
        console.error(e);
        const errorString = e instanceof Error ? e.message : String(e);
        const notifyErrorMessage: ExtensionToVideoCommand<NotifyErrorMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'notify-error',
                message: errorString,
            },
            src: src,
        };
        browser.tabs.sendMessage(tabId, notifyErrorMessage);
    }
}
