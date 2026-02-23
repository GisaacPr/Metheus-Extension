import {
    AsbPlayerToTabCommand,
    AsbPlayerToVideoCommandV2,
    Image,
    CopyHistoryItem,
    ExtensionToVideoCommand,
    LoadSubtitlesMessage,
    RequestSubtitlesMessage,
    VideoTabModel,
    ExtensionToAsbPlayerCommand,
    CopySubtitleMessage,
    CardModel,
    RequestSubtitlesResponse,
    JumpToSubtitleMessage,
    DownloadImageMessage,
    DownloadAudioMessage,
    CardExportedMessage,
} from '@metheus/common';
import type { Message } from '@metheus/common';
import type { BulkExportStartedPayload } from '../../controllers/bulk-export-controller';
import { AsbplayerSettings, SettingsProvider } from '@metheus/common/settings';
import { AudioClip } from '@metheus/common/audio-clip';
import { ChromeExtension, useCopyHistory } from '@metheus/common/app';
import { useI18n } from '../hooks/use-i18n';
import { SubtitleReader } from '@metheus/common/subtitle-reader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Player from '@metheus/common/app/components/Player';
import { PlaybackPreferences } from '@metheus/common/app';
import { AlertColor } from '@mui/material/Alert';
import Alert from '@metheus/common/app/components/Alert';
import { LocalizedError } from '@metheus/common/app';
import { useTranslation } from 'react-i18next';
import SidePanelHome from './SidePanelHome';
import { DisplaySubtitleModel } from '@metheus/common/app/components/SubtitlePlayer';
import { useCurrentTabId } from '../hooks/use-current-tab-id';
import { timeDurationDisplay } from '@metheus/common/app/services/util';
import { useVideoElementCount } from '../hooks/use-video-element-count';
import CenteredGridContainer from './CenteredGridContainer';
import CenteredGridItem from './CenteredGridItem';
import CircularProgress from '@mui/material/CircularProgress';
import SidePanelBottomControls from './SidePanelBottomControls';
import SidePanelRecordingOverlay from './SidePanelRecordingOverlay';
import SidePanelTopControls from './SidePanelTopControls';
import CopyHistory from '@metheus/common/app/components/CopyHistory';
import CopyHistoryList from '@metheus/common/app/components/CopyHistoryList';
import { useAppKeyBinder } from '@metheus/common/app/hooks/use-app-key-binder';
import { download } from '@metheus/common/util';
import { MiningContext } from '@metheus/common/app/services/mining-context';
import BulkExportModal from '@metheus/common/app/components/BulkExportModal';
import { IndexedDBCopyHistoryRepository } from '@metheus/common/copy-history';
import { mp3WorkerFactory } from '../../services/mp3-worker-factory';
import { pgsParserWorkerFactory } from '../../services/pgs-parser-worker-factory';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
import { getSubtitleColorizer } from '../../services/subtitle-colorizer';
import { getWordPopup } from '../../services/word-popup';
import {
    getMetheusDictionaryService,
    SUPPORTED_LANGUAGES as LN_SUPPORTED_LANGUAGES,
} from '../../services/metheus-dictionary';
import { getMetheusSyncService } from '../../services/metheus-sync';

import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import SubtitleAppearancePanel from '../SmartHudPill/SubtitleAppearancePanel';
import GeneralSettingsPanel from '../SmartHudPill/GeneralSettingsPanel';

interface Props {
    settings: AsbplayerSettings;
    extension: ChromeExtension;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
}

const sameVideoTab = (a: VideoTabModel, b: VideoTabModel) => {
    return a.id === b.id && a.src === b.src && a.synced === b.synced && a.syncedTimestamp === b.syncedTimestamp;
};

const emptyArray: VideoTabModel[] = [];
const miningContext = new MiningContext();

type TabValue = 'subtitles' | 'appearance' | 'settings';

export default function SidePanel({ settings, extension, onSettingsChanged }: Props) {
    const [tab, setTab] = useState<TabValue>('subtitles');
    const { t } = useTranslation();
    const playbackPreferences = useMemo(() => new PlaybackPreferences(settings, extension), [settings, extension]);
    const subtitleReader = useMemo(
        () =>
            new SubtitleReader({
                regexFilter: settings.subtitleRegexFilter,
                regexFilterTextReplacement: settings.subtitleRegexFilterTextReplacement,
                subtitleHtml: settings.subtitleHtml,
                convertNetflixRuby: settings.convertNetflixRuby,
                pgsParserWorkerFactory,
            }),
        [settings]
    );
    const [subtitles, setSubtitles] = useState<DisplaySubtitleModel[]>();
    const richTextCache = useRef<Map<string, string>>(new Map());
    const [cacheVersion, setCacheVersion] = useState(0);

    const displaySubtitles = useMemo(() => {
        if (!subtitles) return undefined;
        return subtitles.map((s) => {
            const richText = richTextCache.current.get(s.text);
            return richText ? { ...s, richText } : s;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtitles, cacheVersion]);

    const [subtitleFileNames, setSubtitleFileNames] = useState<string[]>();
    const [canDownloadSubtitles, setCanDownloadSubtitles] = useState<boolean>(true);
    const [alert, setAlert] = useState<string>();
    const [alertOpen, setAlertOpen] = useState<boolean>(false);
    const [alertSeverity, setAlertSeverity] = useState<AlertColor>();
    const [initializing, setInitializing] = useState<boolean>(true);
    const [syncedVideoTab, setSyncedVideoElement] = useState<VideoTabModel>();
    const [recordingAudio, setRecordingAudio] = useState<boolean>(false);
    const [viewingAsbplayer, setViewingAsbplayer] = useState<boolean>(false);

    // Dictionary management state
    const [installedDictionaries, setInstalledDictionaries] = useState<Record<string, boolean>>({});
    const [downloadingDictionaries, setDownloadingDictionaries] = useState<Record<string, number>>({});
    const [knownWordCounts, setKnownWordCounts] = useState<Record<string, number>>({});
    const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
    const [noteTypes, setNoteTypes] = useState<{ id: string; name: string }[]>([]);
    const dictionaryService = useMemo(
        () => getMetheusDictionaryService(new SettingsProvider(new ExtensionSettingsStorage())),
        []
    );
    const syncService = useMemo(() => getMetheusSyncService(new SettingsProvider(new ExtensionSettingsStorage())), []);

    useEffect(() => {
        const fetchAll = async () => {
            await syncService.waitForCache();
            await syncService.reloadLocalCache();

            const counts: Record<string, number> = {};
            const langs = Object.keys(LN_SUPPORTED_LANGUAGES);

            for (const lang of langs) {
                const words = syncService.getKnownWordsForLanguage(lang);
                // Status >= 4 means "known" (Learning 4 or Mastery 5)
                counts[lang] = words.filter((w) => w.status >= 4).length;
            }
            setKnownWordCounts(counts);

            // Get decks and note types from local cache (populated by Web App via bridge)
            const decksList = syncService.getDecks();
            const noteTypesList = syncService.getNoteTypes();
            setDecks(decksList);
            setNoteTypes(noteTypesList);
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
                setTimeout(fetchAll, 500); // Small delay to let cache update
            }
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, [syncService, settings.metheusEnabled]);

    useEffect(() => {
        const checkStatus = async () => {
            const status: Record<string, boolean> = {};
            const langs = Object.keys(LN_SUPPORTED_LANGUAGES);

            for (const lang of langs) {
                try {
                    status[lang] = await dictionaryService.isLanguageDownloaded(lang);
                } catch (e) {
                    status[lang] = false;
                }
            }
            setInstalledDictionaries(status);
        };

        checkStatus();
    }, [dictionaryService]);

    const handleManageDictionary = useCallback(
        async (langCode: string) => {
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

    const keyBinder = useAppKeyBinder(settings.keyBindSet, extension);
    const currentTabId = useCurrentTabId();
    const videoElementCount = useVideoElementCount({ extension, currentTabId });

    // Listen for tab switch commands from SmartHudPill
    useEffect(() => {
        const listener = (message: any) => {
            if (message?.command === 'set-side-panel-tab' && message?.tab) {
                setTab(message.tab as TabValue);
            }
        };
        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, []);

    useEffect(() => {
        extension.loadedSubtitles = subtitles !== undefined && subtitles.length > 0;
        extension.startHeartbeat();
    }, [extension, subtitles]);

    // Initialize colorizer once on mount
    useEffect(() => {
        const settingsProvider = new SettingsProvider(new ExtensionSettingsStorage());
        getSubtitleColorizer(settingsProvider).initialize().catch(console.error);
    }, []);

    // Enable dictionary popup for tokens inside the Side Panel subtitle list.
    // The page-level listener in metheus-integration.ts runs on the video page, not in the Side Panel document.
    useEffect(() => {
        const settingsProvider = new SettingsProvider(new ExtensionSettingsStorage());
        const popup = getWordPopup(settingsProvider);

        const handler = (event: PointerEvent) => {
            if (event.defaultPrevented) return;

            const target = event.target as HTMLElement | null;
            if (!target) return;

            // Ignore clicks inside the popup itself
            const path = event.composedPath?.() ?? [];
            const clickedInsidePopup = path.some((node) => {
                if (node instanceof HTMLElement) {
                    return node.id === 'metheus-popup-host' || node.id === 'ln-popup-root';
                }
                return false;
            });
            if (clickedInsidePopup) return;

            const wordEl = target.closest('.ln-word') as HTMLElement | null;
            if (!wordEl) return;

            const word = wordEl.dataset.word;
            const sentence = wordEl.dataset.sentence;
            if (!word || !sentence) return;

            // Prevent seek/click handlers in the subtitle list.
            event.preventDefault();
            event.stopPropagation();

            document.querySelectorAll('.ln-word-active').forEach((el) => el.classList.remove('ln-word-active'));
            wordEl.classList.add('ln-word-active');

            // Word click handling is implemented inside SubtitlePlayer (common) to reliably capture
            // clicks on tokens rendered via dangerouslySetInnerHTML.
            // (Keeping this handler avoids breaking other potential .ln-word usages.)
            //
            // If this handler triggers on some other .ln-word element outside the subtitle list,
            // we still attempt to open the popup on the page.
            const r = wordEl.getBoundingClientRect();

            if (syncedVideoTab?.id) {
                const message = {
                    sender: 'metheus-sidepanel',
                    message: {
                        command: 'metheus-show-popup',
                        tabId: syncedVideoTab.id,
                        word,
                        sentence,
                        position: { y: r.top + r.height / 2 },
                    },
                };

                console.log('[SidePanel] Word clicked', { word, sentence, syncedVideoTabId: syncedVideoTab.id });
                void browser.runtime.sendMessage(message);
            } else {
                console.warn('[SidePanel] Word clicked but syncedVideoTab is undefined', {
                    word,
                    sentence,
                    syncedVideoTab,
                });
            }
        };

        document.addEventListener('pointerdown', handler, true);
        return () => document.removeEventListener('pointerdown', handler, true);
    }, [syncedVideoTab]);

    // Process subtitles when they change
    useEffect(() => {
        if (!subtitles || subtitles.length === 0) {
            return;
        }

        let cancelled = false;

        const run = async () => {
            // Ensure colorizer is fully initialized (with frequency data) before processing
            const settingsProvider = new SettingsProvider(new ExtensionSettingsStorage());
            const colorizer = getSubtitleColorizer(settingsProvider);
            await colorizer.initialize(); // Wait for frequency data to load for L+1 detection

            if (cancelled) return;

            const items = subtitles;
            let count = 0;
            const BATCH = 50;
            let hasUpdates = false;

            const processBatch = () => {
                if (cancelled) return;

                const end = Math.min(count + BATCH, items.length);
                let batchUpdates = 0;

                for (let i = count; i < end; i++) {
                    const sub = items[i];

                    // Do not colorize secondary tracks (track > 0)
                    if (sub.track > 0) {
                        continue;
                    }

                    try {
                        // Use Sync version for extreme speed
                        const html = colorizer.getHtmlForSubtitlesSync(sub.text);

                        // Only update and trigger re-render if the HTML actually changed
                        // (e.g. status of a word inside changed)
                        if (richTextCache.current.get(sub.text) !== html) {
                            richTextCache.current.set(sub.text, html);
                            batchUpdates++;
                            hasUpdates = true;
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }

                if (cancelled) return;

                // Trigger re-render if we found new rich text in this batch
                if (batchUpdates > 0) {
                    setCacheVersion((v) => v + 1);
                }

                count = end;

                if (count < items.length) {
                    // Use queueMicrotask or 0ms timeout for faster processing without blocking UI
                    setTimeout(processBatch, 0);
                }
            };

            processBatch();
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [subtitles, cacheVersion]);

    useEffect(() => {
        setCanDownloadSubtitles(subtitles?.some((s) => s.text !== '') ?? false);
    }, [subtitles]);

    useEffect(() => {
        if (currentTabId === undefined) {
            return;
        }

        return extension.subscribeTabs(async (tabs) => {
            const currentVideoTabs = tabs.filter((t) => t.id === currentTabId);

            if (currentVideoTabs.length > 0) {
                let lastSyncedVideoTab: VideoTabModel | undefined;

                for (const t of currentVideoTabs) {
                    if (!t.synced) {
                        continue;
                    }

                    if (lastSyncedVideoTab === undefined || t.syncedTimestamp! > lastSyncedVideoTab.syncedTimestamp!) {
                        lastSyncedVideoTab = t;
                    }
                }

                if (
                    lastSyncedVideoTab !== undefined &&
                    (syncedVideoTab === undefined || !sameVideoTab(lastSyncedVideoTab, syncedVideoTab))
                ) {
                    const message: ExtensionToVideoCommand<RequestSubtitlesMessage> = {
                        sender: 'asbplayer-extension-to-video',
                        message: {
                            command: 'request-subtitles',
                        },
                        src: lastSyncedVideoTab.src,
                    };
                    const response = (await browser.tabs.sendMessage(lastSyncedVideoTab.id, message)) as
                        | RequestSubtitlesResponse
                        | undefined;

                    if (response !== undefined) {
                        const subs = response.subtitles;
                        const length = subs.length > 0 ? subs[subs.length - 1].end : 0;
                        setSyncedVideoElement(lastSyncedVideoTab);
                        setSubtitles(
                            subs.map((s, index) => ({
                                ...s,
                                index,
                                displayTime: timeDurationDisplay(s.start, length, false),
                            }))
                        );
                        setSubtitleFileNames(response.subtitleFileNames);
                    }
                }
            }

            setInitializing(false);
        });
    }, [extension, subtitles, initializing, currentTabId, syncedVideoTab]);

    // Fix for Side Panel Sync: Listen to runtime messages directly
    // The ChromeExtension wrapper listens to window.postMessage, but the popup sends via browser.runtime.sendMessage
    useEffect(() => {
        const listener = (message: any) => {
            const command = message?.message?.command || message?.command;

            if (command === 'metheus-word-status-updated') {
                const colorizer = getSubtitleColorizer(new SettingsProvider(new ExtensionSettingsStorage()));
                colorizer.refreshLocal().then(() => {
                    // CRITICAL: DO NOT clear cache. Just increment version to trigger a background
                    // re-processing. The processBatch loop will detect changes and update.
                    setCacheVersion((v) => v + 1);
                });
            }
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, []);

    useEffect(() => {
        return extension.subscribe((message) => {
            if (message.data.command === 'close-side-panel') {
                window.close();
            }
        });
    }, [extension]);

    useEffect(() => {
        if (currentTabId === undefined || syncedVideoTab === undefined) {
            return;
        }

        return extension.subscribeTabs((tabs) => {
            const tabStillExists =
                tabs.find((t) => t.id === syncedVideoTab.id && t.src === syncedVideoTab.src && t.synced) !== undefined;

            if (!tabStillExists) {
                setSubtitles(undefined);
                setSyncedVideoElement(undefined);
            }
        });
    }, [extension, currentTabId, syncedVideoTab]);

    useEffect(() => {
        if (currentTabId === undefined) {
            setViewingAsbplayer(false);
            return;
        }

        return extension.subscribeTabs(() => {
            const asbplayer = extension.asbplayers?.find((a) => a.tabId === currentTabId);
            setViewingAsbplayer(asbplayer !== undefined);
        });
    }, [currentTabId, extension]);

    useEffect(() => {
        return extension.subscribe((message) => {
            if (message.data.command === 'recording-started') {
                setRecordingAudio(true);
            } else if (message.data.command === 'recording-finished') {
                setRecordingAudio(false);
            }
        });
    }, [extension]);

    useEffect(() => {
        return keyBinder.bindToggleSidePanel(
            () => window.close(),
            () => false
        );
    }, [keyBinder]);

    const handleError = useCallback(
        (message: any) => {
            console.error(message);

            setAlertSeverity('error');

            if (message instanceof LocalizedError) {
                setAlert(t(message.locKey, message.locParams) ?? '<failed to localize error>');
            } else if (message instanceof Error) {
                setAlert(message.message);
            } else if (typeof message === 'string') {
                setAlert(message);
            } else {
                setAlert(String(message));
            }

            setAlertOpen(true);
        },
        [t]
    );

    const handleAlertClosed = useCallback(() => setAlertOpen(false), []);

    const handleMineSubtitle = useCallback(() => {
        if (syncedVideoTab === undefined) {
            return;
        }

        const message: AsbPlayerToVideoCommandV2<CopySubtitleMessage> = {
            sender: 'asbplayerv2',
            message: { command: 'copy-subtitle', postMineAction: settings.clickToMineDefaultAction },
            tabId: syncedVideoTab.id,
            src: syncedVideoTab.src,
        };
        browser.runtime.sendMessage(message);
    }, [syncedVideoTab, settings.clickToMineDefaultAction]);

    const handleLoadSubtitles = useCallback(() => {
        if (currentTabId === undefined) {
            return;
        }

        const message: AsbPlayerToTabCommand<LoadSubtitlesMessage> = {
            sender: 'asbplayerv2',
            message: { command: 'load-subtitles' },
            tabId: currentTabId,
        };
        browser.runtime.sendMessage(message);
    }, [currentTabId]);

    const handleDownloadSubtitles = useCallback(() => {
        if (subtitles) {
            const fileName =
                subtitleFileNames !== undefined && subtitleFileNames.length > 0
                    ? `${subtitleFileNames[0]}.srt`
                    : 'subtitles.srt';
            download(new Blob([subtitleReader.subtitlesToSrt(subtitles)], { type: 'text/plain' }), fileName);
        }
    }, [subtitles, subtitleFileNames, subtitleReader]);

    const handleBulkExportSubtitles = useCallback(async () => {
        if (!syncedVideoTab) return;
        const startCommand: AsbPlayerToVideoCommandV2<Message> = {
            sender: 'asbplayerv2',
            message: { command: 'start-bulk-export' } as Message,
            tabId: syncedVideoTab.id,
            src: syncedVideoTab.src,
        };
        browser.runtime.sendMessage(startCommand);
    }, [syncedVideoTab]);

    const handleBulkExportCancel = useCallback(async () => {
        if (!syncedVideoTab) return;
        const cancelCommand: AsbPlayerToVideoCommandV2<Message> = {
            sender: 'asbplayerv2',
            message: { command: 'cancel-bulk-export' } as Message,
            tabId: syncedVideoTab.id,
            src: syncedVideoTab.src,
        };
        browser.runtime.sendMessage(cancelCommand);
    }, [syncedVideoTab]);

    // Local bulk export UI state
    const [bulkOpen, setBulkOpen] = useState<boolean>(false);
    const [bulkCurrent, setBulkCurrent] = useState<number>(0);
    const [bulkTotal, setBulkTotal] = useState<number>(0);

    // Listen for bulk export lifecycle messages from background
    useEffect(() => {
        const listener = (message: any) => {
            if (message?.sender === 'asbplayerv2' && message?.message?.command === 'bulk-export-started') {
                const total = (message.message as BulkExportStartedPayload).total ?? 0;
                setBulkOpen(true);
                setBulkTotal(total);
                setBulkCurrent(0);
            } else if (
                message?.sender === 'asbplayer-extension-to-video' &&
                message?.message?.command === 'card-exported'
            ) {
                const exported = message.message as CardExportedMessage;
                if (exported.isBulkExport) {
                    setBulkCurrent((c) => c + 1);
                }
            } else if (
                message?.sender === 'asbplayerv2' &&
                (message?.message?.command === 'bulk-export-completed' ||
                    message?.message?.command === 'bulk-export-cancelled')
            ) {
                setBulkOpen(false);
            }
        };
        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, []);

    const topControlsRef = useRef<HTMLDivElement>(null);
    const [showTopControls, setShowTopControls] = useState<boolean>(false);

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const bounds = topControlsRef.current?.getBoundingClientRect();

            if (!bounds) {
                return;
            }
            const xDistance = Math.min(
                Math.abs(e.clientX - bounds.left),
                Math.abs(e.clientX - bounds.left - bounds.width)
            );
            const yDistance = Math.min(
                Math.abs(e.clientY - bounds.top),
                Math.abs(e.clientY - bounds.top - bounds.height)
            );

            if (!showTopControls && xDistance < 100 && yDistance < 100) {
                setShowTopControls(true);
            } else if (showTopControls && (xDistance >= 100 || yDistance >= 100)) {
                setShowTopControls(false);
            }
        },
        [showTopControls]
    );

    const copyHistoryRepository = useMemo(
        () => new IndexedDBCopyHistoryRepository(settings.miningHistoryStorageLimit),
        [settings.miningHistoryStorageLimit]
    );
    const { copyHistoryItems, refreshCopyHistory, deleteCopyHistoryItem, deleteAllCopyHistoryItems } = useCopyHistory(
        settings.miningHistoryStorageLimit,
        copyHistoryRepository
    );
    useEffect(() => {
        if (viewingAsbplayer) {
            refreshCopyHistory();
        }
    }, [refreshCopyHistory, viewingAsbplayer]);
    const [showCopyHistory, setShowCopyHistory] = useState<boolean>(false);
    const handleShowCopyHistory = useCallback(async () => {
        await refreshCopyHistory();
        setShowCopyHistory(true);
    }, [refreshCopyHistory]);
    const handleCloseCopyHistory = useCallback(() => setShowCopyHistory(false), []);
    const handleClipAudio = useCallback(
        async (item: CopyHistoryItem) => {
            if (viewingAsbplayer) {
                if (currentTabId) {
                    const downloadAudioCommand: ExtensionToAsbPlayerCommand<DownloadAudioMessage> = {
                        sender: 'asbplayer-extension-to-player',
                        message: {
                            command: 'download-audio',
                            ...item,
                        },
                    };
                    browser.tabs.sendMessage(currentTabId, downloadAudioCommand);
                }
            } else {
                const clip = AudioClip.fromCard(item, settings.audioPaddingStart, settings.audioPaddingEnd, false);

                if (clip) {
                    if (settings.preferMp3) {
                        const worker = await mp3WorkerFactory();
                        clip.toMp3(() => worker).download();
                    } else {
                        clip.download();
                    }
                }
            }
        },
        [settings, currentTabId, viewingAsbplayer]
    );
    const handleDownloadImage = useCallback(
        (item: CopyHistoryItem) => {
            if (viewingAsbplayer) {
                if (currentTabId) {
                    const downloadImageCommand: ExtensionToAsbPlayerCommand<DownloadImageMessage> = {
                        sender: 'asbplayer-extension-to-player',
                        message: {
                            command: 'download-image',
                            ...item,
                        },
                    };
                    browser.tabs.sendMessage(currentTabId, downloadImageCommand);
                }
            } else {
                const image = Image.fromCard(item, settings.maxImageWidth, settings.maxImageHeight);

                if (image) {
                    image.download();
                }
            }
        },
        [settings, currentTabId, viewingAsbplayer]
    );
    const handleJumpToSubtitle = useCallback(
        (card: CardModel) => {
            if (!currentTabId || !viewingAsbplayer) {
                return;
            }

            const asbplayerCommand: ExtensionToAsbPlayerCommand<JumpToSubtitleMessage> = {
                sender: 'asbplayer-extension-to-player',
                message: {
                    command: 'jump-to-subtitle',
                    subtitle: card.subtitle,
                    subtitleFileName: card.subtitleFileName,
                },
            };
            browser.tabs.sendMessage(currentTabId, asbplayerCommand);
        },
        [currentTabId, viewingAsbplayer]
    );
    const handleAnki = useCallback((copyHistoryItem: CopyHistoryItem) => {
        // Anki removed
    }, []);

    const recordingAudioRef = useRef(recordingAudio);
    recordingAudioRef.current = recordingAudio;

    const handleMineFromSubtitlePlayer = useCallback(
        (card: CardModel) => {
            if (syncedVideoTab === undefined) {
                return;
            }

            if (recordingAudioRef.current || currentTabId !== syncedVideoTab.id) {
                return;
            }

            const message: AsbPlayerToVideoCommandV2<CopySubtitleMessage> = {
                sender: 'asbplayerv2',
                message: {
                    command: 'copy-subtitle',
                    subtitle: card.subtitle,
                    surroundingSubtitles: card.surroundingSubtitles,
                    postMineAction: settings.clickToMineDefaultAction,
                },
                tabId: syncedVideoTab.id,
                src: syncedVideoTab.src,
            };
            browser.runtime.sendMessage(message);
        },
        [syncedVideoTab, settings.clickToMineDefaultAction, currentTabId]
    );

    const noOp = useCallback(() => {}, []);

    const { initialized: i18nInitialized } = useI18n({ language: settings.language });

    if (!i18nInitialized) {
        return null;
    }

    if (initializing || currentTabId === undefined || videoElementCount === undefined) {
        return (
            <CenteredGridContainer>
                <CenteredGridItem>
                    <CircularProgress color="primary" />
                </CenteredGridItem>
            </CenteredGridContainer>
        );
    }

    return (
        <div
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
            onMouseMove={handleMouseMove}
        >
            <Alert open={alertOpen} onClose={handleAlertClosed} autoHideDuration={3000} severity={alertSeverity}>
                {alert}
            </Alert>

            {/* Tab Navigation */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Tabs
                    value={tab}
                    onChange={(_, newValue) => setTab(newValue)}
                    variant="fullWidth"
                    sx={{ minHeight: 40 }}
                >
                    <Tab label={t('settings.subtitles')} value="subtitles" sx={{ minHeight: 40, py: 0 }} />
                    <Tab label={t('settings.subtitleAppearance')} value="appearance" sx={{ minHeight: 40, py: 0 }} />
                    <Tab label={t('settings.title')} value="settings" sx={{ minHeight: 40, py: 0 }} />
                </Tabs>
            </Box>

            {/* Tab Content - Use display:none for subtitles to preserve state, while other tabs are conditionally rendered */}
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <Box sx={{ display: tab === 'subtitles' ? 'block' : 'none', height: '100%', width: '100%' }}>
                    <>
                        {/* Subtitles content - always mounted */}
                        {viewingAsbplayer ? (
                            <CopyHistoryList
                                open={true}
                                items={copyHistoryItems}
                                forceShowDownloadOptions={true}
                                onClose={handleCloseCopyHistory}
                                onDelete={deleteCopyHistoryItem}
                                onDeleteAll={deleteAllCopyHistoryItems}
                                onAnki={handleAnki}
                                onClipAudio={handleClipAudio}
                                onDownloadImage={handleDownloadImage}
                                onSelect={handleJumpToSubtitle}
                            />
                        ) : (
                            <>
                                <CopyHistory
                                    open={showCopyHistory}
                                    items={copyHistoryItems}
                                    onClose={handleCloseCopyHistory}
                                    onDelete={deleteCopyHistoryItem}
                                    onDeleteAll={deleteAllCopyHistoryItems}
                                    onAnki={handleAnki}
                                    onClipAudio={handleClipAudio}
                                    onDownloadImage={handleDownloadImage}
                                />
                                {subtitles === undefined ? (
                                    <SidePanelHome
                                        extension={extension}
                                        videoElementCount={videoElementCount}
                                        onLoadSubtitles={handleLoadSubtitles}
                                        onShowMiningHistory={handleShowCopyHistory}
                                    />
                                ) : (
                                    <>
                                        <SidePanelRecordingOverlay show={recordingAudio} />
                                        <Player
                                            origin={browser.runtime.getURL('/sidepanel.html')}
                                            subtitles={displaySubtitles ?? subtitles}
                                            hideControls={true}
                                            showCopyButton={true}
                                            forceCompressedMode={true}
                                            subtitleReader={subtitleReader}
                                            settings={settings}
                                            playbackPreferences={playbackPreferences}
                                            onCopy={handleMineFromSubtitlePlayer}
                                            onMetheusWordClick={({ word, sentence, y }) => {
                                                if (!syncedVideoTab?.id) return;
                                                const message = {
                                                    sender: 'metheus-sidepanel',
                                                    message: {
                                                        command: 'metheus-show-popup',
                                                        tabId: syncedVideoTab.id,
                                                        word,
                                                        sentence,
                                                        position: { y },
                                                    },
                                                };
                                                console.log('[SidePanel] Word clicked (Player)', {
                                                    word,
                                                    sentence,
                                                    syncedVideoTabId: syncedVideoTab.id,
                                                });
                                                void browser.runtime.sendMessage(message);
                                            }}
                                            onError={handleError}
                                            onUnloadVideo={noOp}
                                            onLoaded={noOp}
                                            onTabSelected={noOp}
                                            onAnkiDialogRequest={noOp}
                                            onAnkiDialogRewind={noOp}
                                            onAppBarToggle={noOp}
                                            onHideSubtitlePlayer={noOp}
                                            onVideoPopOut={noOp}
                                            onPlayModeChangedViaBind={noOp}
                                            onSubtitles={setSubtitles}
                                            tab={syncedVideoTab}
                                            availableTabs={emptyArray}
                                            extension={extension}
                                            drawerOpen={false}
                                            appBarHidden={true}
                                            videoFullscreen={false}
                                            hideSubtitlePlayer={false}
                                            videoPopOut={false}
                                            disableKeyEvents={false}
                                            miningContext={miningContext}
                                            keyBinder={keyBinder}
                                        />
                                        <SidePanelTopControls
                                            ref={topControlsRef}
                                            show={showTopControls}
                                            onLoadSubtitles={handleLoadSubtitles}
                                            canDownloadSubtitles={canDownloadSubtitles}
                                            onDownloadSubtitles={handleDownloadSubtitles}
                                            onBulkExportSubtitles={handleBulkExportSubtitles}
                                            disableBulkExport={recordingAudio}
                                            onShowMiningHistory={handleShowCopyHistory}
                                        />
                                        <SidePanelBottomControls
                                            disabled={currentTabId !== syncedVideoTab?.id}
                                            onMineSubtitle={handleMineSubtitle}
                                            postMineAction={settings.clickToMineDefaultAction}
                                            emptySubtitleTrack={subtitles.length === 0}
                                            audioRecordingEnabled={settings.streamingRecordMedia}
                                            recordingAudio={recordingAudio}
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </>
                </Box>

                {/* Other tabs are conditionally rendered as before to save resources */}
                {tab === 'appearance' && (
                    <Box sx={{ p: 2 }}>
                        <SubtitleAppearancePanel
                            settings={settings}
                            onSettingsChanged={onSettingsChanged}
                            onBack={() => setTab('subtitles')}
                        />
                    </Box>
                )}

                {tab === 'settings' && (
                    <Box sx={{ p: 2 }}>
                        <GeneralSettingsPanel
                            settings={settings}
                            onSettingsChanged={(s) => {
                                onSettingsChanged(s);
                                // Auto-download logic if language changed
                                if (
                                    s.metheusTargetLanguage &&
                                    !installedDictionaries[s.metheusTargetLanguage] &&
                                    !downloadingDictionaries[s.metheusTargetLanguage]
                                ) {
                                    handleManageDictionary(s.metheusTargetLanguage);
                                }
                            }}
                            onBack={() => setTab('subtitles')}
                            installedDictionaries={installedDictionaries}
                            downloadingDictionaries={downloadingDictionaries}
                            onManageDictionary={handleManageDictionary}
                            onDeleteDictionary={handleDeleteDictionary}
                            knownWordCounts={knownWordCounts}
                            decks={decks}
                            noteTypes={noteTypes}
                        />
                    </Box>
                )}
            </Box>

            {/* Bulk Export Modal - rendered outside the main content to ensure it's always on top */}
            <BulkExportModal
                open={bulkOpen}
                currentIndex={bulkCurrent}
                totalItems={bulkTotal}
                onCancel={handleBulkExportCancel}
            />
        </div>
    );
}
