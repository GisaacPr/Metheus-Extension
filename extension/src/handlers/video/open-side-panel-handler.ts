import { Command, Message } from '@metheus/common';
import { openChromeSidePanel } from '../../services/open-side-panel';

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
        void openChromeSidePanel().catch((error) => {
            console.error('[LN Background] Failed to open side panel', error);
        });

        return false;
    }
}
