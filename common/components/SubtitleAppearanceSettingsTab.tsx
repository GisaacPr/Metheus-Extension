import React, { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LockIcon from '@mui/icons-material/Lock';
import UndoIcon from '@mui/icons-material/Undo';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import {
    AsbplayerSettings,
    TextSubtitleSettings,
    changeForTextSubtitleSetting,
    textSubtitleSettingsAreDirty,
    textSubtitleSettingsForTrack,
} from '@metheus/common/settings';
import Typography from '@mui/material/Typography';
import Tooltip from './Tooltip';
import Slider from '@mui/material/Slider';
import Button from '@mui/material/Button';
import SubtitleAppearanceTrackSelector from './SubtitleAppearanceTrackSelector';
import SubtitlePreview from './SubtitlePreview';
import Stack from '@mui/material/Stack';
import SettingsTextField from './SettingsTextField';
import SettingsSection from './SettingsSection';

interface Props {
    settings: AsbplayerSettings;
    onSettingChanged: <K extends keyof AsbplayerSettings>(key: K, value: AsbplayerSettings[K]) => Promise<void>;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    extensionInstalled?: boolean;
    extensionSupportsTrackSpecificSettings?: boolean;
    extensionSupportsSubtitlesWidthSetting?: boolean;
    localFontsAvailable: boolean;
    localFontsPermission?: PermissionState;
    localFontFamilies: string[];
    onUnlockLocalFonts: () => void;
}

const SubtitleAppearanceSettingsTab: React.FC<Props> = ({
    settings,
    onSettingChanged,
    onSettingsChanged,
    extensionInstalled,
    extensionSupportsTrackSpecificSettings,
    localFontsAvailable,
    localFontsPermission,
    localFontFamilies,
    onUnlockLocalFonts,
}) => {
    const { t } = useTranslation();
    const { subtitlePreview, subtitlePositionOffset, topSubtitlePositionOffset } = settings;

    const [selectedSubtitleAppearanceTrack, setSelectedSubtitleAppearanceTrack] = useState<number>();
    const {
        subtitleSize,
        subtitleColor,
        subtitleThickness,
        subtitleBackgroundColor,
        subtitleBackgroundOpacity,
        subtitleFontFamily,
        subtitleAlignment,
    } = textSubtitleSettingsForTrack(settings, selectedSubtitleAppearanceTrack);
    const handleSubtitleTextSettingChanged = useCallback(
        <K extends keyof TextSubtitleSettings>(key: K, value: TextSubtitleSettings[K]) => {
            // See settings.ts for more info about how/why subtitle settings are interpreted
            const diff = changeForTextSubtitleSetting({ [key]: value }, settings, selectedSubtitleAppearanceTrack);
            onSettingsChanged(diff);
        },
        [selectedSubtitleAppearanceTrack, settings, onSettingsChanged]
    );

    const handleResetSubtitleTrack = useCallback(() => {
        const diff = changeForTextSubtitleSetting(
            textSubtitleSettingsForTrack(settings, 0),
            settings,
            selectedSubtitleAppearanceTrack
        );
        onSettingsChanged(diff);
    }, [settings, selectedSubtitleAppearanceTrack, onSettingsChanged]);

    const selectedSubtitleAppearanceTrackIsDirty =
        selectedSubtitleAppearanceTrack !== undefined &&
        textSubtitleSettingsAreDirty(settings, selectedSubtitleAppearanceTrack);

    // Calculate slider value from settings
    const calculateSliderValue = useCallback(() => {
        if (subtitleAlignment === 'bottom') {
            // 0 (bottom-most) to 50 (middle)
            // Offset 0 -> Value 0
            // Offset Max (~20% of screen? Let's use 0-100 scale for offset logic simplicity)
            // Let's assume max reasonable offset is 50vh or so.
            // Simplified: Value = (offset / 10) ?? No, let's map directly.
            // If we assume max offset is 500px.
            // 0 -> 0. 500 -> 50.
            const val = Math.min(50, subtitlePositionOffset / 5);
            return val;
        } else {
            // 51 (middle) to 100 (top-most)
            // Top Offset Max (~500px) -> 51
            // Top Offset 0 -> 100
            // Mapping: 100 - (offset / 5)
            const val = Math.max(51, 100 - topSubtitlePositionOffset / 5);
            return val;
        }
    }, [subtitleAlignment, subtitlePositionOffset, topSubtitlePositionOffset]);

    const handleSliderChange = useCallback(
        (event: Event, newValue: number | number[]) => {
            const value = newValue as number;

            let newAlignment: 'top' | 'bottom' = 'bottom';
            let newOffset = 0;
            let newTopOffset = 0;

            // Hardcode width to 70
            onSettingChanged('subtitlesWidth', 70);

            if (value <= 50) {
                newAlignment = 'bottom';
                // 0 -> 0 offset
                // 50 -> 250 offset (5 * 50)
                newOffset = value * 5;
                newTopOffset = 0; // Not used
            } else {
                newAlignment = 'top';
                // 100 -> 0 offset
                // 51 -> ~250 offset
                newTopOffset = (100 - value) * 5;
                newOffset = 0;
            }

            handleSubtitleTextSettingChanged('subtitleAlignment', newAlignment);
            onSettingChanged('subtitlePositionOffset', newOffset);
            onSettingChanged('topSubtitlePositionOffset', newTopOffset);
        },
        [handleSubtitleTextSettingChanged, onSettingChanged]
    );

    const [sliderValue, setSliderValue] = useState<number>(calculateSliderValue());

    useEffect(() => {
        setSliderValue(calculateSliderValue());
    }, [calculateSliderValue]);

    return (
        <Stack spacing={1}>
            {(!extensionInstalled || extensionSupportsTrackSpecificSettings) && (
                <>
                    <SubtitleAppearanceTrackSelector
                        track={selectedSubtitleAppearanceTrack === undefined ? 'all' : selectedSubtitleAppearanceTrack}
                        onTrackSelected={(t) => setSelectedSubtitleAppearanceTrack(t === 'all' ? undefined : t)}
                    />
                    {selectedSubtitleAppearanceTrack !== undefined && (
                        <Button
                            startIcon={<UndoIcon />}
                            disabled={!selectedSubtitleAppearanceTrackIsDirty}
                            onClick={handleResetSubtitleTrack}
                            variant="outlined"
                        >
                            {t('settings.reset')}
                        </Button>
                    )}
                </>
            )}
            <SubtitlePreview
                subtitleSettings={settings}
                text={subtitlePreview}
                onTextChanged={(text) => onSettingChanged('subtitlePreview', text)}
            />
            <SettingsSection>{t('settings.styling')}</SettingsSection>
            {subtitleColor !== undefined && (
                <SettingsTextField
                    type="color"
                    label={t('settings.subtitleColor')}
                    fullWidth
                    value={subtitleColor}
                    color="primary"
                    onChange={(event) => handleSubtitleTextSettingChanged('subtitleColor', event.target.value)}
                />
            )}
            {subtitleSize !== undefined && (
                <SettingsTextField
                    type="number"
                    label={t('settings.subtitleSize')}
                    fullWidth
                    value={subtitleSize}
                    color="primary"
                    onChange={(event) => handleSubtitleTextSettingChanged('subtitleSize', Number(event.target.value))}
                    slotProps={{
                        htmlInput: {
                            min: 1,
                            step: 1,
                        },
                    }}
                />
            )}
            {subtitleBackgroundColor !== undefined && (
                <SettingsTextField
                    type="color"
                    label={t('settings.subtitleBackgroundColor')}
                    fullWidth
                    value={subtitleBackgroundColor}
                    color="primary"
                    onChange={(event) =>
                        handleSubtitleTextSettingChanged('subtitleBackgroundColor', event.target.value)
                    }
                />
            )}
            {subtitleBackgroundOpacity !== undefined && (
                <SettingsTextField
                    type="number"
                    label={t('settings.subtitleBackgroundOpacity')}
                    fullWidth
                    slotProps={{
                        htmlInput: {
                            min: 0,
                            max: 1,
                            step: 0.1,
                        },
                    }}
                    value={subtitleBackgroundOpacity}
                    color="primary"
                    onChange={(event) =>
                        handleSubtitleTextSettingChanged('subtitleBackgroundOpacity', Number(event.target.value))
                    }
                />
            )}
            {subtitleFontFamily !== undefined && (
                <FormControl fullWidth>
                    <FormLabel>{t('settings.subtitleFontFamily')}</FormLabel>
                    <SettingsTextField
                        type="text"
                        select={localFontFamilies.length > 0}
                        // label={t('settings.subtitleFontFamily')}
                        fullWidth
                        value={subtitleFontFamily}
                        color="primary"
                        onChange={(event) => handleSubtitleTextSettingChanged('subtitleFontFamily', event.target.value)}
                        slotProps={{
                            input: {
                                endAdornment:
                                    localFontFamilies.length === 0 &&
                                    localFontsAvailable &&
                                    localFontsPermission === 'prompt' ? (
                                        <Tooltip title={t('settings.unlockLocalFonts')!}>
                                            <IconButton onClick={onUnlockLocalFonts}>
                                                <LockIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null,
                            },
                        }}
                    >
                        {localFontFamilies.length > 0
                            ? localFontFamilies.map((f) => (
                                  <MenuItem key={f} value={f}>
                                      {f}
                                  </MenuItem>
                              ))
                            : null}
                    </SettingsTextField>
                </FormControl>
            )}

            <SettingsSection>{t('settings.layout')}</SettingsSection>

            <Typography variant="subtitle2" color="textSecondary">
                {t('settings.subtitlePosition')}
            </Typography>
            <Slider
                value={sliderValue}
                onChange={handleSliderChange}
                color="primary"
                min={0}
                max={100}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => {
                    if (value <= 50) return `${t('settings.positionBottom')} ${Math.round(value * 2)}%`;
                    return `${t('settings.positionTop')} ${Math.round((value - 50) * 2)}%`;
                }}
            />
        </Stack>
    );
};

export default SubtitleAppearanceSettingsTab;
