import { CardModel, HttpFetcher } from '@metheus/common';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { makeStyles } from '@mui/styles';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import SettingsForm from '@metheus/common/components/SettingsForm';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { useCommandKeyBinds } from '../hooks/use-command-key-binds';
import { useLocalFontFamilies } from '@metheus/common/hooks';
import { useI18n } from '../hooks/use-i18n';
import Paper from '@mui/material/Paper';
import { useSupportedLanguages } from '../hooks/use-supported-languages';
import { isFirefoxBuild } from '../../services/build-flags';
import { AsbplayerSettings, testCard } from '@metheus/common/settings';
import { useTheme, type Theme } from '@mui/material/styles';
import { settingsPageConfigs } from '@/services/pages';
// import { OfflineDictionaryManager } from './OfflineDictionaryManager'; // REMOVED
import { SettingsProvider } from '@metheus/common/settings';
import { getMetheusDictionaryService, SUPPORTED_LANGUAGES } from '../../services/metheus-dictionary';
import { getMetheusSyncService } from '../../services/metheus-sync';

const useStyles = makeStyles<Theme>((theme) => ({
    root: {
        '& .MuiPaper-root': {
            height: '100vh',
        },
    },
    content: {
        maxHeight: '100%',
    },
}));

interface Props {
    settings: AsbplayerSettings;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    inTutorial?: boolean;
    settingsProvider: SettingsProvider;
}

const extensionTestCard: () => Promise<CardModel> = () => {
    return testCard({
        imageUrl: browser.runtime.getURL('/assets/test-card.jpeg'),
        audioUrl: browser.runtime.getURL('/assets/test-card.mp3'),
    });
};

const SettingsPage = ({ settings, inTutorial, onSettingsChanged, settingsProvider }: Props) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const anki = undefined;
    const classes = useStyles();

    const {
        updateLocalFontsPermission,
        updateLocalFonts,
        localFontsAvailable,
        localFontsPermission,
        localFontFamilies,
    } = useLocalFontFamilies();

    const handleUnlockLocalFonts = useCallback(() => {
        updateLocalFontsPermission();
        updateLocalFonts();
    }, [updateLocalFontsPermission, updateLocalFonts]);

    const commands = useCommandKeyBinds();

    const handleOpenExtensionShortcuts = useCallback(() => {
        browser.tabs.create({ active: true, url: 'chrome://extensions/shortcuts' });
    }, []);

    const { initialized: i18nInitialized } = useI18n({ language: settings?.language ?? 'en' });
    const section = useMemo(() => {
        if (location.hash && location.hash.startsWith('#')) {
            return location.hash.substring(1, location.hash.length);
        }

        return undefined;
    }, []);
    const { supportedLanguages } = useSupportedLanguages();

    // Dictionary Management Logic
    const [installedDictionaries, setInstalledDictionaries] = useState<Record<string, boolean>>({});
    const [downloadingDictionaries, setDownloadingDictionaries] = useState<Record<string, number>>({});
    const dictionaryService = useMemo(() => getMetheusDictionaryService(settingsProvider), [settingsProvider]);

    // Sync Status Logic
    const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
    const [knownWordCounts, setKnownWordCounts] = useState<Record<string, number>>({});
    const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
    const syncService = useMemo(() => getMetheusSyncService(settingsProvider), [settingsProvider]);

    useEffect(() => {
        const fetchAll = async () => {
            await syncService.waitForCache();
            await syncService.reloadLocalCache();

            const counts: Record<string, number> = {};
            const langs = Object.keys(SUPPORTED_LANGUAGES);

            for (const lang of langs) {
                const words = syncService.getKnownWordsForLanguage(lang);
                counts[lang] = words.filter((w) => w.status >= 4).length;
            }
            setKnownWordCounts(counts);

            // Get decks from local cache (populated by Web App via bridge)
            setDecks(syncService.getDecks());
        };

        fetchAll();

        // Refresh counts when word status changes
        const listener = (message: any) => {
            const command = message?.message?.command || message?.command;
            if (
                command === 'metheus-word-status-updated' ||
                command === 'metheus-force-sync' ||
                message?.type === 'METHEUS_CONFIG_UPDATED'
            ) {
                setTimeout(fetchAll, 500);
            }
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, [syncService, settings.metheusEnabled]);

    useEffect(() => {
        // Simple check on mount/update
        const status = syncService.getSyncStatus();
        setPendingSyncCount(status.pendingChanges);
    }, [syncService]);

    // Check status on mount
    useEffect(() => {
        const checkStatus = async () => {
            const installed: Record<string, boolean> = {};
            const downloading: Record<string, number> = {};
            const langs = Object.keys(SUPPORTED_LANGUAGES);

            for (const lang of langs) {
                try {
                    const state = await dictionaryService.getLanguageStatus(lang);
                    installed[lang] = state.isDownloaded;
                    if (state.isDownloading) {
                        downloading[lang] = state.progress;
                    }
                } catch (e) {
                    console.error(`Failed to check status for ${lang}`, e);
                    installed[lang] = false;
                }
            }
            setInstalledDictionaries(installed);
            setDownloadingDictionaries(downloading);
        };

        checkStatus();
    }, [dictionaryService]);

    useEffect(() => {
        const listener = (message: any) => {
            if (message?.type !== 'METHEUS_DICTIONARY_DOWNLOAD_PROGRESS' || !message.language) {
                return;
            }

            const lang = String(message.language);
            const progress = typeof message.progress === 'number' ? Math.round(message.progress) : 0;
            const isDownloading = !!message.isDownloading;
            const isDownloaded = !!message.isDownloaded || progress >= 100;

            setInstalledDictionaries((prev) => ({ ...prev, [lang]: isDownloaded }));
            setDownloadingDictionaries((prev) => {
                const next = { ...prev };
                if (isDownloading) {
                    next[lang] = Math.max(0, Math.min(100, progress));
                } else {
                    delete next[lang];
                }
                return next;
            });
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, []);

    const handleManageDictionary = useCallback(
        async (langCode: string) => {
            // If already downloading or installed, ignore
            if (downloadingDictionaries[langCode] !== undefined || installedDictionaries[langCode]) {
                return;
            }

            try {
                setDownloadingDictionaries((prev) => ({ ...prev, [langCode]: 0 }));
                await dictionaryService.downloadLanguage(langCode);
            } catch (error) {
                console.error(`Failed to download dictionary for ${langCode}`, error);
            }
        },
        [downloadingDictionaries, installedDictionaries, dictionaryService]
    );

    const handleDeleteDictionary = useCallback(
        async (langCode: string) => {
            try {
                await dictionaryService.deleteLanguage(langCode);
                setInstalledDictionaries((prev) => ({ ...prev, [langCode]: false }));
            } catch (error) {
                console.error(`Failed to delete dictionary for ${langCode}`, error);
            }
        },
        [dictionaryService]
    );

    if (!settings || !commands || !i18nInitialized) {
        return null;
    }

    return (
        <Paper square style={{ height: '100vh' }}>
            <Dialog open={true} maxWidth="md" fullWidth className={classes.root} onClose={() => {}}>
                <DialogTitle>{t('settings.title')}</DialogTitle>
                <DialogContent className={classes.content}>
                    <SettingsForm
                        anki={anki}
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
                        chromeKeyBinds={commands}
                        onOpenChromeExtensionShortcuts={handleOpenExtensionShortcuts}
                        onSettingsChanged={onSettingsChanged}
                        settings={settings}
                        pageConfigs={settingsPageConfigs}
                        localFontsAvailable={localFontsAvailable}
                        localFontsPermission={localFontsPermission}
                        localFontFamilies={localFontFamilies}
                        supportedLanguages={supportedLanguages}
                        onUnlockLocalFonts={handleUnlockLocalFonts}
                        scrollToId={section}
                        inTutorial={inTutorial}
                        testCard={extensionTestCard}
                        // Dictionary Props passed down
                        installedDictionaries={installedDictionaries}
                        downloadingDictionaries={downloadingDictionaries}
                        onManageDictionary={handleManageDictionary}
                        onDeleteDictionary={handleDeleteDictionary}
                        pendingSyncCount={pendingSyncCount}
                        knownWordCounts={knownWordCounts}
                        decks={decks}
                    />
                </DialogContent>
            </Dialog>
        </Paper>
    );
};

export default SettingsPage;
