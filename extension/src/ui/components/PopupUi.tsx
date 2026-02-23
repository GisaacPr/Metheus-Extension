import { useCallback, useEffect, useMemo, useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import {
    ExtensionToVideoCommand,
    GrantedActiveTabPermissionMessage,
    PopupToExtensionCommand,
    RequestSubtitlesMessage,
    RequestSubtitlesResponse,
    SettingsUpdatedMessage,
} from '@metheus/common';
import { createTheme } from '@metheus/common/theme';
import { AsbplayerSettings, SettingsProvider } from '@metheus/common/settings';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
import Popup from './Popup';
import { useRequestingActiveTabPermission } from '../hooks/use-requesting-active-tab-permission';
import { isMobile } from 'react-device-detect';
import { useSettingsProfileContext } from '@metheus/common/hooks/use-settings-profile-context';
import { StyledEngineProvider } from '@mui/material/styles';

interface Props {
    commands: any;
}

interface YoutubeTransferCandidate {
    youtubeUrl: string;
    subtitlesSrt: string;
}

interface TabRegistryVideoElement {
    src: string;
    tab?: {
        id?: number;
    };
    synced?: boolean;
    syncedTimestamp?: number;
    loadedSubtitles?: boolean;
}

const webBaseUrl = async () => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200);
        await fetch('http://localhost:3000', {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors',
        });
        clearTimeout(timeoutId);
        return 'http://localhost:3000';
    } catch (e) {
        return 'https://metheus.app';
    }
};

const isYoutubeUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        return host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com';
    } catch {
        return false;
    }
};

const pad2 = (value: number) => String(value).padStart(2, '0');
const pad3 = (value: number) => String(value).padStart(3, '0');

const msToSrtTimestamp = (ms: number) => {
    const safeMs = Math.max(0, Math.floor(ms));
    const hours = Math.floor(safeMs / 3600000);
    const minutes = Math.floor((safeMs % 3600000) / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const millis = safeMs % 1000;
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
};

const subtitlesToSrt = (subtitles: any[]) =>
    subtitles
        .map((subtitle, index) => {
            const text = String(subtitle?.text ?? '')
                .replace(/<[^>]*>/g, '')
                .trim();
            return `${index + 1}\n${msToSrtTimestamp(subtitle?.start ?? 0)} --> ${msToSrtTimestamp(subtitle?.end ?? 0)}\n${text}`;
        })
        .join('\n\n');

const trackOneSubtitles = (subtitles: any[]) => {
    if (!subtitles || subtitles.length === 0) {
        return [];
    }

    const explicitTrackOne = subtitles.filter((subtitle) => Number(subtitle?.track) === 0);
    if (explicitTrackOne.length > 0) {
        return explicitTrackOne;
    }

    const numericTracks = subtitles
        .map((subtitle) => Number(subtitle?.track))
        .filter((track) => Number.isFinite(track))
        .sort((a, b) => a - b);
    const firstTrack = numericTracks.length > 0 ? numericTracks[0] : undefined;

    if (firstTrack === undefined) {
        return subtitles;
    }

    const firstTrackSubtitles = subtitles.filter((subtitle) => Number(subtitle?.track) === firstTrack);
    return firstTrackSubtitles.length > 0 ? firstTrackSubtitles : subtitles;
};

const notifySettingsUpdated = () => {
    const settingsUpdatedCommand: PopupToExtensionCommand<SettingsUpdatedMessage> = {
        sender: 'asbplayer-popup',
        message: {
            command: 'settings-updated',
        },
    };
    browser.runtime.sendMessage(settingsUpdatedCommand);
};

export function PopupUi({ commands }: Props) {
    const settingsProvider = useMemo(() => new SettingsProvider(new ExtensionSettingsStorage()), []);
    const [settings, setSettings] = useState<AsbplayerSettings>();
    const [youtubeTransferCandidate, setYoutubeTransferCandidate] = useState<YoutubeTransferCandidate | undefined>();
    const theme = useMemo(() => settings && createTheme(settings.themeType), [settings]);

    useEffect(() => {
        settingsProvider.getAll().then(setSettings);
    }, [settingsProvider]);

    useEffect(() => {
        const showPillOnActiveTab = async () => {
            try {
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                const activeTab = tabs.find((t) => t.id !== undefined);
                if (!activeTab?.id) {
                    return;
                }

                await browser.storage.local.set({ ln_global_pill_hidden: false });

                await browser.tabs.sendMessage(activeTab.id, {
                    command: 'show-global-pill',
                } as any);

                const command: ExtensionToVideoCommand<any> = {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        command: 'show-mobile-overlay',
                    } as any,
                };

                await browser.tabs.sendMessage(activeTab.id, command);
            } catch {
                // Tab may not have the content script bound yet; ignore.
            }
        };

        void showPillOnActiveTab();
    }, []);

    const handleSettingsChanged = useCallback(
        async (changed: Partial<AsbplayerSettings>) => {
            setSettings((old: any) => ({ ...old, ...changed }));
            await settingsProvider.set(changed);
            notifySettingsUpdated();
        },
        [settingsProvider]
    );

    const handleOpenExtensionShortcuts = useCallback(() => {
        browser.tabs.create({ active: true, url: 'chrome://extensions/shortcuts' });
    }, []);

    const handleOpenApp = useCallback(async () => {
        const baseUrl = await webBaseUrl();

        // NEW: Just open the main app. The bridge will handle the auth push.
        const url = `${baseUrl}/learn`; // Redirect to learn dashboard
        browser.tabs.create({ active: true, url });
    }, []);

    const handleOpenSidePanel = useCallback(async () => {
        // @ts-ignore
        browser.sidePanel.open({ windowId: (await browser.windows.getLastFocused()).id });
    }, []);

    const activeTabVideoSrc = useCallback(async (activeTabId: number): Promise<string | undefined> => {
        try {
            const result = await browser.storage.session.get('tabRegistryVideoElements');
            const map = (result?.tabRegistryVideoElements ?? {}) as Record<string, TabRegistryVideoElement>;
            const candidates = Object.values(map).filter((entry) => entry?.tab?.id === activeTabId);

            if (candidates.length === 0) {
                return undefined;
            }

            const syncedCandidate = candidates
                .filter((entry) => entry.synced)
                .sort((a, b) => (b.syncedTimestamp ?? 0) - (a.syncedTimestamp ?? 0))[0];
            if (syncedCandidate?.src) {
                return syncedCandidate.src;
            }

            const withSubtitles = candidates.find((entry) => entry.loadedSubtitles && entry.src);
            if (withSubtitles?.src) {
                return withSubtitles.src;
            }

            return candidates.find((entry) => !!entry.src)?.src;
        } catch (error) {
            console.warn('[LN Popup] Failed to resolve active video src', error);
            return undefined;
        }
    }, []);

    const refreshYoutubeTransferCandidate = useCallback(async (): Promise<YoutubeTransferCandidate | undefined> => {
        try {
            const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id || !activeTab.url || !isYoutubeUrl(activeTab.url)) {
                if (activeTab?.url) {
                    console.info('[LN Popup] YouTube transfer disabled: active tab is not YouTube', {
                        url: activeTab.url,
                    });
                }
                setYoutubeTransferCandidate(undefined);
                return undefined;
            }

            const src = await activeTabVideoSrc(activeTab.id);
            if (!src) {
                console.info('[LN Popup] YouTube transfer disabled: no active video src in tab registry', {
                    tabId: activeTab.id,
                    url: activeTab.url,
                });
                setYoutubeTransferCandidate(undefined);
                return undefined;
            }

            const requestSubtitlesCommand: ExtensionToVideoCommand<RequestSubtitlesMessage> = {
                sender: 'asbplayer-extension-to-video',
                src,
                message: {
                    command: 'request-subtitles',
                },
            };
            const response = (await browser.tabs.sendMessage(activeTab.id, requestSubtitlesCommand)) as
                | RequestSubtitlesResponse
                | undefined;
            const subtitles = trackOneSubtitles(response?.subtitles || []).filter(
                (subtitle: any) => String(subtitle?.text ?? '').trim() !== ''
            );
            if (subtitles.length === 0) {
                console.info('[LN Popup] YouTube transfer disabled: no subtitles available for selected track', {
                    tabId: activeTab.id,
                    src,
                });
                setYoutubeTransferCandidate(undefined);
                return undefined;
            }

            const candidate = {
                youtubeUrl: activeTab.url,
                subtitlesSrt: subtitlesToSrt(subtitles),
            };
            setYoutubeTransferCandidate(candidate);
            return candidate;
        } catch (e) {
            console.warn('[LN Popup] Failed to refresh YouTube transfer candidate', e);
            setYoutubeTransferCandidate(undefined);
            return undefined;
        }
    }, [activeTabVideoSrc]);

    useEffect(() => {
        void refreshYoutubeTransferCandidate();
    }, [refreshYoutubeTransferCandidate]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            void refreshYoutubeTransferCandidate();
        }, 1000);

        const onTabActivated = () => void refreshYoutubeTransferCandidate();
        const onTabUpdated = () => void refreshYoutubeTransferCandidate();

        browser.tabs.onActivated.addListener(onTabActivated);
        browser.tabs.onUpdated.addListener(onTabUpdated);

        return () => {
            window.clearInterval(intervalId);
            browser.tabs.onActivated.removeListener(onTabActivated);
            browser.tabs.onUpdated.removeListener(onTabUpdated);
        };
    }, [refreshYoutubeTransferCandidate]);

    const handleSendYoutubeToWeb = useCallback(async () => {
        const candidate = (await refreshYoutubeTransferCandidate()) ?? youtubeTransferCandidate;
        if (!candidate) {
            console.info('[LN Popup] Send to Web skipped: no transferable YouTube candidate');
            return;
        }

        const payload = {
            youtubeUrl: candidate.youtubeUrl,
            subtitlesSrt: candidate.subtitlesSrt,
            sentAt: Date.now(),
            source: 'extension-popup',
        };

        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        await browser.storage.local.set({
            metheusPendingYoutubeImport: {
                requestId,
                payload,
                createdAt: Date.now(),
            },
        });

        const sendToWebTab = async (tabId: number) => {
            for (let i = 0; i < 24; i++) {
                try {
                    await browser.tabs.sendMessage(tabId, {
                        type: 'METHEUS_IMPORT_YOUTUBE_VIDEO',
                        requestId,
                        payload,
                    });
                    console.info('[LN Popup] Send to Web payload delivered', { tabId });
                    return true;
                } catch (e) {
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }

            console.warn('[LN Popup] Send to Web payload delivery timed out', { tabId });
            return false;
        };

        const existingTabs = await browser.tabs.query({
            url: [
                'http://localhost/*',
                'https://localhost/*',
                'http://localhost:*/*',
                'https://localhost:*/*',
                'http://127.0.0.1/*',
                'https://127.0.0.1/*',
                'http://127.0.0.1:*/*',
                'https://127.0.0.1:*/*',
                'http://metheus.app/*',
                'https://metheus.app/*',
                'http://www.metheus.app/*',
                'https://www.metheus.app/*',
            ],
        });
        const existingTab =
            existingTabs.find((tab) => tab.active && tab.id !== undefined) ??
            existingTabs.find((tab) => tab.id !== undefined);

        if (existingTab?.id !== undefined) {
            let targetUrl = `${new URL(existingTab.url!).origin}/library`;
            await browser.tabs.update(existingTab.id, { active: true, url: targetUrl });
            await sendToWebTab(existingTab.id);
            return;
        }

        const baseUrl = await webBaseUrl();
        const targetUrl = `${baseUrl}/library`;
        const createdTab = await browser.tabs.create({ active: true, url: targetUrl });
        if (createdTab.id !== undefined) {
            await sendToWebTab(createdTab.id);
        }
    }, [refreshYoutubeTransferCandidate, youtubeTransferCandidate]);

    const { requestingActiveTabPermission, tabRequestingActiveTabPermission } = useRequestingActiveTabPermission();

    useEffect(() => {
        if (!requestingActiveTabPermission || tabRequestingActiveTabPermission === undefined) {
            return;
        }

        const command: ExtensionToVideoCommand<GrantedActiveTabPermissionMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'granted-active-tab-permission',
            },
            src: tabRequestingActiveTabPermission.src,
        };
        browser.tabs.sendMessage(tabRequestingActiveTabPermission.tabId, command);
        window.close();
    }, [requestingActiveTabPermission, tabRequestingActiveTabPermission]);

    const handleProfileChanged = useCallback(() => {
        settingsProvider.getAll().then(setSettings);
        notifySettingsUpdated();
    }, [settingsProvider]);

    const profilesContext = useSettingsProfileContext({ settingsProvider, onProfileChanged: handleProfileChanged });

    if (!settings || !theme || requestingActiveTabPermission === undefined) {
        return null;
    }

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Paper
                    square
                    style={{
                        backgroundImage:
                            settings.themeType === 'dark'
                                ? 'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))'
                                : 'none',
                        width: isMobile ? '100%' : 600,
                    }}
                >
                    <Box>
                        <Popup
                            commands={commands}
                            settings={settings}
                            onSettingsChanged={handleSettingsChanged}
                            onOpenApp={handleOpenApp}
                            onOpenSidePanel={handleOpenSidePanel}
                            onSendYoutubeToWeb={handleSendYoutubeToWeb}
                            canSendYoutubeToWeb={youtubeTransferCandidate !== undefined}
                            onOpenExtensionShortcuts={handleOpenExtensionShortcuts}
                            settingsProvider={settingsProvider}
                            {...profilesContext}
                        />
                    </Box>
                </Paper>
            </ThemeProvider>
        </StyledEngineProvider>
    );
}
