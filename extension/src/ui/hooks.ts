import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../services/extension-settings-storage';

const translationCache = new Map<string, string>();

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

const translateViaGtx = async (text: string, sourceLang: string, targetLang: string): Promise<string | null> => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

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

// Minimal i18n fallback (extension still has full i18n elsewhere).
export const useTranslation = () => {
    const settingsProvider = useMemo(() => new SettingsProvider(new ExtensionSettingsStorage()), []);
    const [locale, setLocale] = useState<string>('en');

    const refreshLocale = useCallback(async () => {
        try {
            const settings = (await settingsProvider.getAll()) as Record<string, any>;

            const nextLocale =
                settings['ln_cached_native_language'] ||
                settings['language'] ||
                settings['ln_cached_interface_language'] ||
                'en';

            if (typeof nextLocale === 'string' && nextLocale.length > 0) {
                setLocale(nextLocale);
            }
        } catch {
            setLocale('en');
        }
    }, [settingsProvider]);

    useEffect(() => {
        refreshLocale();
    }, [refreshLocale]);

    useEffect(() => {
        const runtimeListener = (request: any) => {
            const command = request?.message?.command ?? request?.command;
            if (command === 'settings-updated' || command === 'METHEUS_CONFIG_UPDATED') {
                refreshLocale();
            }
        };

        const storageListener = (changes: any) => {
            const changed = Object.keys(changes || {});
            const localeKeyChanged = changed.some(
                (key) =>
                    key.includes('language') ||
                    key.includes('ln_cached_native_language') ||
                    key.includes('ln_cached_interface_language')
            );
            if (localeKeyChanged) {
                refreshLocale();
            }
        };

        browser.runtime.onMessage.addListener(runtimeListener);
        browser.storage.onChanged.addListener(storageListener);

        return () => {
            browser.runtime.onMessage.removeListener(runtimeListener);
            browser.storage.onChanged.removeListener(storageListener);
        };
    }, [refreshLocale]);

    return {
        t: (key: string, params?: any) => {
            const map: Record<string, string> = {
                'dictionary.popup.searching': 'Searching...',
                'dictionary.popup.no_def_title': 'Word not found',
                'dictionary.popup.no_def_desc': "We couldn't find a definition for this word.",
                'dictionary.popup.status.new': 'New',
                'dictionary.popup.status.learning': 'Learning',
                'dictionary.popup.status.known': 'Known',
                'dictionary.popup.saved': 'Saved',
                'dictionary.popup.save': 'Save',
                'dictionary.popup.tabs.definitions': 'Definitions',
                'dictionary.popup.tabs.examples': 'Examples',
                'dictionary.popup.tabs.details': 'Details',
            };
            if (key === 'dictionary.popup.no_def_desc' && params?.word) {
                return `We couldn't find a definition for "${params.word}".`;
            }
            return map[key] || key;
        },
        locale,
    };
};

export const useGoogleTranslation = () => {
    const pendingRequests = useRef<Map<string, Promise<string | null>>>(new Map());

    const translateWithBrowser = async (text: string, targetLang: string): Promise<string | null> => {
        // Local-first translation: use browser-native translation if available.
        // This avoids consuming LN proxy quota and spreads load per-user.
        try {
            const anyWindow = window as any;

            // Experimental Chrome AI Translator API (varies by version/flags)
            // https://developer.chrome.com/docs/ai/translate/
            // We support a couple of shapes seen in the wild.
            const translatorFactory = anyWindow?.ai?.translator || anyWindow?.ai?.translation;
            if (translatorFactory?.createTranslator) {
                const translator = await translatorFactory.createTranslator({ targetLanguage: targetLang });
                const out = await translator.translate(text);
                return typeof out === 'string' ? out : null;
            }

            // Some builds expose navigator.translation
            if (anyWindow?.navigator?.translation?.translate) {
                const out = await anyWindow.navigator.translation.translate(text, { to: targetLang });
                return typeof out === 'string' ? out : null;
            }

            return null;
        } catch {
            return null;
        }
    };

    return {
        translateText: async (text: string, targetLang: string, sourceLang?: string) => {
            const normalizedText = text.trim();
            if (!normalizedText) {
                return null;
            }

            const normalizedSource = sourceLang || 'auto';
            const cacheKey = `${normalizedSource}:${targetLang}:${normalizedText}`;

            if (translationCache.has(cacheKey)) {
                return translationCache.get(cacheKey)!;
            }

            if (pendingRequests.current.has(cacheKey)) {
                return pendingRequests.current.get(cacheKey)!;
            }

            const requestPromise = (async (): Promise<string | null> => {
                if (normalizedSource !== 'auto' && normalizedSource === targetLang) {
                    return normalizedText;
                }

                // 1) Try local browser translation
                const local = await translateWithBrowser(normalizedText, targetLang);
                if (local) {
                    translationCache.set(cacheKey, local);
                    return local;
                }

                // 2) Try direct GTX endpoint (user IP)
                const directGtx = await translateViaGtx(normalizedText, normalizedSource, targetLang);
                if (directGtx) {
                    translationCache.set(cacheKey, directGtx);
                    return directGtx;
                }

                return null;
            })();

            pendingRequests.current.set(cacheKey, requestPromise);

            try {
                return await requestPromise;
            } finally {
                pendingRequests.current.delete(cacheKey);
            }
        },
    };
};

export const usePreferences = () => {
    return {
        preferences: {
            miningDeckId: 'default',
        },
    };
};

// Professional TTS with system fallback
export const useTTS = (options: { language: string }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const stop = useCallback(() => {
        try {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
        } catch {
            // ignore
        }
        try {
            window.speechSynthesis.cancel();
        } catch {
            // ignore
        }
        setIsPlaying(false);
    }, []);

    useEffect(() => () => stop(), [stop]);

    const speakWithSystem = useCallback(
        async (text: string) => {
            setIsPlaying(true);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = options.language;
            utterance.onend = () => setIsPlaying(false);
            utterance.onerror = () => setIsPlaying(false);
            window.speechSynthesis.speak(utterance);
        },
        [options.language]
    );

    const speak = useCallback(
        async (text: string) => {
            stop();
            await speakWithSystem(text);
        },
        [speakWithSystem, stop]
    );

    return {
        speak,
        stop,
        state: { isPlaying },
    };
};
