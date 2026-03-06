const translationCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<{ translated: string | null; provider: string }>>();

const extractGtxTranslatedText = (payload: any): string | null => {
    const chunks = payload?.[0];
    if (!Array.isArray(chunks)) {
        return null;
    }

    const translated = chunks
        .map((chunk: any) => (Array.isArray(chunk) ? chunk[0] : null))
        .filter((part: any) => typeof part === 'string' && part.length > 0)
        .join('');

    return translated || null;
};

export const translateViaGtx = async (text: string, sourceLang: string, targetLang: string): Promise<string | null> => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
        sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            return null;
        }

        const payload: any = await response.json().catch(() => null);
        return extractGtxTranslatedText(payload);
    } catch {
        return null;
    }
};

export const translateWithBrowserApi = async (text: string, targetLang: string): Promise<string | null> => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const anyWindow = window as any;
        const translatorFactory = anyWindow?.ai?.translator || anyWindow?.ai?.translation;

        if (translatorFactory?.createTranslator) {
            const translator = await translatorFactory.createTranslator({ targetLanguage: targetLang });
            const out = await translator.translate(text);
            return typeof out === 'string' ? out : null;
        }

        if (anyWindow?.navigator?.translation?.translate) {
            const out = await anyWindow.navigator.translation.translate(text, { to: targetLang });
            return typeof out === 'string' ? out : null;
        }

        return null;
    } catch {
        return null;
    }
};

export const resolveIdentityTranslation = (text: string, sourceLang: string, targetLang: string): string | null => {
    const normalizedText = text.trim();
    const normalizedSource = (sourceLang || 'auto').trim().toLowerCase();
    const normalizedTarget = (targetLang || '').trim().toLowerCase();

    if (!normalizedText || !normalizedTarget) {
        return null;
    }

    if (normalizedSource !== 'auto' && normalizedSource === normalizedTarget) {
        return normalizedText;
    }

    return null;
};

export const translateWithExtensionProviders = async (
    text: string,
    targetLang: string,
    sourceLang: string = 'auto'
): Promise<{ translated: string | null; provider: string }> => {
    const normalizedText = text.trim();
    const normalizedSource = sourceLang || 'auto';

    if (!normalizedText) {
        return { translated: null, provider: 'none' };
    }

    const identity = resolveIdentityTranslation(normalizedText, normalizedSource, targetLang);
    if (identity) {
        return { translated: identity, provider: 'identity' };
    }

    const cacheKey = `${normalizedSource}:${targetLang}:${normalizedText}`;
    const cached = translationCache.get(cacheKey);
    if (cached) {
        return { translated: cached, provider: 'cache' };
    }

    const pending = pendingRequests.get(cacheKey);
    if (pending) {
        return pending;
    }

    const requestPromise = (async () => {
        const local = await translateWithBrowserApi(normalizedText, targetLang);
        if (local) {
            translationCache.set(cacheKey, local);
            return { translated: local, provider: 'browser-native' };
        }

        const directGtx = await translateViaGtx(normalizedText, normalizedSource, targetLang);
        if (directGtx) {
            translationCache.set(cacheKey, directGtx);
            return { translated: directGtx, provider: 'gtx-direct' };
        }

        return { translated: null, provider: 'none' };
    })();

    pendingRequests.set(cacheKey, requestPromise);

    try {
        return await requestPromise;
    } finally {
        pendingRequests.delete(cacheKey);
    }
};

export const clearBrowserTranslationCache = () => {
    translationCache.clear();
};
