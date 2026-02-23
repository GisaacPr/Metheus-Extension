import { AsbplayerSettings, SubtitleListPreference } from '../settings';
import { PageConfigMap } from './SettingsForm';
import { useEffect } from 'react';

interface Props {
    settings: AsbplayerSettings;
    onSettingChanged: <K extends keyof AsbplayerSettings>(key: K, value: AsbplayerSettings[K]) => Promise<void>;
    onSettingsChanged: (settings: Partial<AsbplayerSettings>) => void;
    insideApp?: boolean;
    extensionSupportsOverlay?: boolean;
    extensionSupportsPageSettings?: boolean;
    pageConfigs?: PageConfigMap;
}

const StreamingVideoSettingsTab: React.FC<Props> = ({ settings, onSettingChanged }) => {
    // EL REGIMEN DEL "ACTIVE HAPPY PATH":
    // Enforce "Happy Path" defaults on mount.
    // The user has no choice. This ensures the premium experience.
    useEffect(() => {
        const strictDefaults: Partial<AsbplayerSettings> = {
            // 1. MINING: ALWAYS ON
            streamingRecordMedia: true,
            streamingTakeScreenshot: true,
            streamingCleanScreenshot: true,
            streamingCropScreenshot: true,
            streamingScreenshotDelay: 500,

            // 2. APP INTEGRATION: HARDCODED PRODUCTION
            // streamingAppUrl: 'https://asbplayer.com', // Keep existing or hardcode if needed. Leaving untouched if valid.
            streamingSubtitleListPreference: SubtitleListPreference.noSubtitleList, // Less noise

            // 3. SUBTITLES: MAX CONVENIENCE
            streamingSubsDragAndDrop: true,
            streamingAutoSync: true,
            streamingAutoSyncPromptOnFailure: false, // Don't annoy

            // 4. MISC
            // streamingCondensedPlaybackMinimumSkipIntervalMs: 1000 // Default good value
            streamingDisplaySubtitles: true, // Obviously
            streamingEnableOverlay: true,
        };

        // Apply any setting that deviates from the regime
        for (const [key, value] of Object.entries(strictDefaults)) {
            // @ts-ignore
            if (settings[key] !== value) {
                // @ts-ignore
                onSettingChanged(key as keyof AsbplayerSettings, value);
            }
        }
    }, [settings, onSettingChanged]);

    // RENDER: VACÍA.
    // The visual noise is gone. Only the magic remains.
    return null;
};

export default StreamingVideoSettingsTab;
