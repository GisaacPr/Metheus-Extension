import { useEffect, useMemo, useState } from 'react';
import SidePanel from './SidePanel';
import { createTheme } from '@metheus/common/theme';
import { AsbplayerSettings, SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
import { ExtensionMessage, useChromeExtension } from '@metheus/common/app';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import CssBaseline from '@mui/material/CssBaseline';
import Paper from '@mui/material/Paper';
import { StyledEngineProvider } from '@mui/material/styles';

const settingsProvider = new SettingsProvider(new ExtensionSettingsStorage());

const SidePanelUi = () => {
    const [settings, setSettings] = useState<AsbplayerSettings>();
    const extension = useChromeExtension({ component: 'sidePanel' });
    const theme = useMemo(() => settings && createTheme(settings.themeType), [settings]);

    useEffect(() => {
        settingsProvider.getAll().then(setSettings);
    }, []);

    useEffect(() => {
        return extension.subscribe((message: ExtensionMessage) => {
            if (message.data.command === 'settings-updated') {
                settingsProvider.getAll().then(setSettings);
            }
        });
    }, [extension]);

    const handleSettingsChanged = async (newSettings: Partial<AsbplayerSettings>) => {
        await settingsProvider.set(newSettings);
        // CRITICAL: Broadcast to video page so subtitles update in real-time
        browser.runtime.sendMessage({
            sender: 'asbplayer-settings',
            message: { command: 'settings-updated' },
        });
        const current = await settingsProvider.getAll();
        setSettings(current);
    };

    if (!settings || theme === undefined) {
        return null;
    }

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Paper square style={{ width: '100%', height: '100%' }}>
                    <SidePanel settings={settings} extension={extension} onSettingsChanged={handleSettingsChanged} />
                </Paper>
            </ThemeProvider>
        </StyledEngineProvider>
    );
};

export default SidePanelUi;
