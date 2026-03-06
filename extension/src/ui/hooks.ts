import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../services/extension-settings-storage';
import { translateWithExtensionProviders } from '../services/browser-translation';

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
    return {
        translateText: async (text: string, targetLang: string, sourceLang?: string) => {
            const result = await translateWithExtensionProviders(text, targetLang, sourceLang);
            return result.translated;
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
