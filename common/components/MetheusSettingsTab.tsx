import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AsbplayerSettings, PauseOnHoverMode } from '@metheus/common/settings';
import { makeStyles } from '@mui/styles';

// Type declaration for browser API
declare const browser: any;
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormLabel from '@mui/material/FormLabel';
import { Theme } from '@mui/material';
import LabelWithHoverEffect from './LabelWithHoverEffect';
import { SubtitleHtml } from '..';
import { Flag } from './Flag';

const SUPPORTED_LANGUAGE_CODES = [
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'ja',
    'zh',
    'ko',
    'vi',
    'ru',
    'ar',
    'hi',
    'tr',
    'pl',
    'nl',
    'sv',
    'id',
    'el',
    'hu',
    'la',
] as const;

const getSupportedLanguages = (i18nLang: string) =>
    SUPPORTED_LANGUAGE_CODES.map((code) => ({
        code,
        name: new Intl.DisplayNames([i18nLang], { type: 'language' }).of(code === 'pt' ? 'pt' : code) || code,
    }));

const SUPPORTED_NOTE_TYPES = ['STANDARD', 'CLOZE', 'LISTENING', 'SYNTAX'] as const;

const sanitizeNoteTypes = (noteTypes: { id: string; name: string }[]) => {
    const allowed = new Set(SUPPORTED_NOTE_TYPES);
    const filtered = noteTypes
        .map((nt) => ({ id: String(nt.id || '').toUpperCase(), name: nt.name || nt.id }))
        .filter((nt) => allowed.has(nt.id as any));

    if (filtered.length > 0) {
        return filtered;
    }

    return [
        { id: 'STANDARD', name: 'Standard' },
        { id: 'CLOZE', name: 'Cloze' },
        { id: 'LISTENING', name: 'Listening' },
        { id: 'SYNTAX', name: 'Syntax' },
    ];
};

// Icons
const LinkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
);

const useStyles = makeStyles((theme: Theme) => ({
    root: {
        '& .MuiTextField-root': {
            marginTop: theme.spacing(1),
            marginBottom: theme.spacing(1),
        },
    },
    section: {
        marginBottom: theme.spacing(3),
    },
    sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(1),
        marginBottom: theme.spacing(2),
    },
    statusChip: {
        marginLeft: theme.spacing(1),
    },
    connectButton: {
        marginTop: theme.spacing(2),
        marginBottom: theme.spacing(2),
    },
    divider: {
        margin: `${theme.spacing(3)} 0`,
    },
    switchGroup: {
        marginTop: theme.spacing(2),
    },
}));

// Status Icons
const CloudDownloadIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-green-500"
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

const StarIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
);

const ClozeIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c084fc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <path d="M12 17h.01"></path>
    </svg>
);

const ListeningIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"></path>
    </svg>
);

const SyntaxIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
        <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
        <path d="M10 9H8"></path>
        <path d="M16 13H8"></path>
        <path d="M16 17H8"></path>
    </svg>
);

const Trash2Icon = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);

interface Props {
    settings: AsbplayerSettings;
    extensionVersion?: string;
    onSettingChanged: (key: keyof AsbplayerSettings, value: any) => void;
    // renderDictionaryManager?: () => React.ReactNode; // Removed in favor of integrated UI
    supportedLanguages?: string[];
    extensionInstalled?: boolean;
    extensionSupportsPauseOnHover?: boolean;
    // Dictionary Props
    installedDictionaries?: Record<string, boolean>;

    downloadingDictionaries?: Record<string, number>;
    onManageDictionary?: (langCode: string) => void;
    onDeleteDictionary?: (langCode: string) => void;
    pendingSyncCount?: number;
    knownWordCounts?: Record<string, number>;
    decks?: { id: string; name: string }[];
    noteTypes?: { id: string; name: string }[];
}

export default function MetheusSettingsTab({
    settings,
    extensionVersion,
    onSettingChanged,
    // renderDictionaryManager,
    supportedLanguages = [],
    extensionInstalled,
    extensionSupportsPauseOnHover,
    installedDictionaries = {},
    downloadingDictionaries = {},
    onManageDictionary,
    onDeleteDictionary,
    pendingSyncCount = 0,
    knownWordCounts = {},
    decks = [],
    noteTypes = [],
}: Props) {
    const classes = useStyles();
    const { t, i18n } = useTranslation();
    const [connecting, setConnecting] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');

    useEffect(() => {
        if (settings.metheusApiKey || settings.metheusToken) {
            setConnectionStatus('connected');
        } else {
            setConnectionStatus('idle');
        }
    }, [settings.metheusApiKey, settings.metheusToken]);

    const isConnected = connectionStatus === 'connected';
    const safeNoteTypes = sanitizeNoteTypes(noteTypes);
    const localizedSupportedLanguages = getSupportedLanguages(i18n.language);
    const themeType = settings.themeType;

    // Settings values used by this tab
    const language = settings.language;
    const pauseOnHoverMode = settings.pauseOnHoverMode;

    const handleTargetLanguageChange = (event: SelectChangeEvent<string>) => {
        const newLang = event.target.value as string;
        onSettingChanged('metheusTargetLanguage', newLang);

        // Auto-download if not installed
        if (onManageDictionary && !installedDictionaries[newLang] && !downloadingDictionaries[newLang]) {
            onManageDictionary(newLang);
        }
    };

    const handleDeckIdChange = (event: SelectChangeEvent<string>) => {
        onSettingChanged('metheusTargetDeckId', event.target.value);
    };

    const handleNoteTypeChange = (event: SelectChangeEvent<string>) => {
        onSettingChanged('metheusNoteType', event.target.value);
    };

    const getNoteTypeIcon = (type: string) => {
        switch (type) {
            case 'CLOZE':
                return <ClozeIcon />;
            case 'LISTENING':
                return <ListeningIcon />;
            case 'SYNTAX':
                return <SyntaxIcon />;
            default:
                return <StarIcon />;
        }
    };

    const getNoteTypeColor = (type: string) => {
        switch (type) {
            case 'CLOZE':
                return '#c084fc';
            case 'LISTENING':
                return '#34d399';
            case 'SYNTAX':
                return '#fbbf24';
            default:
                return '#60a5fa';
        }
    };

    const getNoteTypeLabel = (type: string) => {
        switch (type) {
            case 'CLOZE':
                return t('settings.noteTypeCloze');
            case 'LISTENING':
                return t('settings.noteTypeListening');
            case 'SYNTAX':
                return t('settings.noteTypeSyntax');
            default:
                return t('settings.noteTypeStandard');
        }
    };

    // Connect with Metheus platform
    const handleConnect = useCallback(async () => {
        setConnecting(true);
        setError(null);

        try {
            // Open auth popup
            const baseUrl = (settings.metheusUrl || 'https://metheus.app').replace(/\/+$/, '');
            const version = extensionVersion || 'unknown';
            const authUrl = `${baseUrl}/auth/extension?version=${version}`;

            // Create a popup window for auth
            const width = 500;
            const height = 700;
            const left = (screen.width - width) / 2;
            const top = (screen.height - height) / 2;

            const authWindow = window.open(
                authUrl,
                'Metheus Auth',
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
            );

            // Listen for auth response
            const handleMessage = (event: MessageEvent) => {
                if (event.data?.type === 'METHEUS_AUTH_SUCCESS') {
                    const { apiKey } = event.data;
                    onSettingChanged('metheusApiKey', apiKey);

                    // Enforce features always enabled
                    onSettingChanged('metheusEnabled', true);
                    onSettingChanged('metheusSyncKnownWords', true);
                    onSettingChanged('metheusAutoExport', true);

                    // Smart URL setting: Use the origin of the auth page
                    if (event.origin) {
                        onSettingChanged('metheusUrl', event.origin);
                    }

                    setError(null);
                    setConnectionStatus('connected');
                    setConnecting(false);
                    window.removeEventListener('message', handleMessage);
                } else if (event.data?.type === 'METHEUS_AUTH_CANCELLED') {
                    setConnecting(false);
                    window.removeEventListener('message', handleMessage);
                    authWindow?.close();
                }
            };

            window.addEventListener('message', handleMessage);

            // Timeout after 5 minutes
            setTimeout(
                () => {
                    if (connecting) {
                        setConnecting(false);
                        setError(
                            t('info.error', {
                                message: t('info.connectionTimedOut', {
                                    defaultValue: 'Connection timed out. Please try again.',
                                }),
                            })
                        );
                        window.removeEventListener('message', handleMessage);
                    }
                },
                5 * 60 * 1000
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : t('info.connectionFailed'));
            setConnecting(false);
        }
    }, [settings.metheusUrl, onSettingChanged, connecting, extensionVersion, t]);

    // Verify connection
    const handleVerify = useCallback(async () => {
        setVerifying(true);
        setError(null);

        try {
            const apiKey = settings.metheusApiKey || settings.metheusToken;
            if (!apiKey) {
                throw new Error(
                    t('info.error', {
                        message: t('settings.noApiKeyConfigured', { defaultValue: 'No API key configured' }),
                    })
                );
            }

            const authHeader = `Bearer ${apiKey}`;
            const baseUrl = (settings.metheusUrl || 'https://metheus.app').replace(/\/+$/, '');

            const response = await fetch(`${baseUrl}/api/auth/extension`, {
                method: 'GET',
                headers: {
                    Authorization: authHeader,
                },
            });

            if (!response.ok) {
                throw new Error(
                    t('info.verificationFailedWithStatus', {
                        defaultValue: 'Verification failed: {{status}}',
                        status: response.status,
                    })
                );
            }

            await response.json();
            setConnectionStatus('connected');
        } catch (err) {
            console.error('Verification check failed:', err);
            if (settings.metheusApiKey) {
                setError(null);
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('error');
                setError(err instanceof Error ? err.message : t('info.connectionFailed'));
            }
        } finally {
            setVerifying(false);
        }
    }, [settings, t]);

    // Disconnect
    const handleDisconnect = useCallback(() => {
        onSettingChanged('metheusApiKey', '');
        onSettingChanged('metheusToken', '');
        onSettingChanged('metheusEnabled', false);

        setConnectionStatus('idle');
    }, [onSettingChanged]);

    return (
        <div className={classes.root}>
            {/* Connection Section */}
            <div className={classes.section}>
                <div className={classes.sectionTitle}>
                    <LinkIcon />
                    <Typography variant="h6">
                        {t('settings.appIntegration', { defaultValue: t('settings.integration') })}
                    </Typography>
                    {isConnected && (
                        <Chip
                            size="small"
                            label={t('info.connectionSucceeded', { defaultValue: t('settings.connected') })}
                            color="success"
                            icon={<CheckIcon />}
                            className={classes.statusChip}
                        />
                    )}
                </div>

                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        {!isConnected ? (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <Typography
                                    variant="body2"
                                    dangerouslySetInnerHTML={{ __html: t('settings.openAppInfo') }}
                                />
                            </Alert>
                        ) : (
                            <Box display="flex" gap={1} alignItems="center">
                                <TextField
                                    label={t('settings.usingLegacyToken')}
                                    fullWidth
                                    value={
                                        settings.metheusApiKey
                                            ? `${settings.metheusApiKey.substring(0, 10)}...`
                                            : t('settings.usingLegacyToken')
                                    }
                                    disabled
                                    size="small"
                                    sx={{ display: 'none' }} // Hidden as per request
                                />
                            </Box>
                        )}
                    </Grid>
                </Grid>

                {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}
            </div>

            <Divider className={classes.divider} />

            {/* General Settings (Moved from Misc) */}
            <div className={classes.section}>
                <Typography variant="h6" gutterBottom>
                    {t('settings.title')}
                </Typography>

                <Grid container spacing={3}>
                    {/* Theme */}
                    <Grid item xs={12}>
                        <FormControl component="fieldset">
                            <FormLabel component="legend">{t('settings.theme')}</FormLabel>
                            <RadioGroup row>
                                <LabelWithHoverEffect
                                    control={
                                        <Radio
                                            checked={themeType === 'light'}
                                            value="light"
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    onSettingChanged('themeType', 'light');
                                                    // AUTO-SYNC subtitle colors for light theme
                                                    onSettingChanged('subtitleColor', '#000000');
                                                    onSettingChanged('subtitleBackgroundColor', '#ffffff');
                                                    // Dynamic Shadows: Light theme -> Light shadow
                                                    onSettingChanged('subtitleShadowColor', '#ffffff');
                                                    onSettingChanged('subtitleShadowThickness', 3);
                                                }
                                            }}
                                        />
                                    }
                                    label={t('settings.themeLight')}
                                />
                                <LabelWithHoverEffect
                                    control={
                                        <Radio
                                            checked={themeType === 'dark'}
                                            value="dark"
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    onSettingChanged('themeType', 'dark');
                                                    // AUTO-SYNC subtitle colors for dark theme
                                                    onSettingChanged('subtitleColor', '#ffffff');
                                                    onSettingChanged('subtitleBackgroundColor', '#000000');
                                                    // Dynamic Shadows: Dark theme -> Black shadow
                                                    onSettingChanged('subtitleShadowColor', '#000000');
                                                    onSettingChanged('subtitleShadowThickness', 3);
                                                }
                                            }}
                                        />
                                    }
                                    label={t('settings.themeDark')}
                                />
                            </RadioGroup>
                        </FormControl>
                    </Grid>

                    {/* Interface Language */}
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                            {t('settings.language')}
                        </Typography>
                        <Select
                            value={language}
                            onChange={(event) => onSettingChanged('language', event.target.value)}
                            fullWidth
                            size="small"
                            renderValue={(selected) => {
                                const lang = localizedSupportedLanguages.find((l) => l.code === selected);
                                return (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <div style={{ width: 24, height: 16 }}>
                                            <Flag code={selected} />
                                        </div>
                                        {lang?.name || selected}
                                    </Box>
                                );
                            }}
                        >
                            {localizedSupportedLanguages.map((lang) => (
                                <MenuItem key={lang.code} value={lang.code}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <div style={{ width: 24, height: 16 }}>
                                            <Flag code={lang.code} />
                                        </div>
                                        {lang.name}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </Grid>
                </Grid>
            </div>

            {/* Study Settings (Merged visual section) */}
            {isConnected && (
                <div className={classes.section}>
                    <Grid container spacing={3}>
                        {/* Target Language */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                {t('settings.targetLanguage')}
                            </Typography>
                            <Select
                                value={settings.metheusTargetLanguage || 'en'}
                                onChange={handleTargetLanguageChange}
                                fullWidth
                                size="small"
                                renderValue={(selected) => {
                                    const lang = localizedSupportedLanguages.find((l) => l.code === selected);
                                    return (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <div style={{ width: 24, height: 16 }}>
                                                <Flag code={selected} />
                                            </div>
                                            {lang?.name || selected}
                                        </Box>
                                    );
                                }}
                            >
                                {localizedSupportedLanguages.map((lang) => {
                                    const isInstalled = installedDictionaries[lang.code];
                                    const downloadProgress = downloadingDictionaries[lang.code];
                                    const isDownloading = downloadProgress !== undefined;

                                    return (
                                        <MenuItem
                                            key={lang.code}
                                            value={lang.code}
                                            onClick={() => {
                                                // If clicked and not installed, trigger download logic via onChange wrapper
                                            }}
                                        >
                                            <Box
                                                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}
                                            >
                                                <div style={{ width: 24, height: 16 }}>
                                                    <Flag code={lang.code} />
                                                </div>
                                                <Typography variant="body2" style={{ flexGrow: 1 }}>
                                                    {lang.name}
                                                    {knownWordCounts[lang.code] > 0 && (
                                                        <span
                                                            style={{ marginLeft: 6, opacity: 0.6, fontSize: '0.85em' }}
                                                        >
                                                            ({knownWordCounts[lang.code]})
                                                        </span>
                                                    )}
                                                </Typography>

                                                {/* Status Icons */}
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        color: 'text.secondary',
                                                    }}
                                                >
                                                    {isDownloading ? (
                                                        <Typography
                                                            variant="caption"
                                                            sx={{ fontWeight: 'bold', color: 'primary.main' }}
                                                        >
                                                            {downloadProgress}%
                                                        </Typography>
                                                    ) : isInstalled ? (
                                                        <>
                                                            <CheckCircleIcon />
                                                            {onDeleteDictionary && (
                                                                <Box
                                                                    component="span"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onDeleteDictionary(lang.code);
                                                                    }}
                                                                    sx={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        cursor: 'pointer',
                                                                        opacity: 0.6,
                                                                        '&:hover': { opacity: 1, color: 'error.main' },
                                                                    }}
                                                                    title={t('action.delete')}
                                                                >
                                                                    <Trash2Icon />
                                                                </Box>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <CloudDownloadIcon />
                                                    )}
                                                </Box>
                                            </Box>
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </Grid>

                        {/* Dictionary Shortcut */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                {t('settings.hoverShortcutKey', { defaultValue: 'Dictionary Shortcut' })}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={settings.metheusGlobalHoverShortcut || 'ctrl+D'}
                                onChange={(e) => onSettingChanged('metheusGlobalHoverShortcut', e.target.value)}
                                placeholder="ctrl+D"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                {t('settings.deck')}
                            </Typography>
                            {decks.length > 0 ? (
                                <Select
                                    value={settings.metheusTargetDeckId || ''}
                                    onChange={handleDeckIdChange}
                                    fullWidth
                                    size="small"
                                    displayEmpty
                                >
                                    <MenuItem value="">
                                        <em>{t('settings.defaultDeckLabel')}</em>
                                    </MenuItem>
                                    {decks.map((deck) => (
                                        <MenuItem key={deck.id} value={deck.id}>
                                            {deck.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            ) : (
                                <TextField
                                    label={t('settings.targetDeckIdOptional')}
                                    fullWidth
                                    value={settings.metheusTargetDeckId || ''}
                                    onChange={(e) => onSettingChanged('metheusTargetDeckId', e.target.value)}
                                    size="small"
                                    helperText={t('settings.leaveEmptyForDefault')}
                                />
                            )}
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                {t('settings.noteType')}
                            </Typography>
                            <Select
                                value={settings.metheusNoteType || 'STANDARD'}
                                onChange={handleNoteTypeChange}
                                fullWidth
                                size="small"
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <div
                                            style={{
                                                width: 24,
                                                height: 24,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            {getNoteTypeIcon(selected)}
                                        </div>
                                        <span style={{ color: getNoteTypeColor(selected) }}>
                                            {getNoteTypeLabel(selected)}
                                        </span>
                                    </Box>
                                )}
                            >
                                {safeNoteTypes.length > 0
                                    ? safeNoteTypes.map((nt) => (
                                          <MenuItem key={nt.id} value={nt.id}>
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                  <div
                                                      style={{
                                                          width: 24,
                                                          height: 24,
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          justifyContent: 'center',
                                                      }}
                                                  >
                                                      {getNoteTypeIcon(nt.id)}
                                                  </div>
                                                  <span style={{ color: getNoteTypeColor(nt.id) }}>{nt.name}</span>
                                              </Box>
                                          </MenuItem>
                                      ))
                                    : ['STANDARD', 'CLOZE', 'LISTENING', 'SYNTAX'].map((type) => (
                                          <MenuItem key={type} value={type}>
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                  <div
                                                      style={{
                                                          width: 24,
                                                          height: 24,
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          justifyContent: 'center',
                                                      }}
                                                  >
                                                      {getNoteTypeIcon(type)}
                                                  </div>
                                                  <span style={{ color: getNoteTypeColor(type) }}>
                                                      {getNoteTypeLabel(type)}
                                                  </span>
                                              </Box>
                                          </MenuItem>
                                      ))}
                            </Select>
                        </Grid>
                    </Grid>
                </div>
            )}
        </div>
    );
}
