import { AsbplayerSettings, KeyBindName } from '../settings';
import { useTranslation } from 'react-i18next';
import { isMacOs } from 'react-device-detect';
import { makeStyles, useTheme } from '@mui/styles';
import { type Theme } from '@mui/material';
import { useOutsideClickListener } from '@metheus/common/hooks';
import hotkeys from 'hotkeys-js';
import Grid2 from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';
import SettingsTextField from './SettingsTextField';
import { isFirefox } from '../browser-detection';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';

// hotkeys only returns strings for a Mac while requiring the OS-specific keys for the actual binds
const modifierKeyReplacements: { [key: string]: string } = isMacOs
    ? {}
    : {
          '⌃': 'ctrl',
          '⇧': 'shift',
          '⌥': 'alt',
      };

const modifierKeys = ['⌃', '⇧', '⌥', 'ctrl', 'shift', 'alt', 'option', 'control', 'command', '⌘'];

const useKeyBindFieldStyles = makeStyles<Theme>((theme) => ({
    container: {
        marginBottom: theme.spacing(1),
    },
    labelItem: {
        marginTop: theme.spacing(1),
    },
}));

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
    const classes = useKeyBindFieldStyles();
    const [currentKeyString, setCurrentKeyString] = useState<string>(keys);
    const currentKeyStringRef = useRef<string>(undefined);
    currentKeyStringRef.current = currentKeyString;
    const onKeysChangeRef = useRef<(keys: string) => void>(undefined);
    onKeysChangeRef.current = onKeysChange;
    const [editing, setEditing] = useState<boolean>(false);

    useEffect(() => setCurrentKeyString(keys), [keys]);

    const handleEditKeyBinding = useCallback(
        (event: React.MouseEvent) => {
            if (event.nativeEvent.detail === 0) {
                return;
            }

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
        if (!editing) {
            return;
        }

        const handler = (event: KeyboardEvent) => {
            if (event.type === 'keydown') {
                // The ts declaration is missing getPressedKeyString()
                // @ts-ignore
                const pressed = hotkeys.getPressedKeyString() as string[];
                setCurrentKeyString(
                    pressed
                        .map((key) => {
                            return modifierKeyReplacements[key] ?? key;
                        })
                        .sort((a, b) => {
                            const isAModifier = modifierKeys.includes(a);
                            const isBModifier = modifierKeys.includes(b);

                            if (isAModifier && !isBModifier) {
                                return -1;
                            }

                            if (!isAModifier && isBModifier) {
                                return 1;
                            }

                            return 0;
                        })
                        .join('+')
                );
            } else if (event.type === 'keyup') {
                setEditing(false);

                // Need to use refs because hotkeys returns the wrong keys
                // if the handler is bound/unbound.
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
        <Grid2 container className={classes.container} wrap={'nowrap'} spacing={1} alignItems="center">
            <Grid2
                sx={{ '&:hover': { background: theme.palette.action.hover }, p: 1, borderRadius: 1 }}
                container
                direction="row"
                size={12}
                alignItems="center"
            >
                <Grid2 className={classes.labelItem} size={7.5}>
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

interface Props {
    settings: AsbplayerSettings;
    onSettingChanged: <K extends keyof AsbplayerSettings>(key: K, value: AsbplayerSettings[K]) => Promise<void>;
    chromeKeyBinds: { [key: string]: string | undefined };
    extensionInstalled?: boolean;
    onOpenChromeExtensionShortcuts: () => void;
}

const KeyboardShortcutsSettingsTab: React.FC<Props> = ({
    settings,
    onSettingChanged,
    chromeKeyBinds,
    extensionInstalled,
    onOpenChromeExtensionShortcuts,
}) => {
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

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 1 }}>
            {/* Navegación */}
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <Typography
                    variant="h6"
                    gutterBottom
                    sx={{
                        color: 'text.secondary',
                        fontSize: '0.9rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: 'bold',
                    }}
                >
                    Navegación
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {renderKeyBind('togglePlay', 'Play / Pause')}
                {renderKeyBind('seekBackward', 'Retroceder 5s')}
                {renderKeyBind('seekForward', 'Avanzar 5s')}
            </Paper>

            {/* Estudio */}
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <Typography
                    variant="h6"
                    gutterBottom
                    sx={{
                        color: 'text.secondary',
                        fontSize: '0.9rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: 'bold',
                    }}
                >
                    Estudio
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {renderKeyBind('copySubtitle', 'Guardar Frase', true)}
                {renderKeyBind('seekToPreviousSubtitle', 'Frase Anterior')}
                {renderKeyBind('seekToNextSubtitle', 'Frase Siguiente')}
            </Paper>

            {/* Utilidad */}
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <Typography
                    variant="h6"
                    gutterBottom
                    sx={{
                        color: 'text.secondary',
                        fontSize: '0.9rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: 'bold',
                    }}
                >
                    Utilidad
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {renderKeyBind('toggleRepeat', 'Repetir Frase')}
                {renderKeyBind('decreaseOffset', 'Sincronizar -100ms')}
                {renderKeyBind('increaseOffset', 'Sincronizar +100ms')}
            </Paper>
        </Box>
    );
};

export default KeyboardShortcutsSettingsTab;
