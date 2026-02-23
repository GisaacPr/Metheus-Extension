import { Command, SettingsUpdatedMessage } from '@metheus/common';
import { AsbplayerSettings, SettingsProvider } from '@metheus/common/settings';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsProfileContext } from '@metheus/common/hooks/use-settings-profile-context';

export const useSettings = () => {
    const settingsProvider = useMemo<SettingsProvider>(() => new SettingsProvider(new ExtensionSettingsStorage()), []);
    const [settings, setSettings] = useState<AsbplayerSettings>();
    const refreshSettings = useCallback(() => settingsProvider.getAll().then(setSettings), [settingsProvider]);

    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    useEffect(() => {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.message?.command === 'settings-updated') {
                settingsProvider.getAll().then(setSettings);
            }
        });
    }, [settingsProvider]);

    const notifySettingsUpdated = useCallback(() => {
        const command: Command<SettingsUpdatedMessage> = {
            sender: 'asbplayer-settings',
            message: {
                command: 'settings-updated',
            },
        };
        browser.runtime.sendMessage(command);
    }, []);

    const onSettingsChanged = useCallback(
        (newSettings: Partial<AsbplayerSettings>) => {
            // AUTO-SYNC: When theme changes, update subtitle colors automatically
            // Dark theme → black background + white text
            // Light theme → white background + black text
            if (newSettings.themeType !== undefined) {
                const isDark = newSettings.themeType === 'dark';
                newSettings = {
                    ...newSettings,
                    subtitleColor: isDark ? '#ffffff' : '#000000',
                    subtitleBackgroundColor: isDark ? '#000000' : '#ffffff',
                };
            }

            setSettings((s) => ({ ...s!, ...newSettings }));
            settingsProvider.set(newSettings).then(() => notifySettingsUpdated());
        },
        [settingsProvider, notifySettingsUpdated]
    );

    const handleProfileChanged = useCallback(() => {
        refreshSettings();
        notifySettingsUpdated();
    }, [refreshSettings, notifySettingsUpdated]);

    const profileContext = useSettingsProfileContext({ settingsProvider, onProfileChanged: handleProfileChanged });
    return { settings, onSettingsChanged, profileContext, settingsProvider };
};
