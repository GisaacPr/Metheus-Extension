import Grid from '@mui/material/Grid';
import { HttpPostMessage, PopupToExtensionCommand } from '@metheus/common';
import { AsbplayerSettings, Profile, chromeCommandBindsToKeyBinds } from '@metheus/common/settings';
import SettingsForm from '@metheus/common/components/SettingsForm';
import PanelIcon from '@metheus/common/components/PanelIcon';
import LaunchIcon from '@mui/icons-material/Launch';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import { useTranslation } from 'react-i18next';
import { Fetcher } from '@metheus/common/src/fetcher';
import { useLocalFontFamilies } from '@metheus/common/hooks';

import { useSupportedLanguages } from '../hooks/use-supported-languages';
import { useI18n } from '../hooks/use-i18n';
import { isMobile } from 'react-device-detect';
import { isFirefoxBuild } from '../../services/build-flags';
import { useTheme } from '@mui/material/styles';

import { settingsPageConfigs } from '@/services/pages';
import Stack from '@mui/material/Stack';
import TutorialIcon from '@metheus/common/components/TutorialIcon';
import Paper from '@mui/material/Paper';
import { SettingsProvider } from '@metheus/common/settings';
import { getMetheusDictionaryService, SUPPORTED_LANGUAGES } from '../../services/metheus-dictionary';
import { getMetheusSyncService } from '../../services/metheus-sync';

interface Props {
    settings: AsbplayerSettings;
    commands: any;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    onOpenApp: () => void;
    onOpenSidePanel: () => void;
    onSendYoutubeToWeb: () => void;
    canSendYoutubeToWeb: boolean;
    onOpenExtensionShortcuts: () => void;
    profiles: Profile[];
    activeProfile?: string;
    onNewProfile: (name: string) => void;
    onRemoveProfile: (name: string) => void;
    onSetActiveProfile: (name: string | undefined) => void;
    settingsProvider: SettingsProvider;
}

class ExtensionFetcher implements Fetcher {
    fetch(url: string, body: any) {
        const httpPostCommand: PopupToExtensionCommand<HttpPostMessage> = {
            sender: 'asbplayer-popup',
            message: {
                command: 'http-post',
                url,
                body,
                messageId: '',
            },
        };
        return browser.runtime.sendMessage(httpPostCommand);
    }
}

const Popup = ({
    settings,
    commands,
    onOpenApp,
    onOpenSidePanel,
    onSendYoutubeToWeb,
    canSendYoutubeToWeb,
    onSettingsChanged,
    onOpenExtensionShortcuts,
    settingsProvider,
    ...profilesContext
}: Props) => {
    const { t } = useTranslation();
    const { initialized: i18nInitialized } = useI18n({ language: settings.language });

    const handleUnlockLocalFonts = useCallback(() => {
        browser.tabs.create({
            url: `${browser.runtime.getURL('/options.html')}#subtitle-appearance`,
            active: true,
        });
    }, []);
    const { supportedLanguages } = useSupportedLanguages();
    const { localFontsAvailable, localFontsPermission, localFontFamilies } = useLocalFontFamilies();
    const theme = useTheme();

    // Dictionary Management Logic (same approach as SettingsPage)
    const [installedDictionaries, setInstalledDictionaries] = useState<Record<string, boolean>>({});
    const [downloadingDictionaries, setDownloadingDictionaries] = useState<Record<string, number>>({});
    const dictionaryService = useMemo(() => getMetheusDictionaryService(settingsProvider), [settingsProvider]);

    // Sync Status Logic
    const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
    const [knownWordCounts, setKnownWordCounts] = useState<Record<string, number>>({});
    const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
    const [noteTypes, setNoteTypes] = useState<{ id: string; name: string }[]>([]);
    const syncService = useMemo(() => getMetheusSyncService(settingsProvider), [settingsProvider]);

    useEffect(() => {
        const fetchAll = async () => {
            await syncService.waitForCache();
            await syncService.reloadLocalCache();

            const status = syncService.getSyncStatus();
            setPendingSyncCount(status.pendingChanges);

            const counts: Record<string, number> = {};
            const langs = Object.keys(SUPPORTED_LANGUAGES);
            for (const lang of langs) {
                const words = syncService.getKnownWordsForLanguage(lang);
                counts[lang] = words.filter((w) => w.status >= 4).length;
            }
            setKnownWordCounts(counts);

            setDecks(syncService.getDecks());
            setNoteTypes(syncService.getNoteTypes());
        };

        fetchAll();

        const listener = (message: any) => {
            const command = message?.message?.command || message?.command;
            if (
                command === 'metheus-word-status-updated' ||
                command === 'metheus-force-sync' ||
                message?.type === 'METHEUS_CONFIG_UPDATED'
            ) {
                setTimeout(fetchAll, 250);
            }
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, [syncService]);

    useEffect(() => {
        const checkStatus = async () => {
            const status: Record<string, boolean> = {};
            const langs = Object.keys(SUPPORTED_LANGUAGES);

            for (const lang of langs) {
                try {
                    status[lang] = await dictionaryService.isLanguageDownloaded(lang);
                } catch (e) {
                    console.error(`Failed to check status for ${lang}`, e);
                    status[lang] = false;
                }
            }
            setInstalledDictionaries(status);
        };

        checkStatus();
    }, [dictionaryService]);

    const handleManageDictionary = useCallback(
        async (langCode: string) => {
            // If already downloading or installed, ignore
            if (downloadingDictionaries[langCode] !== undefined || installedDictionaries[langCode]) {
                return;
            }

            try {
                setDownloadingDictionaries((prev) => ({ ...prev, [langCode]: 0 }));

                await dictionaryService.downloadLanguage(langCode, (progress) => {
                    setDownloadingDictionaries((prev) => ({ ...prev, [langCode]: Math.round(progress) }));
                });

                setInstalledDictionaries((prev) => ({ ...prev, [langCode]: true }));
            } catch (error) {
                console.error(`Failed to download dictionary for ${langCode}`, error);
            } finally {
                setDownloadingDictionaries((prev) => {
                    const copy = { ...prev };
                    delete copy[langCode];
                    return copy;
                });
            }
        },
        [downloadingDictionaries, installedDictionaries, dictionaryService]
    );

    if (!i18nInitialized) {
        return null;
    }

    return (
        <Paper>
            <Stack direction="column" spacing={1.5} sx={{ padding: theme.spacing(1.5) }}>
                <ButtonGroup fullWidth color="primary" orientation="horizontal">
                    <Button variant="contained" color="primary" startIcon={<LaunchIcon />} onClick={onOpenApp}>
                        {t('action.openApp')}
                    </Button>
                    {!isMobile && !isFirefoxBuild && (
                        <Button variant="contained" color="primary" startIcon={<PanelIcon />} onClick={onOpenSidePanel}>
                            {t('action.openSidePanel')}
                        </Button>
                    )}
                    <Button
                        variant={canSendYoutubeToWeb ? 'contained' : 'outlined'}
                        color="primary"
                        startIcon={<YouTubeIcon />}
                        onClick={onSendYoutubeToWeb}
                        disabled={!canSendYoutubeToWeb}
                        sx={{ whiteSpace: 'normal', lineHeight: 1.1, textAlign: 'center', py: 0.75 }}
                    >
                        {t('action.sendYoutubeToWeb', { defaultValue: 'Send to Web' })}
                    </Button>
                </ButtonGroup>
                <Grid
                    item
                    style={{
                        height: isMobile ? 'auto' : 390,
                    }}
                >
                    <SettingsForm
                        heightConstrained
                        extensionInstalled
                        extensionVersion={browser.runtime.getManifest().version}
                        extensionSupportsAppIntegration
                        extensionSupportsOverlay
                        extensionSupportsSidePanel={!isFirefoxBuild}
                        extensionSupportsOrderableAnkiFields
                        extensionSupportsTrackSpecificSettings
                        extensionSupportsSubtitlesWidthSetting
                        extensionSupportsPauseOnHover
                        extensionSupportsExportCardBind
                        extensionSupportsPageSettings
                        forceVerticalTabs={false}
                        chromeKeyBinds={chromeCommandBindsToKeyBinds(commands)}
                        settings={settings}
                        pageConfigs={settingsPageConfigs}
                        localFontsAvailable={localFontsAvailable}
                        localFontsPermission={localFontsPermission}
                        localFontFamilies={localFontFamilies}
                        supportedLanguages={supportedLanguages}
                        onSettingsChanged={onSettingsChanged}
                        onOpenChromeExtensionShortcuts={onOpenExtensionShortcuts}
                        onUnlockLocalFonts={handleUnlockLocalFonts}
                        // Dictionary Props passed down
                        installedDictionaries={installedDictionaries}
                        downloadingDictionaries={downloadingDictionaries}
                        onManageDictionary={handleManageDictionary}
                        pendingSyncCount={pendingSyncCount}
                        knownWordCounts={knownWordCounts}
                        decks={decks}
                        noteTypes={noteTypes}
                    />
                </Grid>
            </Stack>
        </Paper>
    );
};

export default Popup;
