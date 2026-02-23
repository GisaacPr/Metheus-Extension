/**
 * METHEUS SYNC SERVICE
 *
 * Handles synchronization of known words and vocabulary data
 * between the extension and the Metheus platform.
 */

import { SettingsProvider } from '@metheus/common/settings';

export type WordStatus = 0 | 1 | 2 | 3 | 4 | 5;

export const WordStatusLabels: Record<WordStatus, string> = {
    0: 'unknown',
    1: 'learning',
    2: 'familiar',
    3: 'almost-known',
    4: 'known',
    5: 'known',
};

export interface KnownWord {
    word: string;
    language: string;
    status: WordStatus;
    lastSeen?: number;
    encounters?: number;
}

export interface SyncStatus {
    lastSyncTimestamp: number;
    pendingChanges: number;
    isOnline: boolean;
}

export interface SyncResult {
    success: boolean;
    itemsSynced: number;
    errors?: string[];
}

export interface ExtensionStats {
    streak: number;
    dailyGoalCurrent: number;
    dailyGoalTotal: number;
    totalKnownWords: number;
    lastUpdated: number;
}

export interface MetheusBridgeConfig {
    decks?: { id: string; name: string }[];
    noteTypes?: { id: string; name: string }[];
    nativeLanguage?: string;
    targetLanguage?: string;
    miningDeckId?: string;
    interfaceLanguage?: string;
    knownWords?: KnownWord[] | Record<string, KnownWord>;
    vocabularyCache?: KnownWord[] | Record<string, KnownWord>;
    vocabulary?: KnownWord[] | Record<string, KnownWord>;
}

const SUPPORTED_NOTE_TYPES = new Set(['STANDARD', 'CLOZE', 'LISTENING', 'SYNTAX']);
const DEFAULT_NOTE_TYPES = [
    { id: 'STANDARD', name: 'STANDARD' },
    { id: 'CLOZE', name: 'CLOZE' },
    { id: 'LISTENING', name: 'LISTENING' },
    { id: 'SYNTAX', name: 'SYNTAX' },
];

export class MetheusSyncService {
    private readonly _settingsProvider: SettingsProvider;
    private _syncInProgress: boolean = false;
    private _lastSyncTimestamp: number = 0;
    private _pendingWords: Map<string, KnownWord> = new Map();
    private _initPromise: Promise<void> | null = null;

    // Config cache (received from Web App via bridge)
    private _cachedDecks: { id: string; name: string }[] = [{ id: 'default', name: 'Default' }];
    private _cachedNoteTypes: { id: string; name: string }[] = [{ id: 'STANDARD', name: 'Standard' }];
    private _cachedNativeLanguage: string = 'es';
    private _cachedTargetLanguage: string = 'en';
    private _cachedMiningDeckId: string = '';
    private _cachedInterfaceLanguage: string = 'en';

    // Stats Cache
    private _stats: ExtensionStats = {
        streak: 0,
        dailyGoalCurrent: 0,
        dailyGoalTotal: 20,
        totalKnownWords: 0,
        lastUpdated: 0,
    };

    // Daily Mining Tracking
    private _dailyMinedKey: string = '';
    private _dailyMinedCount: number = 0;
    private _lastActivityDateKey: string = '';

    // Local cache of known words for quick lookups
    private _knownWordsCache: Map<string, KnownWord> = new Map();
    private _cacheLoaded: boolean = false;
    private _temporarilyMutedTabIds: Map<number, number> = new Map();

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
        // Start loading cache immediately and store the promise
        this._initPromise = this._initCache();
    }

    /**
     * Wait for the initial cache load to complete
     */
    async waitForCache(): Promise<void> {
        if (this._initPromise) {
            await this._initPromise;
        }
    }

    private _isExtensionContext(): boolean {
        // Robust check for Extension Context vs Content Script
        // Content Scripts have access to 'browser.runtime' but NOT 'browser.tabs'
        // Background/Popup/Options have access to 'browser.tabs'
        try {
            // @ts-ignore
            if (typeof browser !== 'undefined' && browser.tabs) {
                return true;
            }
            // Fallback for Service Workers or distinct contexts
            if (typeof window === 'undefined') return true;

            return (
                window.location.protocol.startsWith('chrome-extension:') ||
                window.location.protocol.startsWith('moz-extension:')
            );
        } catch (e) {
            return false;
        }
    }

    /**
     * Initialize cache from persistent storage
     */
    private async _initCache(): Promise<void> {
        if (this._cacheLoaded) return;

        try {
            // Load from browser storage (persistent across reloads)
            // @ts-ignore - browser is global in WebExtensions
            const res = await browser.storage.local.get([
                'ln_vocabulary_cache',
                'ln_last_sync_ts',
                'ln_pending_changes',
                'ln_stats',
                'ln_cached_decks',
                'ln_cached_note_types',
                'ln_cached_native_language',
                'ln_cached_target_language',
                'ln_cached_mining_deck_id',
                'ln_cached_interface_language',
            ]);
            const cachedData = res.ln_vocabulary_cache;

            if (res.ln_stats) {
                this._stats = res.ln_stats;
            }
            if (typeof res.ln_streak_last_activity_date === 'string') {
                this._lastActivityDateKey = res.ln_streak_last_activity_date;
            }
            const lastSync = res.ln_last_sync_ts;

            if (cachedData) {
                // Restore Map from object
                Object.entries(cachedData).forEach(([key, word]) => {
                    this._knownWordsCache.set(key, word as KnownWord);
                });
                console.log(`[LN Sync] Restored ${this._knownWordsCache.size} words from persistent storage`);
            }

            if (lastSync) {
                this._lastSyncTimestamp = lastSync;
            }

            // Also restore pending changes
            const pending = res.ln_pending_changes;
            if (pending) {
                Object.entries(pending).forEach(([key, word]) => {
                    this._pendingWords.set(key, word as KnownWord);
                });
            }

            // Restore cached config (decks, noteTypes from Web App)
            if (res.ln_cached_decks) {
                this._cachedDecks = res.ln_cached_decks;
            }
            if (res.ln_cached_note_types) {
                this._cachedNoteTypes = res.ln_cached_note_types;
            }
            if (typeof res.ln_cached_native_language === 'string') {
                this._cachedNativeLanguage = res.ln_cached_native_language;
            }
            if (typeof res.ln_cached_target_language === 'string') {
                this._cachedTargetLanguage = res.ln_cached_target_language;
            }
            if (typeof res.ln_cached_mining_deck_id === 'string') {
                this._cachedMiningDeckId = res.ln_cached_mining_deck_id;
            }
            if (typeof res.ln_cached_interface_language === 'string') {
                this._cachedInterfaceLanguage = res.ln_cached_interface_language;
            }

            this._cacheLoaded = true;
        } catch (error) {
            console.error('[LN Sync] Failed to init cache:', error);
            this._cacheLoaded = true; // Still mark as loaded to attempt fresh load
        }

        // Initialize daily count
        await this._refreshDailyCount();
    }

    /**
     * Load known words for a language.
     * Previously fetched from a server API (which never existed).
     * Now simply ensures the local storage cache is loaded.
     */
    async loadKnownWords(_language?: string): Promise<void> {
        await this._initCache();
    }

    // E-H4 FIX: Use chrome.storage.session instead of localStorage (not available in MV3 Service Worker)
    private async _refreshDailyCount() {
        const today = new Date().toISOString().split('T')[0];
        const key = `ln_daily_mined_${today}`;

        if (this._dailyMinedKey !== key) {
            // New day or first load
            this._dailyMinedKey = key;
            try {
                const result = await chrome.storage.session.get(key);
                this._dailyMinedCount = result[key] ? parseInt(result[key], 10) : 0;
            } catch {
                this._dailyMinedCount = 0;
            }
        } else {
            try {
                const result = await chrome.storage.session.get(key);
                if (result[key]) this._dailyMinedCount = parseInt(result[key], 10);
            } catch {
                // Keep in-memory value
            }
        }
    }

    getDailyMinedCount(): number {
        // E-H4: _refreshDailyCount is now async, so return cached value
        return this._dailyMinedCount;
    }

    async incrementDailyMinedCount() {
        this._dailyMinedCount++;
        // E-H4 FIX: Use chrome.storage.session instead of localStorage
        try {
            await chrome.storage.session.set({ [this._dailyMinedKey]: this._dailyMinedCount.toString() });
        } catch {
            // Ignore storage errors
        }
        // Also update stats object
        await this.updateStats({ dailyGoalCurrent: this._dailyMinedCount });
        await this._markDailyActivity();
    }

    private _todayDateKey(): string {
        return new Date().toISOString().split('T')[0];
    }

    private _yesterdayDateKey(): string {
        return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    private async _markDailyActivity(): Promise<void> {
        const today = this._todayDateKey();
        if (this._lastActivityDateKey === today) {
            return;
        }

        const yesterday = this._yesterdayDateKey();
        const currentStreak = this._stats.streak || 0;
        const nextStreak = this._lastActivityDateKey === yesterday ? currentStreak + 1 : 1;

        this._lastActivityDateKey = today;
        await this.updateStats({ streak: nextStreak });

        // @ts-ignore
        if (typeof browser !== 'undefined' && browser.storage) {
            await browser.storage.local.set({
                ln_streak_last_activity_date: this._lastActivityDateKey,
            });
        }
    }

    /**
     * Remove a word from cache (used for delete sync)
     * E-L4 FIX: Accept optional language to only remove for specific language
     */
    async removeCachedWord(word: string, language?: string): Promise<void> {
        const lowerWord = word.toLowerCase();
        if (language) {
            // Remove only for the specified language
            const key = `${language}:${lowerWord}`;
            this._knownWordsCache.delete(key);
            this._pendingWords.delete(key);
        } else {
            // Fallback: remove from all languages (backward compat)
            for (const key of [...this._knownWordsCache.keys()]) {
                if (key.endsWith(`:${lowerWord}`)) {
                    this._knownWordsCache.delete(key);
                    this._pendingWords.delete(key);
                }
            }
        }
        await this._persistCache();
    }

    /**
     * Get current cached stats
     */
    getStats(): ExtensionStats {
        return { ...this._stats };
    }

    /**
     * Update stats from Web App and persist
     */
    async updateStats(newStats: Partial<ExtensionStats>): Promise<void> {
        this._stats = { ...this._stats, ...newStats, lastUpdated: Date.now() };

        // Persist to storage
        // @ts-ignore
        if (typeof browser !== 'undefined' && browser.storage) {
            await browser.storage.local.set({ ln_stats: this._stats });
        }
    }

    /**
     * Save cache to persistent storage
     */
    private async _persistCache(): Promise<void> {
        try {
            // Convert Map to object for storage
            const dataToStore: Record<string, KnownWord> = {};
            this._knownWordsCache.forEach((word, key) => {
                dataToStore[key] = word;
            });

            const pendingToStore: Record<string, KnownWord> = {};
            this._pendingWords.forEach((word, key) => {
                pendingToStore[key] = word;
            });

            // @ts-ignore - browser is global
            await browser.storage.local.set({
                ln_vocabulary_cache: dataToStore,
                ln_last_sync_ts: this._lastSyncTimestamp,
                ln_pending_changes: pendingToStore,
            });
        } catch (error) {
            console.error('[LN Sync] Failed to persist cache:', error);
        }
    }

    /**
     * Get authorization headers for API calls
     * @deprecated Dead code — no API routes exist. Kept temporarily for reference.
     */
    // REMOVED: _getAuthHeaders() — extension no longer uses API calls
    // REMOVED: _getApiUrl() — extension no longer constructs API URLs

    /**
     * Check if Metheus integration is enabled and configured.
     * With the mochila pattern, we only need the feature toggle — no API keys needed.
     */
    async isEnabled(): Promise<boolean> {
        const settings = await this._settingsProvider.get(['metheusEnabled', 'metheusSyncKnownWords']);

        // Simplified: mochila doesn't need API keys, just enabled + sync toggle
        return !!settings.metheusEnabled && !!settings.metheusSyncKnownWords;
    }

    /**
     * Get the status of a word (known, learning, etc.)
     */
    async getWordStatus(word: string, language: string): Promise<WordStatus | null> {
        const key = `${language}:${word.toLowerCase()}`;

        // Check local cache first
        if (this._knownWordsCache.has(key)) {
            // console.log(`[LN Sync] Cache HIT ${key}: ${this._knownWordsCache.get(key)!.status}`);
            return this._knownWordsCache.get(key)!.status;
        }

        console.log(
            `[LN Sync] Cache MISS ${key}. CacheSize: ${this._knownWordsCache.size}. Loaded: ${this._cacheLoaded}`
        );

        // If cache not loaded, wait for init to complete
        if (!this._cacheLoaded) {
            await this._initCache();
        }

        return this._knownWordsCache.get(key)?.status ?? null;
    }

    /**
     * Get word status synchronously from cache
     */
    getWordStatusSync(word: string, language: string): WordStatus | null {
        const key = `${language}:${word.toLowerCase()}`;
        return this._knownWordsCache.get(key)?.status ?? null;
    }

    /**
     * Update the status of a word
     */
    async updateWordStatus(word: string, language: string, status: WordStatus): Promise<void> {
        // 1. ALWAYS UPDATE LOCAL CACHE (Optimistic UI)
        // This ensures the Content Script (Video) paints the new color immediately
        // regardless of whether the Background script receives the message.
        const key = `${language}:${word.toLowerCase()}`;

        // Calculate old status for daily count
        const oldStatus = this._knownWordsCache.get(key)?.status ?? 0;

        const knownWord: KnownWord = {
            word: word.toLowerCase(),
            language,
            status,
            lastSeen: Date.now(),
            encounters: (this._knownWordsCache.get(key)?.encounters ?? 0) + 1,
        };

        // Update memory
        this._knownWordsCache.set(key, knownWord);
        this._pendingWords.set(key, knownWord);

        // Daily Count Logic
        if (oldStatus === 0 && status > 0) {
            await this.incrementDailyMinedCount();
        } else {
            // Painting/changing word status should still maintain streak for the day.
            await this._markDailyActivity();
        }

        // Persist to Shared Storage (storage.local)
        await this._persistCache();

        // 2. CONTEXT-AWARE SYNC
        if (!this._isExtensionContext()) {
            // CASE A: CONTENT SCRIPT (CLIENT)
            // We cannot Broadcast or Sync to Server directly (Permissions/CORS restrictions).
            // We must ask the Background Script to do it.
            console.log(`[LN Sync] Proxying updateWordStatus for '${word}' to Background`);
            try {
                await browser.runtime.sendMessage({
                    type: 'METHEUS_UPDATE_WORD_STATUS',
                    word,
                    language,
                    status,
                });
            } catch (e) {
                console.error('[LN Sync] Failed to proxy updateWordStatus', e);
            }
        } else {
            // CASE B: BACKGROUND SCRIPT (SERVER)
            // We are the master. Broadcast to Web App and Sync to API.

            // Broadcast update to any open Web App tabs instantly
            await this.broadcastUpdate({
                type: 'word-status-updated',
                key,
                word: knownWord,
            });

            // Try to sync immediately if enabled
            const enabled = await this.isEnabled();
            if (enabled) {
                await this.syncToServer();
            }
        }
    }

    /**
     * Mark multiple words with a status
     */
    async updateWordsStatus(words: string[], language: string, status: WordStatus): Promise<void> {
        for (const word of words) {
            const key = `${language}:${word.toLowerCase()}`;
            const knownWord: KnownWord = {
                word: word.toLowerCase(),
                language,
                status,
                lastSeen: Date.now(),
                encounters: (this._knownWordsCache.get(key)?.encounters ?? 0) + 1,
            };

            this._knownWordsCache.set(key, knownWord);
            this._pendingWords.set(key, knownWord);
        }

        await this._persistCache();

        // E-H3 FIX: Broadcast update and track daily count for batch operations
        // (Single updateWordStatus already does this, but batch was missing it)
        await this.broadcastUpdate();
        for (let i = 0; i < words.length; i++) {
            await this.incrementDailyMinedCount();
        }

        const enabled = await this.isEnabled();
        if (enabled) {
            await this.syncToServer();
        }
    }

    // REMOVED: loadKnownWords() — was dead code calling /api/words which doesn't exist.
    // Words come from the Web App via the Mochila bridge, not from an API.
    // The local cache (_knownWordsCache) is populated from browser.storage on init
    // and updated via updateWordStatus() during user interaction.

    async syncToServer(): Promise<SyncResult> {
        if (this._syncInProgress || this._pendingWords.size === 0) {
            return { success: true, itemsSynced: 0 };
        }

        // MOCHILA PATTERN: We do NOT send data to server directly.
        // We just keep it in _pendingWords until the Web App asks for it.
        console.log(`[LN Backpack] Buffered ${this._pendingWords.size} words for next handshake.`);

        // We simulate a "success" so the UI doesn't think it failed,
        // but we DO NOT clear the pending words.
        return {
            success: true,
            itemsSynced: 0,
            errors: undefined,
        };
    }

    /**
     * MOCHILA: Get all pending data to hand off to Web App
     */
    getBackpackData(): KnownWord[] {
        return Array.from(this._pendingWords.values());
    }

    /**
     * MOCHILA: clear specific words after successful handoff
     */
    async clearBackpackData(wordKeys: string[]): Promise<void> {
        console.log(`[LN Backpack] Clearing ${wordKeys.length} items from backpack`);

        for (const key of wordKeys) {
            // Reconstruct key if needed, or assume we receive "language:word"
            // The Web App should send back the same keys or we match by word/lang
            // Ideally we accept "language:word" strings.
            this._pendingWords.delete(key);
        }

        await this._persistCache();
    }

    /**
    // REMOVED: pullFromServer() — was dead code calling /api/sync/pull which doesn't exist.
    // Data comes FROM the Web App via the Mochila bridge, not from a server API.

    /**
     * Force a full sync — with mochila pattern this just broadcasts
     * to the Web App that we have pending data.
     */
    async fullSync(): Promise<SyncResult> {
        const pushResult = await this.syncToServer();
        await this.broadcastUpdate();

        return {
            success: pushResult.success,
            itemsSynced: pushResult.itemsSynced,
            errors: pushResult.errors,
        };
    }

    /**
     * Get current sync status
     */
    getSyncStatus(): SyncStatus {
        return {
            lastSyncTimestamp: this._lastSyncTimestamp,
            pendingChanges: this._pendingWords.size,
            isOnline: true, // TODO: implement online detection
        };
    }

    /**
     * Get all known words for a language (from cache)
     */
    getKnownWordsForLanguage(language: string): KnownWord[] {
        const words: KnownWord[] = [];
        const normalizedLanguage = String(language || '').toLowerCase();

        for (const [, word] of this._knownWordsCache.entries()) {
            if (String(word.language || '').toLowerCase() === normalizedLanguage) {
                words.push(word);
            }
        }

        return words;
    }

    /**
     * Check if a word is known (status >= 4)
     */
    async isWordKnown(word: string, language: string): Promise<boolean> {
        const status = await this.getWordStatus(word, language);
        return status !== null && status >= 4;
    }

    /**
     * Reload cache from persistent storage (useful for syncing between pages/extensions contexts)
     */
    async reloadLocalCache(): Promise<void> {
        this.clearCache();
        await this._initCache();
    }

    /**
     * Clear local cache (useful for logout or language change)
     */
    clearCache(): void {
        this._knownWordsCache.clear();
        this._pendingWords.clear();
        this._cacheLoaded = false;
        this._lastSyncTimestamp = 0;
        this._initPromise = null;
    }

    /**
    // REMOVED: testConnection() — was dead code calling API routes that don't exist.
    // Connection status is determined by the bridge (EXTENSION_DETECTED message).

    // ─── CONFIG CACHE (Decks, NoteTypes — received from Web App via Bridge) ───

    private _cachedDecks: { id: string; name: string }[] = [];
    private _cachedNoteTypes: { id: string; name: string }[] = [
        { id: 'STANDARD', name: 'STANDARD' },
        { id: 'CLOZE', name: 'CLOZE' },
        { id: 'LISTENING', name: 'LISTENING' },
        { id: 'SYNTAX', name: 'SYNTAX' },
    ];

    /**
     * Update config received from Web App via bridge
     * (decks, noteTypes, etc.)
     */
    async updateConfig(config: MetheusBridgeConfig = {}): Promise<void> {
        if (config.decks) {
            this._cachedDecks = config.decks;
        }
        if (config.noteTypes) {
            const incoming = config.noteTypes
                .map((n) => ({ id: String(n.id || '').toUpperCase(), name: n.name || n.id }))
                .filter((n) => SUPPORTED_NOTE_TYPES.has(n.id));

            const byId = new Map<string, { id: string; name: string }>();
            for (const nt of DEFAULT_NOTE_TYPES) {
                byId.set(nt.id, nt);
            }
            for (const nt of incoming) {
                byId.set(nt.id, nt);
            }

            this._cachedNoteTypes = Array.from(byId.values());
        }
        if (typeof config.nativeLanguage === 'string') {
            this._cachedNativeLanguage = config.nativeLanguage;
        }
        if (typeof config.targetLanguage === 'string') {
            this._cachedTargetLanguage = config.targetLanguage;
        }
        if (typeof config.miningDeckId === 'string') {
            this._cachedMiningDeckId = config.miningDeckId;
        }
        if (typeof config.interfaceLanguage === 'string') {
            this._cachedInterfaceLanguage = config.interfaceLanguage;
        }

        const incomingVocabulary = config.knownWords ?? config.vocabularyCache ?? config.vocabulary;
        if (incomingVocabulary) {
            const normalizedWords = this._normalizeBridgeKnownWords(incomingVocabulary);
            if (normalizedWords.length > 0) {
                this._knownWordsCache.clear();
                for (const word of normalizedWords) {
                    const key = `${word.language}:${word.word}`;
                    this._knownWordsCache.set(key, word);
                }
                this._pendingWords.clear();
                this._lastSyncTimestamp = Date.now();
                await this._persistCache();
                console.log(`[LN Sync] Replaced vocabulary cache from bridge: ${normalizedWords.length} words`);
            }
        }

        // Persist to storage so they survive extension restart
        // @ts-ignore
        if (typeof browser !== 'undefined' && browser.storage) {
            await browser.storage.local.set({
                ln_cached_decks: this._cachedDecks,
                ln_cached_note_types: this._cachedNoteTypes,
                ln_cached_native_language: this._cachedNativeLanguage,
                ln_cached_target_language: this._cachedTargetLanguage,
                ln_cached_mining_deck_id: this._cachedMiningDeckId,
                ln_cached_interface_language: this._cachedInterfaceLanguage,
            });
        }
        console.log(
            `[LN Config] Updated: ${this._cachedDecks.length} decks, ${this._cachedNoteTypes.length} noteTypes, target=${this._cachedTargetLanguage}`
        );
    }

    private _normalizeBridgeKnownWords(value: KnownWord[] | Record<string, KnownWord>): KnownWord[] {
        const values = Array.isArray(value) ? value : Object.values(value || {});

        return values
            .map((entry) => {
                const word = String((entry as KnownWord)?.word || '')
                    .trim()
                    .toLowerCase();
                const language = String((entry as KnownWord)?.language || '')
                    .trim()
                    .toLowerCase();
                const rawStatus = Number((entry as KnownWord)?.status);
                const status = Math.max(
                    0,
                    Math.min(5, Number.isFinite(rawStatus) ? Math.floor(rawStatus) : 0)
                ) as WordStatus;

                if (!word || !language) {
                    return undefined;
                }

                return {
                    word,
                    language,
                    status,
                    lastSeen: Number.isFinite(Number((entry as KnownWord)?.lastSeen))
                        ? Number((entry as KnownWord).lastSeen)
                        : Date.now(),
                    encounters: Number.isFinite(Number((entry as KnownWord)?.encounters))
                        ? Number((entry as KnownWord).encounters)
                        : 1,
                } as KnownWord;
            })
            .filter((entry): entry is KnownWord => !!entry);
    }

    /**
     * Get decks from local cache (populated by Web App via bridge)
     */
    getDecks(): { id: string; name: string }[] {
        return this._cachedDecks;
    }

    /**
     * Get note types from local cache (populated by Web App via bridge)
     */
    getNoteTypes(): { id: string; name: string }[] {
        return this._cachedNoteTypes;
    }

    /**
     * Broadcast to all open Metheus Web App tabs that new data is available
     */
    async broadcastUpdate(data?: any): Promise<void> {
        // Safety check: specific APIs like tabs are only available in background/popup
        // @ts-ignore
        if (typeof browser !== 'undefined' && (!browser.tabs || !browser.tabs.query)) {
            console.warn('[LN Sync] Cannot broadcast from this context (no tabs API)');
            return;
        }

        try {
            const now = Date.now();
            for (const [tabId, expiresAt] of this._temporarilyMutedTabIds.entries()) {
                if (expiresAt <= now) {
                    this._temporarilyMutedTabIds.delete(tabId);
                }
            }

            // Find tabs that match the Web App URL (localhost or production)
            // We use the same matches as the bridge content script
            const tabs = await browser.tabs.query({
                url: ['*://metheus.app/*', '*://www.metheus.app/*', '*://localhost/*', '*://127.0.0.1/*'],
            });

            const candidateTabs = tabs.filter((tab) => !!tab.id && !this._temporarilyMutedTabIds.has(tab.id));

            console.log(
                `[LN Sync] Broadcasting to ${candidateTabs.length}/${tabs.length} tabs. URLs:`,
                candidateTabs.map((t) => t.url)
            );

            const payload = {
                type: 'METHEUS_BACKPACK_UPDATED',
                data: data, // Payload for instant import
            };

            for (const tab of candidateTabs) {
                if (tab.id) {
                    try {
                        console.log(`[LN Sync] Sending msg to tab ${tab.id} (${tab.url})`);
                        await browser.tabs.sendMessage(tab.id, payload);
                    } catch (e) {
                        console.error(`[LN Sync] Failed to message tab ${tab.id}:`, e);
                        const reason = `${e}`.toLowerCase();
                        if (
                            reason.includes('receiving end does not exist') ||
                            reason.includes('could not establish connection')
                        ) {
                            this._temporarilyMutedTabIds.set(tab.id, Date.now() + 60_000);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[LN Sync] Broadcast failed:', error);
        }
    }
}

// Singleton instance
let _instance: MetheusSyncService | null = null;
let _instanceSettingsProvider: SettingsProvider | null = null;

export function getMetheusSyncService(settingsProvider: SettingsProvider): MetheusSyncService {
    if (!_instance) {
        _instance = new MetheusSyncService(settingsProvider);
        _instanceSettingsProvider = settingsProvider;
    }
    return _instance;
}
