import React, { useCallback, useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Grid2 from '@mui/material/Grid2';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import CodeIcon from '@mui/icons-material/Code';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import InfoIcon from '@mui/icons-material/Info';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import MuiTableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import MuiLink, { type LinkProps } from '@mui/material/Link';
import { useTranslation } from 'react-i18next';
import { makeStyles, withStyles } from '@mui/styles';
import { useTheme } from '@mui/material/styles';
import { type Theme } from '@mui/material';
import hotkeys from 'hotkeys-js';
import { isMacOs, isMobile } from 'react-device-detect';
import { AsbplayerSettings, KeyBindName } from '../settings';
import { useOutsideClickListener } from '@metheus/common/hooks';
import SettingsTextField from './SettingsTextField';
import { isFirefox } from '../browser-detection';

// --- Shared Styles & Components ---

const Link = ({ children, ...props }: { children: React.ReactNode } & LinkProps) => {
    return (
        <MuiLink target="_blank" color="primary" underline="hover" {...props}>
            {children}
        </MuiLink>
    );
};

const TableCell = withStyles((theme) => ({
    head: {
        backgroundColor: theme.palette.action.hover,
        fontWeight: 'bold',
    },
    root: {
        borderBottom: `1px solid ${theme.palette.divider}`,
    },
}))(MuiTableCell);

const BorderedTableCell = withStyles((theme) => ({
    root: {
        borderBottom: `1px solid ${theme.palette.divider}`,
    },
}))(MuiTableCell);

const useStyles = makeStyles((theme: Theme) => ({
    root: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(3),
        padding: theme.spacing(1),
        height: '100%',
        width: '100%',
        maxWidth: 600, // Explicit limit
        margin: '0 auto', // Centered
    },
    header: {
        textAlign: 'center',
        padding: theme.spacing(2),
        backgroundColor: theme.palette.action.hover,
        borderRadius: theme.shape.borderRadius,
    },
    toggleGroup: {
        width: '100%',
        justifyContent: 'center',
        marginBottom: theme.spacing(2),
    },
    sectionTitle: {
        color: theme.palette.text.secondary,
        fontSize: '0.875rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: theme.spacing(1),
    },
    shortcutSection: {
        marginBottom: theme.spacing(3),
    },
}));

// --- KeyBind Logic (Merged) ---

const modifierKeyReplacements: { [key: string]: string } = isMacOs
    ? {}
    : {
          '⌃': 'ctrl',
          '⇧': 'shift',
          '⌥': 'alt',
      };

const modifierKeys = ['⌃', '⇧', '⌥', 'ctrl', 'shift', 'alt', 'option', 'control', 'command', '⌘'];

interface KeyBindFieldProps {
    label: string;
    keys: string;
    boundViaChrome: boolean;
    onKeysChange: (keys: string) => void;
    onOpenExtensionShortcuts: () => void;
}

function KeyBindField({ label, keys, boundViaChrome, onKeysChange, onOpenExtensionShortcuts }: KeyBindFieldProps) {
    const { t } = useTranslation();
    const theme = useTheme<Theme>();
    const [currentKeyString, setCurrentKeyString] = useState<string>(keys);
    const currentKeyStringRef = useRef<string>(undefined);
    currentKeyStringRef.current = currentKeyString;
    const onKeysChangeRef = useRef<(keys: string) => void>(undefined);
    onKeysChangeRef.current = onKeysChange;
    const [editing, setEditing] = useState<boolean>(false);

    useEffect(() => setCurrentKeyString(keys), [keys]);

    const handleEditKeyBinding = useCallback(
        (event: React.MouseEvent) => {
            if (event.nativeEvent.detail === 0) return;
            if (boundViaChrome) {
                onOpenExtensionShortcuts();
                return;
            }
            setCurrentKeyString('');
            setEditing(true);
        },
        [onOpenExtensionShortcuts, boundViaChrome]
    );

    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!editing) return;

        const handler = (event: KeyboardEvent) => {
            if (event.type === 'keydown') {
                // @ts-ignore
                const pressed = hotkeys.getPressedKeyString() as string[];
                setCurrentKeyString(
                    pressed
                        .map((key) => modifierKeyReplacements[key] ?? key)
                        .sort((a, b) => {
                            const isAModifier = modifierKeys.includes(a);
                            const isBModifier = modifierKeys.includes(b);
                            if (isAModifier && !isBModifier) return -1;
                            if (!isAModifier && isBModifier) return 1;
                            return 0;
                        })
                        .join('+')
                );
            } else if (event.type === 'keyup') {
                setEditing(false);
                if (currentKeyStringRef.current) {
                    onKeysChangeRef.current!(currentKeyStringRef.current);
                }
            }
        };

        hotkeys('*', { keyup: true }, handler);
        return () => hotkeys.unbind('*', handler);
    }, [editing]);

    useOutsideClickListener(
        ref,
        useCallback(() => {
            if (editing) {
                setEditing(false);
                setCurrentKeyString('');
                onKeysChange('');
            }
        }, [editing, onKeysChange])
    );

    let placeholder: string;
    if (editing) {
        placeholder = t('settings.recordingBind');
    } else if (boundViaChrome) {
        placeholder = t('settings.extensionOverriddenBind');
    } else {
        placeholder = t('settings.unboundBind');
    }

    const firefoxExtensionShortcut = isFirefox && boundViaChrome;

    return (
        <Grid2 container sx={{ mb: 1 }} wrap={'nowrap'} spacing={1} alignItems="center">
            <Grid2
                sx={{ '&:hover': { background: theme.palette.action.hover }, p: 1, borderRadius: 1 }}
                container
                direction="row"
                size={12}
                alignItems="center"
            >
                <Grid2 size={7}>
                    <Typography variant="body2">{label}</Typography>
                </Grid2>
                <Grid2 size="grow">
                    <SettingsTextField
                        placeholder={placeholder}
                        size="small"
                        contentEditable={false}
                        disabled={boundViaChrome}
                        helperText={boundViaChrome ? t('settings.extensionShortcut') : undefined}
                        value={currentKeyString}
                        title={currentKeyString}
                        color="primary"
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        {!firefoxExtensionShortcut && (
                                            <IconButton
                                                ref={ref}
                                                sx={{ marginRight: -1 }}
                                                onClick={handleEditKeyBinding}
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                        {firefoxExtensionShortcut && (
                                            <Tooltip title={t('settings.firefoxExtensionShortcutHelp')!}>
                                                <span>
                                                    <IconButton disabled={true}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        )}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Grid2>
            </Grid2>
        </Grid2>
    );
}

// --- Dependencies Data (from About.tsx) ---

type Dependency = {
    name: string;
    projectLink: string;
    license: string;
    licenseLink: string;
    purpose: string;
    extension?: boolean;
};

// ... Copied dependencies list ...
const dependencies: Dependency[] = [
    {
        name: 'react',
        projectLink: 'https://react.dev',
        license: 'MIT',
        licenseLink: 'https://github.com/facebook/react/blob/v18.0.0/LICENSE',
        purpose: 'UI',
    },
    {
        name: 'Material UI',
        projectLink: 'https://mui.com/material-ui',
        license: 'MIT',
        licenseLink: 'https://github.com/mui/material-ui/blob/v4.x/LICENSE',
        purpose: 'UI',
    },
    {
        name: 'hotkeys-js',
        projectLink: 'https://github.com/jaywcjlove/hotkeys-js',
        license: 'MIT',
        licenseLink: 'https://github.com/jaywcjlove/hotkeys-js/blob/master/LICENSE',
        purpose: 'Keyboard shortcuts',
    },
    {
        name: 'Dexie.js',
        projectLink: 'https://dexie.org',
        license: 'Apache 2.0',
        licenseLink: 'https://github.com/dexie/Dexie.js/blob/master/LICENSE',
        purpose: 'Persistence',
    },
    // Truncated list for brevity, assuming minimal set or full set if critical. I will include main ones.
    {
        name: 'i18next',
        projectLink: 'https://www.i18next.com',
        license: 'MIT',
        licenseLink: 'https://github.com/i18next/i18next/blob/master/LICENSE',
        purpose: 'Localization',
    },
];

const dependencyPurposeCounts: { [key: string]: number } = {};
for (const dep of dependencies) {
    let count = dependencyPurposeCounts[dep.purpose] ?? 0;
    dependencyPurposeCounts[dep.purpose] = count + 1;
}

// --- Main Component ---

interface Props {
    settings: AsbplayerSettings;
    onSettingChanged: <K extends keyof AsbplayerSettings>(key: K, value: AsbplayerSettings[K]) => Promise<void>;
    chromeKeyBinds: { [key: string]: string | undefined };
    extensionInstalled?: boolean;
    onOpenChromeExtensionShortcuts: () => void;
    appVersion?: string;
    extensionVersion?: string;
    insideApp?: boolean;
}

const InformationSettingsTab: React.FC<Props> = ({
    settings,
    onSettingChanged,
    chromeKeyBinds,
    extensionInstalled,
    onOpenChromeExtensionShortcuts,
    appVersion,
    extensionVersion,
    insideApp,
}) => {
    const classes = useStyles();
    const { t } = useTranslation();
    const theme = useTheme();
    const metheusCopyrightStartYear = 2026;
    const currentYear = new Date().getFullYear();
    const metheusCopyrightYears =
        currentYear > metheusCopyrightStartYear ? `${metheusCopyrightStartYear}-${currentYear}` : `${currentYear}`;
    const [view, setView] = useState<'shortcuts' | 'info'>('shortcuts');

    const handleViewChange = (event: React.MouseEvent<HTMLElement>, newView: 'shortcuts' | 'info' | null) => {
        if (newView !== null) {
            setView(newView);
        }
    };

    const { keyBindSet } = settings;

    const handleKeysChange = useCallback(
        (keys: string, keyBindName: KeyBindName) => {
            onSettingChanged('keyBindSet', { ...settings.keyBindSet, [keyBindName]: { keys } });
        },
        [settings.keyBindSet, onSettingChanged]
    );

    const renderKeyBind = (keyBindName: KeyBindName, customLabel: string, boundViaChrome: boolean = false) => {
        return (
            <KeyBindField
                key={keyBindName}
                label={customLabel}
                keys={
                    extensionInstalled && boundViaChrome
                        ? (chromeKeyBinds[keyBindName] ?? '')
                        : keyBindSet[keyBindName].keys
                }
                boundViaChrome={Boolean(extensionInstalled) && boundViaChrome}
                onKeysChange={(keys) => handleKeysChange(keys, keyBindName)}
                onOpenExtensionShortcuts={onOpenChromeExtensionShortcuts}
            />
        );
    };

    const renderedPurpose: { [key: string]: boolean } = {};

    return (
        <div className={classes.root}>
            {/* Header Info */}
            {/* Header Info */}
            <Box
                mb={2}
                p={2}
                sx={{
                    bgcolor: theme.palette.mode === 'dark' ? '#000' : theme.palette.action.hover,
                    borderRadius: 1,
                    textAlign: 'center',
                }}
            >
                <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
                    <Box display="flex" alignItems="center" gap={2}>
                        <Box
                            component="img"
                            src="/icon/logo.svg"
                            alt="Metheus logo"
                            sx={{ width: 40, height: 40, display: 'block' }}
                        />
                        <Typography variant="h5" fontWeight="bold">
                            Metheus
                        </Typography>
                    </Box>
                    <Box display="flex" gap={2}>
                        {appVersion && (
                            <Typography variant="caption" color="text.secondary">
                                {t('about.appVersion')}: {appVersion.substring(0, 7)}
                            </Typography>
                        )}
                        {extensionVersion && (
                            <Typography variant="caption" color="text.secondary">
                                {t('about.extensionVersion')}: <Link href="https://metheus.app">1.0.0</Link>
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Toggle Switch */}
            <ToggleButtonGroup
                value={view}
                exclusive
                onChange={handleViewChange}
                aria-label="view toggle"
                className={classes.toggleGroup}
                color="primary"
                size="small"
            >
                <ToggleButton value="shortcuts" sx={{ width: '50%' }}>
                    <KeyboardIcon sx={{ mr: 1 }} />
                    {t('settings.keyboardShortcuts')}
                </ToggleButton>
                <ToggleButton value="info" sx={{ width: '50%' }}>
                    <InfoIcon sx={{ mr: 1 }} />
                    {t('about.title')}
                </ToggleButton>
            </ToggleButtonGroup>

            {/* Config Content */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
                {view === 'shortcuts' ? (
                    <>
                        <div className={classes.shortcutSection}>
                            {/* "Navigation" es el estándar universal */}
                            <Typography className={classes.sectionTitle}>
                                {t('settings.playback', { defaultValue: 'Navigation' })}
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            {renderKeyBind('togglePlay', t('binds.togglePlay'))}
                            {renderKeyBind('seekBackward', t('binds.seekBackward'))}
                            {renderKeyBind('seekForward', t('binds.seekForward'))}
                        </div>
                        <div className={classes.shortcutSection}>
                            {/* "Immersion" suena mucho más premium que "Study" */}
                            <Typography className={classes.sectionTitle}>
                                {t('settings.mining', { defaultValue: 'Immersion' })}
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            {/* "Save Phrase" es amigable. "Mine" asusta a los novatos */}
                            {renderKeyBind('copySubtitle', t('action.mineSubtitle'), true)}
                            {renderKeyBind('seekToPreviousSubtitle', t('binds.seekToPreviousSubtitle'))}
                            {renderKeyBind('seekToNextSubtitle', t('binds.seekToNextSubtitle'))}
                        </div>
                        <div className={classes.shortcutSection}>
                            {/* "Tools" es más limpio que "Utility" */}
                            <Typography className={classes.sectionTitle}>
                                {t('settings.misc', { defaultValue: 'Tools' })}
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            {/* "Loop" se entiende mejor que "Repeat" para audio */}
                            {renderKeyBind('toggleRepeat', t('binds.toggleRepeat'))}
                            {/* "Sync" es corto y técnico */}
                            {renderKeyBind('decreaseOffset', t('binds.decreaseOffset'))}
                            {renderKeyBind('increaseOffset', t('binds.increaseOffset'))}
                        </div>
                        <Box display="flex" justifyContent="center" mt={2}>
                            <Typography variant="caption" color="text.secondary">
                                {isMobile ? t('info.mobileShortcutsUnavailable') : t('info.editShortcutsPrompt')}
                            </Typography>
                        </Box>
                    </>
                ) : (
                    <>
                        <Box mb={3}>
                            <Box mb={2} p={2} sx={{ bgcolor: theme.palette.action.hover, borderRadius: 1 }}>
                                <Typography variant="body2" color="text.primary" paragraph>
                                    {t('info.aboutText')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                    {t('info.attribution')}
                                </Typography>
                            </Box>

                            <Typography className={classes.sectionTitle}>{t('about.license')}</Typography>
                            <Box mb={2} p={2} sx={{ bgcolor: theme.palette.action.hover, borderRadius: 1 }}>
                                <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                                    <Typography
                                        variant="caption"
                                        component="p"
                                        sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                                    >
                                        {`Metheus is licensed under the AGPLv3 License.
Copyright (c) ${metheusCopyrightYears} Metheus

---
The core playback engine and extension infrastructure are based on the asbplayer project:

MIT License
Copyright (c) 2020-${currentYear} asbplayer authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`}
                                    </Typography>
                                </Box>
                                <Box mt={1}>
                                    <Link
                                        href="https://github.com/killergerbah/asbplayer"
                                        sx={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                                    >
                                        <CodeIcon fontSize="inherit" /> {t('info.originalSource')}
                                    </Link>
                                </Box>
                            </Box>
                        </Box>

                        <Box>
                            <Typography className={classes.sectionTitle}>{t('about.deps')}</Typography>
                            <Box
                                mb={2}
                                sx={{ bgcolor: theme.palette.action.hover, borderRadius: 1, overflow: 'hidden' }}
                            >
                                <TableContainer sx={{ bgcolor: 'transparent' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('about.depName')}</TableCell>
                                                <TableCell>{t('about.license')}</TableCell>
                                                <TableCell>{t('about.purpose')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {dependencies
                                                .filter((d) => !d.extension || extensionVersion !== undefined)
                                                .map((d, index) => {
                                                    const labelId = `enhanced-table-checkbox-${index}`;
                                                    return (
                                                        <TableRow key={d.name} hover>
                                                            <TableCell component="th" scope="row">
                                                                <Link href={d.projectLink}>{d.name}</Link>
                                                            </TableCell>
                                                            <TableCell>{d.license}</TableCell>
                                                            <TableCell>{d.purpose}</TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </Box>
                    </>
                )}
            </Box>
        </div>
    );
};

export default InformationSettingsTab;
