import { currentPageDelegate } from '@/services/pages';
import type { ContentScriptContext } from '#imports';

const excludeGlobs = [
    '*://killergerbah.github.io/asbplayer*',
    '*://app.asbplayer.dev/*',
    '*://metheus.app/*',
    '*://www.metheus.app/*',
    'http://localhost/*',
    'https://localhost/*',
    'http://localhost:*/*',
    'https://localhost:*/*',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'http://127.0.0.1:*/*',
    'https://127.0.0.1:*/*',
];

if (import.meta.env.DEV) {
    excludeGlobs.push('*://localhost:3000/*');
}

export default defineContentScript({
    // Set manifest options
    matches: ['<all_urls>'],
    excludeGlobs,
    allFrames: true,
    runAt: 'document_start',

    main(ctx: ContentScriptContext) {
        const host = window.location.hostname.toLowerCase();
        const referrer = document.referrer.toLowerCase();
        const shouldDisableOnHost =
            host === 'metheus.app' || host === 'www.metheus.app' || host === 'localhost' || host === '127.0.0.1';
        const shouldDisableOnReferrer =
            referrer.includes('metheus.app') || referrer.includes('localhost') || referrer.includes('127.0.0.1');

        if (shouldDisableOnHost || shouldDisableOnReferrer) {
            return;
        }

        currentPageDelegate().then((pageDelegate) => pageDelegate?.loadScripts());
    },
});
