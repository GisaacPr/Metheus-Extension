import { SettingsStorage } from '@metheus/common/settings';

export interface AppSettingsStorage extends SettingsStorage {
    onSettingsUpdated(callback: () => void): () => void;
}
