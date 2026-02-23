import { Message, Command, ExtensionToVideoCommand } from '@metheus/common';

export default class MetheusAuthHandler {
    constructor(private settings: any) {}

    get sender() {
        return 'metheus-web';
    }

    get command() {
        return 'METHEUS_AUTH_SUCCESS';
    }

    handle(request: any, sender: any, sendResponse: any) {
        if (request.type !== 'METHEUS_AUTH_SUCCESS') {
            return false;
        }

        const { apiKey, userId } = request;

        if (apiKey) {
            this.settings.set({ metheusApiKey: apiKey, metheusUserId: userId });
            sendResponse({ success: true });

            // Notify the user or update UI if needed
            // For now, we rely on the web app's success message
            return true;
        }

        return false;
    }
}
