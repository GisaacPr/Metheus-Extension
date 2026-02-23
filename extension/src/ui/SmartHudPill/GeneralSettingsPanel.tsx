import React from 'react';
import { AsbplayerSettings } from '@metheus/common/settings';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import CircularProgress from '@mui/material/CircularProgress';
import { Flag } from '@metheus/common/components/Flag';
import { useTranslation } from 'react-i18next';
import { supportedLanguages as SUPPORTED_LANG_CODES } from '@metheus/common/settings';

const getSupportedLanguages = (i18nLang: string) =>
    SUPPORTED_LANG_CODES.map((code: string) => ({
        code,
        name:
            new Intl.DisplayNames([i18nLang], { type: 'language' }).of(
                code === 'pt_BR' ? 'pt-BR' : code === 'zh_CN' ? 'zh-CN' : code
            ) || code,
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
const CloudDownloadIcon = () => (
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
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
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

// Note Type Icons
const StarIcon = () => (
    <svg
        width="18"
        height="18"
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
        width="18"
        height="18"
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
        width="18"
        height="18"
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
        width="18"
        height="18"
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

interface Props {
    settings: AsbplayerSettings;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    onBack: () => void;
    installedDictionaries?: Record<string, boolean>;
    downloadingDictionaries?: Record<string, number>;
    onManageDictionary?: (langCode: string) => void;
    onDeleteDictionary?: (langCode: string) => void;
    knownWordCounts?: Record<string, number>;
    decks?: { id: string; name: string }[];
    noteTypes?: { id: string; name: string }[];
}

const GeneralSettingsPanel: React.FC<Props> = ({
    settings,
    onSettingsChanged,
    installedDictionaries = {},
    downloadingDictionaries = {},
    onManageDictionary,
    onDeleteDictionary,
    knownWordCounts = {},
    decks = [],
    noteTypes = [],
}) => {
    const { t, i18n } = useTranslation();
    const safeNoteTypes = sanitizeNoteTypes(noteTypes);
    const supportedLanguages = getSupportedLanguages(i18n.language);

    const handleThemeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newTheme = event.target.value as 'light' | 'dark';
        onSettingsChanged({
            themeType: newTheme,
            subtitleColor: newTheme === 'dark' ? '#ffffff' : '#000000',
            subtitleBackgroundColor: newTheme === 'dark' ? '#000000' : '#ffffff',
            // Dynamic Shadows
            subtitleShadowColor: newTheme === 'dark' ? '#000000' : '#ffffff',
            subtitleShadowThickness: 3,
        });
    };

    const handleLanguageChange = (event: SelectChangeEvent<string>) => {
        onSettingsChanged({ language: event.target.value });
    };

    const handleTargetLanguageChange = (event: SelectChangeEvent<string>) => {
        onSettingsChanged({ metheusTargetLanguage: event.target.value });
    };

    const handleDeckIdChange = (event: SelectChangeEvent<string>) => {
        onSettingsChanged({ metheusTargetDeckId: event.target.value });
    };

    const handleNoteTypeChange = (event: SelectChangeEvent<string>) => {
        onSettingsChanged({ metheusNoteType: event.target.value as any });
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
                return t('settings.noteTypeCloze', { defaultValue: 'Cloze' });
            case 'LISTENING':
                return t('settings.noteTypeListening', { defaultValue: 'Listening' });
            case 'SYNTAX':
                return t('settings.noteTypeSyntax', { defaultValue: 'Syntax' });
            default:
                return t('settings.noteTypeStandard', { defaultValue: 'Standard' });
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 1 }}>
            {/* Theme */}
            <FormControl component="fieldset" size="small">
                <FormLabel component="legend" sx={{ mb: 1, fontSize: '0.875rem' }}>
                    {t('settings.theme')}
                </FormLabel>
                <RadioGroup row value={settings.themeType} onChange={handleThemeChange}>
                    <FormControlLabel value="light" control={<Radio size="small" />} label={t('settings.themeLight')} />
                    <FormControlLabel value="dark" control={<Radio size="small" />} label={t('settings.themeDark')} />
                </RadioGroup>
            </FormControl>

            {/* Interface Language */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {t('settings.language')}
                </Typography>
                <Select
                    value={settings.language || 'en'}
                    onChange={handleLanguageChange}
                    fullWidth
                    size="small"
                    renderValue={(selected) => {
                        const lang = supportedLanguages.find((l) => l.code === selected);
                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{ width: 24, height: 16 }}>
                                    <Flag code={selected} />
                                </Box>
                                {lang?.name || selected}
                            </Box>
                        );
                    }}
                >
                    {supportedLanguages.map((lang) => (
                        <MenuItem key={lang.code} value={lang.code}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{ width: 24, height: 16 }}>
                                    <Flag code={lang.code} />
                                </Box>
                                {lang.name}
                            </Box>
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            {/* Target Language */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {t('settings.targetLanguage', { defaultValue: 'Target Language' })}
                </Typography>
                <Select
                    value={settings.metheusTargetLanguage || 'en'}
                    onChange={handleTargetLanguageChange}
                    fullWidth
                    size="small"
                    renderValue={(selected) => {
                        const lang = supportedLanguages.find((l) => l.code === selected);
                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                <Box sx={{ width: 24, height: 16 }}>
                                    <Flag code={selected} />
                                </Box>
                                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                                    {lang?.name || selected}
                                </Typography>
                            </Box>
                        );
                    }}
                >
                    {supportedLanguages.map((lang) => {
                        const isInstalled = installedDictionaries[lang.code];
                        const downloadProgress = downloadingDictionaries[lang.code];
                        const isDownloading = downloadProgress !== undefined;

                        return (
                            <MenuItem key={lang.code} value={lang.code}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                    <Box sx={{ width: 24, height: 16 }}>
                                        <Flag code={lang.code} />
                                    </Box>
                                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                                        {lang.name}
                                        {knownWordCounts[lang.code] > 0 && (
                                            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '0.85em' }}>
                                                ({knownWordCounts[lang.code]})
                                            </span>
                                        )}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
            </Box>

            {/* Target Deck */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {t('settings.hoverShortcutKey', { defaultValue: 'Dictionary Shortcut' })}
                </Typography>
                <TextField
                    value={settings.metheusGlobalHoverShortcut || 'ctrl+D'}
                    onChange={(e) => onSettingsChanged({ metheusGlobalHoverShortcut: e.target.value })}
                    fullWidth
                    size="small"
                    placeholder="ctrl+D"
                />
            </Box>

            {/* Target Deck */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
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
                            <em>{t('settings.defaultDeckLabel', { defaultValue: 'Default Deck' })}</em>
                        </MenuItem>
                        {decks.map((deck) => (
                            <MenuItem key={deck.id} value={deck.id}>
                                {deck.name}
                            </MenuItem>
                        ))}
                    </Select>
                ) : (
                    <TextField
                        label={t('settings.targetDeckIdOptional', { defaultValue: 'Target Deck ID (optional)' })}
                        value={settings.metheusTargetDeckId || ''}
                        onChange={(e) => onSettingsChanged({ metheusTargetDeckId: e.target.value })}
                        fullWidth
                        size="small"
                        helperText={t('settings.leaveEmptyForDefault', {
                            defaultValue: 'Leave empty to use default deck',
                        })}
                    />
                )}
            </Box>

            {/* Note Type */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {t('settings.noteType')}
                </Typography>
                <Select
                    value={settings.metheusNoteType || 'STANDARD'}
                    onChange={handleNoteTypeChange}
                    fullWidth
                    size="small"
                    renderValue={(selected) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {getNoteTypeIcon(selected)}
                            <span style={{ color: getNoteTypeColor(selected) }}>{getNoteTypeLabel(selected)}</span>
                        </Box>
                    )}
                >
                    {safeNoteTypes.length > 0
                        ? safeNoteTypes.map((nt) => (
                              <MenuItem key={nt.id} value={nt.id}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                      {getNoteTypeIcon(nt.id)}
                                      <span style={{ color: getNoteTypeColor(nt.id) }}>{nt.name}</span>
                                  </Box>
                              </MenuItem>
                          ))
                        : ['STANDARD', 'CLOZE', 'LISTENING', 'SYNTAX'].map((type) => (
                              <MenuItem key={type} value={type}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                      {getNoteTypeIcon(type)}
                                      <span style={{ color: getNoteTypeColor(type) }}>{getNoteTypeLabel(type)}</span>
                                  </Box>
                              </MenuItem>
                          ))}
                </Select>
            </Box>
        </Box>
    );
};

export default GeneralSettingsPanel;
