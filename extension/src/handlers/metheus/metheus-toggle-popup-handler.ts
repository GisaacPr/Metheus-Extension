import type { CommandHandler } from '@/handlers/command-handler';
import type { Command, Message } from '@metheus/common';

/**
 * Handles a request to open the Metheus dictionary popup on the active tab.
 *
 * This is used for:
 *  - Side Panel -> open popup on the page
 *  - Global keyboard shortcut -> open popup on the page
 */
export default class MetheusTogglePopupHandler implements CommandHandler {
    sender = ['metheus-sidepanel', 'asbplayer-background'];
    command = 'metheus-toggle-popup';

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // If the request includes an explicit tabId (Side Panel knows which video tab it is synced to),
        // prefer it. Otherwise fallback to the active tab.
        const targetTabId = (command as any)?.tabId as number | undefined;

        const sendToTab = (tabId: number) => {
            const msg: any = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'metheus-toggle-popup',
                },
            };

            browser.tabs.sendMessage(tabId, msg).then(
                () => sendResponse({ success: true }),
                (err) => sendResponse({ success: false, reason: String(err) })
            );
        };

        if (targetTabId !== undefined) {
            sendToTab(targetTabId);
            return true;
        }

        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs?.[0];
            if (!tab?.id) {
                sendResponse({ success: false, reason: 'no-active-tab' });
                return;
            }
            sendToTab(tab.id);
        });

        return true;
    }
}
