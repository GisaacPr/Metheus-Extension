import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import CssBaseline from '@mui/material/CssBaseline';
import { StyledEngineProvider } from '@mui/material/styles';
import SmartHudPill from '../../ui/SmartHudPill/SmartHudPill';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
import { getMetheusSyncService } from '../../services/metheus-sync';
import { createTheme } from '@metheus/common/theme';
import type { PaletteMode } from '@mui/material/styles';
import { useI18n } from '../../ui/hooks/use-i18n';
import { supportedLanguages } from '@metheus/common/settings';

const settings = new SettingsProvider(new ExtensionSettingsStorage());

import GlobalStyles from '@mui/material/GlobalStyles';

const resolveUiLanguage = (value?: string): string => {
    const browserUi = browser.i18n.getUILanguage();
    const raw = (value || browserUi || 'en').trim();
    const normalizedUnderscore = raw.replace('-', '_');
    const normalizedDash = raw.replace('_', '-');
    const base = raw.split(/[-_]/)[0];

    const candidates = [raw, normalizedUnderscore, normalizedDash, base, 'en'];
    for (const candidate of candidates) {
        if (candidate && supportedLanguages.includes(candidate)) {
            return candidate;
        }
    }

    return 'en';
};

// FORCE transparent background at all levels
const TransparentBackground = () => (
    <GlobalStyles
        styles={{
            ':root': { backgroundColor: 'transparent !important', background: 'transparent !important' },
            body: { backgroundColor: 'transparent !important' },
            html: { backgroundColor: 'transparent !important' },
            '#root': { backgroundColor: 'transparent !important' },
        }}
    />
);

const SmartHubPillContent: React.FC = () => {
    const theme = useMemo(() => createTheme('dark'), []);

    // Real Data State
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [knownWords, setKnownWords] = useState<number | undefined>(undefined);
    const [dailyMined, setDailyMined] = useState<number>(0);
    const [streak, setStreak] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Initialize i18n - get language first before rendering
    const [i18nLanguage, setI18nLanguage] = useState<string>('en');
    const [languageLoaded, setLanguageLoaded] = useState(false);
    const { initialized: i18nInitialized } = useI18n({ language: i18nLanguage });

    // Get initial language
    useEffect(() => {
        settings.get(['language', 'metheusTargetLanguage']).then(({ language, metheusTargetLanguage }) => {
            const finalUiLang = resolveUiLanguage(language);
            const finalTargetLang = metheusTargetLanguage || 'en';

            setI18nLanguage(finalUiLang);
            setTargetLanguage(finalTargetLang);
            setLanguageLoaded(true);
        });
    }, []);

    const refreshLinguaStats = useCallback(async () => {
        const { metheusTargetLanguage, language } = await settings.get(['metheusTargetLanguage', 'language']);
        const targetLang = metheusTargetLanguage || 'en';
        const uiLang = resolveUiLanguage(language);

        setTargetLanguage(targetLang);
        setI18nLanguage(uiLang);

        const syncService = getMetheusSyncService(settings);
        await syncService.waitForCache();

        const words = syncService.getKnownWordsForLanguage(targetLang);
        const knownCount = words.filter((w) => w.status >= 4).length;
        setKnownWords(knownCount);

        const stats = syncService.getStats();
        setStreak(stats.streak || 0);
        setDailyMined(stats.dailyGoalCurrent || 0);
        if (stats.totalKnownWords > 0) {
            setKnownWords(stats.totalKnownWords);
        }
    }, []);

    // Fetch vocabulary stats on mount
    useEffect(() => {
        void refreshLinguaStats();

        const storageListener = (changes: Record<string, any>, areaName: string) => {
            if (areaName !== 'local' && areaName !== 'session') return;
            const touched = Object.keys(changes || {});
            const hasRelevantChange = touched.some(
                (key) =>
                    key === 'ln_stats' ||
                    key === 'ln_vocabulary_cache' ||
                    key === 'ln_cached_target_language' ||
                    key.startsWith('ln_daily_mined_')
            );
            if (hasRelevantChange) void refreshLinguaStats();
        };

        const runtimeListener = (request: any) => {
            const command = request?.message?.command ?? request?.command;
            if (
                command === 'metheus-word-status-updated' ||
                command === 'settings-updated' ||
                command === 'METHEUS_CONFIG_UPDATED'
            ) {
                void refreshLinguaStats();
            }
        };

        browser.storage.onChanged.addListener(storageListener);
        browser.runtime.onMessage.addListener(runtimeListener);

        return () => {
            browser.storage.onChanged.removeListener(storageListener);
            browser.runtime.onMessage.removeListener(runtimeListener);
        };
    }, [refreshLinguaStats]);

    const handleOpenSidePanel = useCallback(() => {
        browser.runtime.sendMessage({
            sender: 'asbplayerv2',
            message: { command: 'toggle-side-panel' },
        });
    }, []);

    const handleHideOverlay = useCallback(() => {
        // Tell parent to hide the pill
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'hide-overlay' },
            },
            '*'
        );
    }, []);

    const handleToggleOverlay = useCallback(() => {
        // Tell parent to toggle colorize
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'toggle-colorize' },
            },
            '*'
        );
    }, []);

    const handleOpenSubtitleTracks = useCallback(() => {
        // Tell parent to open subtitle track selector
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'open-subtitle-tracks' },
            },
            '*'
        );
    }, []);

    const handleDragDelta = useCallback((deltaX: number) => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'pill-drag-delta', source: 'global', deltaX, deltaY: 0 },
            },
            '*'
        );
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.sender !== 'asbplayer-page-colorizer') {
                return;
            }

            if (event.data?.message?.command !== 'global-playback-state') {
                return;
            }

            setIsPlaying(Boolean(event.data?.message?.isPlaying));
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleDragEnd = useCallback(() => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'pill-drag-end', source: 'global' },
            },
            '*'
        );
    }, []);

    // Wait for language and i18n to be ready
    if (!languageLoaded || !i18nInitialized) {
        return null;
    }

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <TransparentBackground />
                <SmartHudPill
                    streak={streak}
                    dailyGoalCurrent={dailyMined}
                    dailyGoalTotal={20}
                    languageCode={targetLanguage}
                    knownWordsCount={knownWords}
                    onOpenSidePanel={handleOpenSidePanel}
                    onHideOverlay={handleHideOverlay}
                    onToggleOverlay={handleToggleOverlay}
                    onOpenSubtitleTracks={handleOpenSubtitleTracks}
                    onDragDelta={handleDragDelta}
                    onDragEnd={handleDragEnd}
                    isPlaying={isPlaying}
                />
            </ThemeProvider>
        </StyledEngineProvider>
    );
};

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(<SmartHubPillContent />);
}
