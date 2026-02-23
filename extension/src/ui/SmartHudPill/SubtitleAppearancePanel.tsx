import React, { useState, useEffect } from 'react';
import { AsbplayerSettings } from '@metheus/common/settings';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

const COLORS = [
    { value: '#FFFFFF', label: 'White' },
    { value: '#FFFF00', label: 'Yellow' },
    { value: '#8400ffff', label: 'Purple' },
    { value: '#00FF00', label: 'Green' },
    { value: '#FF0000', label: 'Red' },
    { value: '#FF00FF', label: 'Magenta' },
];

const FONTS = ['sans-serif', 'serif', 'monospace', 'Arial', 'Helvetica', 'Verdana', 'Georgia', 'Courier New'];

interface Props {
    settings: AsbplayerSettings;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    onBack: () => void;
}

const SubtitleAppearancePanel: React.FC<Props> = ({ settings, onSettingsChanged }) => {
    const { t } = useTranslation();
    const calculateLocalPosition = useCallback(() => {
        if (settings.subtitleAlignment === 'top') {
            return 100 - (settings.topSubtitlePositionOffset || 0) / 5;
        }
        return (settings.subtitlePositionOffset || 0) / 5;
    }, [settings.subtitleAlignment, settings.subtitlePositionOffset, settings.topSubtitlePositionOffset]);

    const [localSize, setLocalSize] = useState(settings.subtitleSize || 36);
    const [localOpacity, setLocalOpacity] = useState(settings.subtitleBackgroundOpacity || 0.5);
    const [localPosition, setLocalPosition] = useState(calculateLocalPosition());

    useEffect(() => {
        setLocalSize(settings.subtitleSize || 36);
    }, [settings.subtitleSize]);

    useEffect(() => {
        setLocalOpacity(settings.subtitleBackgroundOpacity || 0.5);
    }, [settings.subtitleBackgroundOpacity]);

    useEffect(() => {
        setLocalPosition(calculateLocalPosition());
    }, [calculateLocalPosition]);

    const handleSizeChange = (_: Event, value: number | number[]) => {
        const val = value as number;
        setLocalSize(val);
    };

    const handleSizeCommit = (_: React.SyntheticEvent | Event, value: number | number[]) => {
        onSettingsChanged({ subtitleSize: value as number });
    };

    const handleOpacityChange = (_: Event, value: number | number[]) => {
        const val = value as number;
        setLocalOpacity(val);
    };

    const handleOpacityCommit = (_: React.SyntheticEvent | Event, value: number | number[]) => {
        onSettingsChanged({ subtitleBackgroundOpacity: value as number });
    };

    const handlePositionChange = (_: Event, value: number | number[]) => {
        const val = value as number;
        setLocalPosition(val);
    };

    const handlePositionCommit = (_: React.SyntheticEvent | Event, value: number | number[]) => {
        onSettingsChanged({ subtitlePositionOffset: value as number });
    };

    const handleColorChange = (_: React.MouseEvent<HTMLElement>, newColor: string | null) => {
        if (newColor) {
            onSettingsChanged({ subtitleColor: newColor });
        }
    };

    const handleFontChange = (event: SelectChangeEvent<string>) => {
        onSettingsChanged({ subtitleFontFamily: event.target.value });
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 1 }}>
            {/* Text Size */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('settings.subtitleSize')}
                    </Typography>
                    <Typography variant="caption" color="primary" fontWeight={600}>
                        {localSize}px
                    </Typography>
                </Box>
                <Slider
                    value={localSize}
                    onChange={handleSizeChange}
                    onChangeCommitted={handleSizeCommit}
                    min={12}
                    max={72}
                    size="small"
                />
            </Box>

            {/* Text Color */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    {t('settings.subtitleColor')}
                </Typography>
                <ToggleButtonGroup
                    value={settings.subtitleColor}
                    exclusive
                    onChange={handleColorChange}
                    size="small"
                    sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                >
                    {COLORS.map((color) => (
                        <ToggleButton
                            key={color.value}
                            value={color.value}
                            sx={{
                                width: 32,
                                height: 32,
                                minWidth: 32,
                                p: 0,
                                backgroundColor: color.value,
                                border: '2px solid',
                                borderColor: settings.subtitleColor === color.value ? 'primary.main' : 'divider',
                                borderRadius: '8px !important',
                                '&:hover': {
                                    backgroundColor: color.value,
                                    opacity: 0.8,
                                },
                                '&.Mui-selected': {
                                    backgroundColor: color.value,
                                    borderColor: 'primary.main',
                                    boxShadow: '0 0 0 2px rgba(56, 189, 248, 0.3)',
                                },
                                '&.Mui-selected:hover': {
                                    backgroundColor: color.value,
                                },
                            }}
                        />
                    ))}
                </ToggleButtonGroup>
            </Box>

            {/* Background Opacity */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('settings.subtitleBackgroundOpacity')}
                    </Typography>
                    <Typography variant="caption" color="primary" fontWeight={600}>
                        {Math.round(localOpacity * 100)}%
                    </Typography>
                </Box>
                <Slider
                    value={localOpacity}
                    onChange={handleOpacityChange}
                    onChangeCommitted={handleOpacityCommit}
                    min={0}
                    max={1}
                    step={0.1}
                    size="small"
                />
            </Box>

            {/* Vertical Position */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('settings.subtitlePositionOffset')}
                    </Typography>
                    <Typography variant="caption" color="primary" fontWeight={600}>
                        {localPosition <= 50
                            ? `${t('settings.subtitleAlignmentBottom')} ${localPosition * 2}%`
                            : `${t('settings.subtitleAlignmentTop')} ${(localPosition - 50) * 2}%`}
                    </Typography>
                </Box>
                <Slider
                    value={localPosition}
                    onChange={handlePositionChange}
                    onChangeCommitted={(_: any, newValue: number | number[]) => {
                        const value = newValue as number;
                        let newAlignment: 'top' | 'bottom' = 'bottom';
                        let newOffset = 0;
                        let newTopOffset = 0;

                        if (value <= 50) {
                            newAlignment = 'bottom';
                            newOffset = value * 5; // Scaling factor from common/components/SubtitleAppearanceSettingsTab.tsx
                            newTopOffset = 0;
                        } else {
                            newAlignment = 'top';
                            newTopOffset = (100 - value) * 5;
                            newOffset = 0;
                        }

                        onSettingsChanged({
                            subtitleAlignment: newAlignment,
                            subtitlePositionOffset: newOffset,
                            topSubtitlePositionOffset: newTopOffset,
                        });
                    }}
                    min={0}
                    max={100}
                    size="small"
                />
            </Box>

            {/* Font Family */}
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {t('settings.subtitleFontFamily')}
                </Typography>
                <Select
                    value={settings.subtitleFontFamily || 'sans-serif'}
                    onChange={handleFontChange}
                    fullWidth
                    size="small"
                >
                    {FONTS.map((font) => (
                        <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                            {font}
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            {/* Blur Text */}
            <FormControlLabel
                control={
                    <Switch
                        checked={settings.subtitleBlur || false}
                        onChange={(e) => onSettingsChanged({ subtitleBlur: e.target.checked })}
                        size="small"
                    />
                }
                label={<Typography variant="body2">{t('settings.subtitleBlur')}</Typography>}
            />
        </Box>
    );
};

export default SubtitleAppearancePanel;
