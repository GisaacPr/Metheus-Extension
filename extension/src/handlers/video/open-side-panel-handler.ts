import { Command, Message } from '@metheus/common';

/**
 * Handler that ONLY opens the side panel, never closes it.
 * Used by SmartHudPill buttons so they don't accidentally close the panel.
 */
export default class OpenSidePanelHandler {
    get sender() {
        return ['asbplayer-video-tab', 'asbplayerv2'];
    }

    get command() {
        return 'open-side-panel';
    }

    handle(_command: Command<Message>, _sender: Browser.runtime.MessageSender) {
        // Always open, never close
        browser.windows
            // @ts-ignore
            .getLastFocused((window) => browser.sidePanel.open({ windowId: window.id }));

        return false;
    }
}
