import type { CommandHandler } from '@/handlers/command-handler';
import type { Command, Message } from '@metheus/common';

/**
 * Side Panel -> open Metheus popup on the PAGE (video tab), anchored next to the side panel.
 *
 * Expected payload:
 *  {
 *    sender: 'metheus-sidepanel',
 *    message: { command: 'metheus-show-popup', tabId, word, sentence, position?: { y }, subtitleLanguage? }
 *  }
 */
export default class MetheusShowPopupHandler implements CommandHandler {
    sender = 'metheus-sidepanel';
    command = 'metheus-show-popup';

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        const tabId = (command as any)?.message?.tabId as number | undefined;

        if (typeof tabId !== 'number') {
            sendResponse({ success: false, reason: 'missing-tabId' });
            return;
        }

        const msg: any = {
            sender: 'asbplayer-extension-to-video',
            message: (command as any).message,
        };

        console.log('[Metheus][Background] show-popup forward -> tab', {
            tabId,
            word: (command as any)?.message?.word,
        });

        browser.tabs.sendMessage(tabId, msg).then(
            () => {
                console.log('[Metheus][Background] show-popup forwarded OK', { tabId });
                sendResponse({ success: true });
            },
            (err) => {
                console.error('[Metheus][Background] show-popup forward FAILED', { tabId, err });
                sendResponse({ success: false, reason: String(err) });
            }
        );

        return true;
    }
}
