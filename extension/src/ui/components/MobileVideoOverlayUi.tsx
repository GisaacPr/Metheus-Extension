import {
    AsbPlayerToVideoCommandV2,
    ControlType,
    CopySubtitleMessage,
    CurrentTimeToVideoMessage,
    HiddenMessage,
    LoadSubtitlesMessage,
    MobileOverlayToVideoCommand,
    OffsetToVideoMessage,
    PlaybackRateToVideoMessage,
    PlayMode,
    PlayModeMessage,
    ToggleSubtitlesMessage,
} from '@metheus/common';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import CssBaseline from '@mui/material/CssBaseline';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMobileVideoOverlayModel } from '../hooks/use-mobile-video-overlay-model';
import { useMobileVideoOverlayLocation } from '../hooks/use-mobile-video-overlay-location';
import { SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
// import MobileVideoOverlay from '@metheus/common/components/MobileVideoOverlay';
import SmartHudPill from '../SmartHudPill/SmartHudPill';
import { useI18n } from '../hooks/use-i18n';
import { isMobile } from '@metheus/common/device-detection/mobile';
import useLastScrollableControlType from '@metheus/common/hooks/use-last-scrollable-control-type';
import { createTheme } from '@metheus/common/theme';
import type { PaletteMode } from '@mui/material/styles';
import { StyledEngineProvider } from '@mui/material/styles';
import { useState } from 'react';
import { getMetheusSyncService } from '../../services/metheus-sync';

const settings = new SettingsProvider(new ExtensionSettingsStorage());
const params = new URLSearchParams(location.search);
const anchor = params.get('anchor') as 'top' | 'bottom';
const tooltipsEnabled = params.get('tooltips') === 'true';
const containerHeight = 48;
const scrollBufferHeight = 100;
const lastControlTypeKey = 'lastScrollableControlType';

const fetchLastControlType = async (): Promise<ControlType | undefined> => {
    const result = await browser.storage.local.get(lastControlTypeKey);
    return result ? result[lastControlTypeKey] : undefined;
};

const saveLastControlType = async (controlType: ControlType): Promise<void> => {
    await browser.storage.local.set({ [lastControlTypeKey]: controlType });
};

const MobileVideoOverlayUi = () => {
    const location = useMobileVideoOverlayLocation();
    const hiddenRef = useRef<boolean>(false);

    const handleMineSubtitle = useCallback(async () => {
        if (!location) {
            return;
        }

        const command: AsbPlayerToVideoCommandV2<CopySubtitleMessage> = {
            sender: 'asbplayerv2',
            message: {
                command: 'copy-subtitle',
                postMineAction: await settings.getSingle('clickToMineDefaultAction'),
            },
            tabId: location.tabId,
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleLoadSubtitles = useCallback(() => {
        if (!location) {
            return;
        }

        const command: AsbPlayerToVideoCommandV2<LoadSubtitlesMessage> = {
            sender: 'asbplayerv2',
            message: { command: 'load-subtitles' },
            tabId: location.tabId,
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleOffset = useCallback(
        (offset: number) => {
            if (!location) {
                return;
            }

            const command: AsbPlayerToVideoCommandV2<OffsetToVideoMessage> = {
                sender: 'asbplayerv2',
                message: { command: 'offset', value: offset, echo: true },
                tabId: location.tabId,
                src: location.src,
            };
            browser.runtime.sendMessage(command);
        },
        [location]
    );

    const handleSeek = useCallback(
        (timestampMs: number) => {
            if (!location) {
                return;
            }

            const command: AsbPlayerToVideoCommandV2<CurrentTimeToVideoMessage> = {
                sender: 'asbplayerv2',
                message: { command: 'currentTime', value: timestampMs / 1000 },
                tabId: location.tabId,
                src: location.src,
            };
            browser.runtime.sendMessage(command);
        },
        [location]
    );

    const handlePlaybackRate = useCallback(
        (playbackRate: number) => {
            if (!location) {
                return;
            }

            const command: AsbPlayerToVideoCommandV2<PlaybackRateToVideoMessage> = {
                sender: 'asbplayerv2',
                message: { command: 'playbackRate', value: playbackRate },
                tabId: location.tabId,
                src: location.src,
            };
            browser.runtime.sendMessage(command);
        },
        [location]
    );

    const model = useMobileVideoOverlayModel({ location });

    const handlePlayModeSelected = useCallback(
        (playMode: PlayMode) => {
            if (!location) {
                return;
            }

            const command: MobileOverlayToVideoCommand<PlayModeMessage> = {
                sender: 'asbplayer-mobile-overlay-to-video',
                message: {
                    command: 'playMode',
                    playMode,
                },
                src: location.src,
            };
            browser.runtime.sendMessage(command);
        },
        [location]
    );

    const handleToggleSubtitles = useCallback(() => {
        if (!location) {
            return;
        }

        const command: MobileOverlayToVideoCommand<ToggleSubtitlesMessage> = {
            sender: 'asbplayer-mobile-overlay-to-video',
            message: {
                command: 'toggle-subtitles',
            },
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleOpenSidePanel = useCallback(() => {
        browser.runtime.sendMessage({
            sender: 'asbplayerv2',
            message: { command: 'toggle-side-panel' },
        });
    }, []);

    const handleHideOverlay = useCallback(() => {
        if (!location) return;
        const command: MobileOverlayToVideoCommand<HiddenMessage> = {
            sender: 'asbplayer-mobile-overlay-to-video',
            message: { command: 'hidden', source: 'user-action' } as any,
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleToggleOverlay = useCallback(() => {
        if (!location) return;
        const command: MobileOverlayToVideoCommand<ToggleSubtitlesMessage> = {
            sender: 'asbplayer-mobile-overlay-to-video',
            message: {
                command: 'toggle-subtitles',
            },
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleOpenSubtitleTracks = useCallback(() => {
        if (!location) {
            return;
        }

        const command: AsbPlayerToVideoCommandV2<LoadSubtitlesMessage> = {
            sender: 'asbplayerv2',
            message: { command: 'load-subtitles' },
            tabId: location.tabId,
            src: location.src,
        };
        browser.runtime.sendMessage(command);
    }, [location]);

    const handleDragDelta = useCallback((deltaX: number) => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'pill-drag-delta', source: 'video', deltaX, deltaY: 0 },
            },
            '*'
        );
    }, []);

    const handleDragEnd = useCallback(() => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: { command: 'pill-drag-end', source: 'video' },
            },
            '*'
        );
    }, []);

    useEffect(() => {
        const scrollListener = () => {
            if (!location) {
                return;
            }
            /*
            // Disabled auto-hide on scroll to keep pill always active
            if (!hiddenRef.current) {
                if (
                    (anchor === 'top' && document.body.scrollTop >= containerHeight) ||
                    (anchor === 'bottom' && document.body.scrollTop <= scrollBufferHeight)
                ) {
                    const command: MobileOverlayToVideoCommand<HiddenMessage> = {
                        sender: 'asbplayer-mobile-overlay-to-video',
                        message: {
                            command: 'hidden',
                        },
                        src: location.src,
                    };
                    browser.runtime.sendMessage(command);
                    hiddenRef.current = true;
                }
            }
            */
        };

        document.body.addEventListener('scrollend', scrollListener);
        return () => document.body.removeEventListener('scrollend', scrollListener);
    }, [location]);

    useEffect(() => {
        // Depending on anchor, the mobile overlay will be at the bottom or top of the scrolling buffer
        // We need to make sure the iframe is scrolled to the right place so that the overlay shows
        if (anchor === 'top') {
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        } else {
            document.documentElement.scrollTop = document.documentElement.scrollHeight;
            document.body.scrollTop = document.body.scrollHeight;
        }
    }, []);

    const { initialized: i18nInitialized } = useI18n({ language: model?.language ?? 'en' });
    const { lastControlType, setLastControlType } = useLastScrollableControlType({
        isMobile,
        saveLastControlType,
        fetchLastControlType,
    });
    const theme = useMemo(() => createTheme((model?.themeType as PaletteMode) ?? 'dark'), [model?.themeType]);

    // Real Data State
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [knownWords, setKnownWords] = useState<number | undefined>(() => {
        const cached = localStorage.getItem('metheusKnownWords');
        return cached ? parseInt(cached, 10) : undefined;
    });
    const [dailyMined, setDailyMined] = useState<number>(0);
    const [streak, setStreak] = useState(0);

    const refreshLinguaStats = useCallback(async () => {
        const storedLang = await settings.getSingle('metheusTargetLanguage');
        const lang = storedLang || 'en';
        setTargetLanguage(lang);

        const syncService = getMetheusSyncService(settings);
        await syncService.waitForCache();

        const words = syncService.getKnownWordsForLanguage(lang);
        const knownCount = words.filter((w) => w.status >= 4).length;
        setKnownWords(knownCount);
        localStorage.setItem('metheusKnownWords', knownCount.toString());

        const stats = syncService.getStats();
        setStreak(stats.streak || 0);
        setDailyMined(stats.dailyGoalCurrent || 0);
        if (stats.totalKnownWords > 0) {
            setKnownWords(stats.totalKnownWords);
            localStorage.setItem('metheusKnownWords', stats.totalKnownWords.toString());
        }
    }, []);

    // Fetch vocabulary stats on mount
    useEffect(() => {
        void refreshLinguaStats();

        const storageListener = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
            if (areaName !== 'local' && areaName !== 'session') {
                return;
            }

            const touched = Object.keys(changes || {});
            const hasRelevantChange = touched.some(
                (key) =>
                    key === 'ln_stats' ||
                    key === 'ln_vocabulary_cache' ||
                    key === 'ln_cached_target_language' ||
                    key.startsWith('ln_daily_mined_')
            );

            if (hasRelevantChange) {
                void refreshLinguaStats();
            }
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

    useEffect(() => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: {
                    command: 'video-pill-track-state',
                    emptySubtitleTrack: model?.emptySubtitleTrack ?? true,
                },
            },
            '*'
        );
    }, [model?.emptySubtitleTrack]);

    // Get play/pause state for transparency effect
    const isPlaying = model ? !model.isPaused : false;

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {/* Pill always mounted, uses transparency when playing */}
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

export default MobileVideoOverlayUi;
