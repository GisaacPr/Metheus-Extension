/**
 * METHEUS DICTIONARY SERVICE
 *
 * Provides dictionary lookup and autocomplete functionality
 * using the Metheus platform API and local IndexedDB.
 */

import { SettingsProvider } from '@metheus/common/settings';
import { db } from './db/dictionary-db';
import { DictionaryDownloadService } from './dictionary-downloader';
import { getOnlineDictionaryService } from './online-dictionary';
import { v4 as uuidv4 } from 'uuid';
import {
    DictionaryLookupMessage,
    DictionaryDownloadMessage,
    DictionaryGetStatusMessage,
    DictionaryStatusResponse,
} from '@metheus/common';

// Dictionary configuration (same as web app)
interface LanguageConfig {
    id: string;
    name: string;
    flag: string;
    dictionaryIds: string[];
    isCourse?: boolean;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
    en: { id: 'en', name: 'English', flag: '🇬🇧', dictionaryIds: ['English_dictionary', 'LN_en'], isCourse: true },
    es: { id: 'es', name: 'Spanish', flag: '🇪🇸', dictionaryIds: ['Español_dictionary', 'LN_es'] },
    fr: { id: 'fr', name: 'French', flag: '🇫🇷', dictionaryIds: ['Frances_dictionary', 'LN_fr'] },
    de: { id: 'de', name: 'German', flag: '🇩🇪', dictionaryIds: ['Aleman_dictionary', 'LN_de'] },
    it: { id: 'it', name: 'Italian', flag: '🇮🇹', dictionaryIds: ['Italiano_dictionary', 'LN_it'] },
    pt: { id: 'pt', name: 'Portuguese', flag: '🇵🇹', dictionaryIds: ['Portugues_dictionary', 'LN_pt'] },
    ja: { id: 'ja', name: 'Japanese', flag: '🇯🇵', dictionaryIds: ['Japones_dictionary', 'LN_ja'] },
    zh: { id: 'zh', name: 'Chinese', flag: '🇨🇳', dictionaryIds: ['Chino_dictionary', 'LN_zh'] },
    ko: { id: 'ko', name: 'Korean', flag: '🇰🇷', dictionaryIds: ['Korean_dictionary', 'LN_ko'] },
    vi: { id: 'vi', name: 'Vietnamese', flag: '🇻🇳', dictionaryIds: ['Vietnamese_dictionary', 'LN_vi'] },
    ru: { id: 'ru', name: 'Russian', flag: '🇷🇺', dictionaryIds: ['Ruso_dictionary'] },
    ar: { id: 'ar', name: 'Arabic', flag: '🇸🇦', dictionaryIds: ['Arabic_dictionary'] },
    hi: { id: 'hi', name: 'Hindi', flag: '🇮🇳', dictionaryIds: ['Hindi_dictionary'] },
    tr: { id: 'tr', name: 'Turkish', flag: '🇹🇷', dictionaryIds: ['Turkish_dictionary'] },
    pl: { id: 'pl', name: 'Polish', flag: '🇵🇱', dictionaryIds: ['Polish_dictionary'] },
    nl: { id: 'nl', name: 'Dutch', flag: '🇳🇱', dictionaryIds: ['Dutch_dictionary'] },
    sv: { id: 'sv', name: 'Swedish', flag: '🇸🇪', dictionaryIds: ['Swedish_dictionary'] },
    id: { id: 'id', name: 'Indonesian', flag: '🇮🇩', dictionaryIds: ['Indonesio_dictionary'] },
    el: { id: 'el', name: 'Greek', flag: '🇬🇷', dictionaryIds: ['Greek_dictionary'] },
    hu: { id: 'hu', name: 'Hungarian', flag: '🇭🇺', dictionaryIds: ['Hungarian_dictionary'] },
    la: { id: 'la', name: 'Latin', flag: '🏛️', dictionaryIds: ['Latin_dictionary'] },
};

export interface DictionaryEntry {
    word: string;
    /** BCP-47 / ISO-ish code for the entry language (e.g. 'en', 'es', 'de') */
    language?: string;
    phonetic?: string;
    partOfSpeech?: string;
    definitions: DictionaryDefinition[];
    examples?: string[];
    synonyms?: string[];
    antonyms?: string[];
    // Metadata
    cefr?: string;
    frequency?: number;
    audio?: string;
    translations?: string[];
    linguisticData?: {
        label: string;
        value: string | number;
        key: string;
    }[];
    // New fields for offline/source status
    source?: 'local' | 'api' | 'cache';
    // Allow raw fields from DB (w, d, lang, l, etc) to pass through for the Adapter
    [key: string]: any;
}

export interface DictionaryDefinition {
    meaning: string;
    example?: string;
    partOfSpeech?: string;
    examples?: {
        sentence: string;
        collocations?: string[];
    }[];
    synonyms?: string[];
    antonyms?: string[];
}

export interface AutocompleteResult {
    word: string;
    score?: number;
}

export interface DictionaryLookupResult {
    found: boolean;
    entry?: DictionaryEntry;
    suggestions?: string[];
    allEntries?: DictionaryEntry[]; // Multiple entries from different dictionaries
}

export class MetheusDictionaryService {
    /**
     * Return supported language codes for multi-language lookup.
     */
    getSupportedLanguages(): string[] {
        return Object.keys(SUPPORTED_LANGUAGES);
    }
    private readonly _settingsProvider: SettingsProvider;
    private _cache: Map<string, DictionaryEntry[]> = new Map();
    private readonly _maxCacheSize = 1000;

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
    }

    private _isExtensionContext(): boolean {
        // Robust check for Extension Context vs Content Script
        // Content Scripts have access to 'browser.runtime' but NOT 'browser.tabs'
        // Background/Popup/Options have access to 'browser.tabs'
        try {
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
     * Get authorization headers for API calls
     */
    private async _getAuthHeaders(): Promise<HeadersInit> {
        const settings = await this._settingsProvider.get(['metheusApiKey', 'metheusToken']);
        const { metheusApiKey, metheusToken } = settings;
        const authValue = `Bearer ${metheusApiKey || metheusToken}`;

        return {
            'Content-Type': 'application/json',
            Authorization: authValue,
        };
    }

    /**
     * Check if dictionary service is enabled
     */
    async isEnabled(): Promise<boolean> {
        const settings = await this._settingsProvider.get(['metheusEnabled', 'metheusApiKey', 'metheusToken']);

        // Dictionary is always enabled when Metheus is enabled
        if (!settings.metheusEnabled) {
            return false;
        }

        // 2. Check Authentication
        const hasAuth = !!(settings.metheusApiKey || settings.metheusToken);
        if (hasAuth) return true;

        // 3. Check Offline Availability (Fallback if no Auth)
        // If we have ANY dictionary downloaded, we are enabled.
        const allLangs = this.getSupportedLanguages();
        for (const lang of allLangs) {
            const isDownloaded = await this.isLanguageDownloaded(lang);
            if (isDownloaded) return true;
        }

        return false;
    }

    /**
     * Look up a word in the dictionary (searches local DB first, then API)
     * @param onEnrich Optional callback invoked when online enrichment arrives after local results
     */
    async lookup(
        word: string,
        language?: string,
        onEnrich?: (result: DictionaryLookupResult) => void
    ): Promise<DictionaryLookupResult> {
        // Fetch all needed settings at once
        const settings = await this._settingsProvider.get(['metheusEnabled', 'metheusUrl', 'metheusTargetLanguage']);

        // Dictionary is always enabled when Metheus is enabled
        if (!settings.metheusEnabled) {
            console.log(`[LN Debug] Dictionary lookup DISABLED. metheusEnabled: ${settings.metheusEnabled}`);
            return { found: false };
        }

        const lang = language ?? settings.metheusTargetLanguage ?? 'en';

        console.log(`[LN Debug] Lookup '${word}' in '${lang}' (Enabled: ${settings.metheusEnabled})`);
        console.log(`[LN Debug] Target language setting: ${settings.metheusTargetLanguage}, using lang: ${lang}`);

        // 1. Check Memory Cache
        const cacheKey = `${lang}:${word.toLowerCase()}`;
        if (this._cache.has(cacheKey)) {
            const allEntries = this._cache.get(cacheKey)!;
            // Return full cached list. First entry is fallback for legacy consumers.
            return { found: true, entry: allEntries[0], allEntries };
        }

        // 2. Client Mode (Content Script): Proxy to Background
        if (!this._isExtensionContext()) {
            console.log(`[LN Debug] Client Mode: Proxying lookup for '${word}'`);
            try {
                const response = await browser.runtime.sendMessage({
                    sender: 'metheus-client',
                    message: {
                        command: 'dictionary-lookup',
                        messageId: uuidv4(),
                        word,
                        language: lang,
                    },
                });
                console.log(`[LN Debug] Proxy Response for '${word}':`, response);
                return response as DictionaryLookupResult;
            } catch (e) {
                console.error('[LN Debug] Proxy lookup failed', e);
                return { found: false };
            }
        }

        // 3. Server Mode (Background/Popup): Query Local DB
        try {
            console.log(`[LN Debug] Querying DB for word: '${word}', lang: '${lang}'`);
            // Use the fallback lookup (Exact -> Lower -> Title) implemented in DB or simulating it here
            const localResultsRaw = await db.lookupWithFallback(word, lang);
            console.log(
                `[LN Debug] DB results for '${word}' in '${lang}': ${localResultsRaw?.length || 0} entries found`
            );

            if (localResultsRaw.length > 0) {
                console.log(`[LN Debug] First result word: '${localResultsRaw[0]?.w || localResultsRaw[0]?.word}'`);
                // Map raw DB entries to DictionaryEntry
                const allEntries = localResultsRaw.map((raw) => this._mapRawToEntry(raw, lang));
                // console.log(`[LN Debug] Mapped entries:`, allEntries);

                // Combine for legacy single-entry return (if needed, but UI uses allEntries mostly)
                let combinedEntry = allEntries[0];
                for (let i = 1; i < allEntries.length; i++) {
                    combinedEntry = this._combineEntries(combinedEntry, allEntries[i]);
                }
                combinedEntry.source = 'local';

                // Cache ALL entries to preserve raw data for UI logic (avoiding data loss)
                this._addToCache(cacheKey, allEntries);

                // Fire parallel online enrichment (non-blocking)
                if (onEnrich) {
                    this._enrichWithOnline(word, lang, allEntries, cacheKey, onEnrich);
                }

                return { found: true, entry: combinedEntry, allEntries };
            } else {
                console.log(`[LN Debug] No entries found in DB for '${word}' in language '${lang}'`);
            }
        } catch (e) {
            console.error('[Dictionary] Local lookup failed', e);
        }

        console.log(`[LN Debug] Word '${word}' NOT FOUND in any dictionary`);

        // 4. Online Dictionary Enrichment
        // If local DB had no results, try online as a blocking fallback.
        // If local DB had results, the enrichment runs in parallel (see the early return above).
        try {
            const onlineResult = await this._lookupOnline(word, lang);
            if (onlineResult.length > 0) {
                let combinedEntry = onlineResult[0];
                for (let i = 1; i < onlineResult.length; i++) {
                    combinedEntry = this._combineEntries(combinedEntry, onlineResult[i]);
                }
                combinedEntry.source = 'api';
                this._addToCache(cacheKey, onlineResult);
                return { found: true, entry: combinedEntry, allEntries: onlineResult };
            }
        } catch (e) {
            console.error('[Dictionary] Online lookup failed', e);
        }

        return { found: false };
    }

    /**
     * Downloads a dictionary for offline use
     */
    async downloadLanguage(language: string, onProgress?: (p: number, s: string) => void): Promise<void> {
        if (!this._isExtensionContext()) {
            // Proxy download request
            await browser.runtime.sendMessage({
                sender: 'metheus-client',
                message: {
                    command: 'dictionary-download',
                    messageId: uuidv4(),
                    language,
                },
            });
            return;
        }

        const config = SUPPORTED_LANGUAGES[language];
        const explicitDictionaryIds = config ? config.dictionaryIds : undefined;

        await DictionaryDownloadService.downloadDictionary(
            this._settingsProvider,
            language,
            onProgress,
            explicitDictionaryIds
        );
    }

    /**
     * Deletes a downloaded dictionary
     */
    async deleteLanguage(language: string): Promise<void> {
        if (!this._isExtensionContext()) {
            // Proxy delete request (if needed, though UI usually runs in popup which is extension context)
            // Note: We don't have a 'dictionary-delete' command in background yet, assuming direct DB access for Popup.
            // But if called from Content Script, we'd need a proxy.
            // For now, let's assume direct DB access since Popup shares context or direct indexedDB access.
            // Actually, Popup IS extension context, so it hits the else block.
            console.warn('Delete from content script not fully implemented yet');
            return;
        }

        await db.deleteLanguage(language);

        // Clear cache as we might have cached entries from that language
        this._cache.clear();
    }

    /**
     * Checks if a language is downloaded
     */
    async isLanguageDownloaded(language: string): Promise<boolean> {
        if (!this._isExtensionContext()) {
            const res = await browser.runtime.sendMessage({
                sender: 'metheus-client',
                message: {
                    command: 'dictionary-get-status',
                    messageId: uuidv4(),
                    language,
                },
            });
            return (res as DictionaryStatusResponse).isDownloaded;
        }
        return db.isLanguageDownloaded(language);
    }

    /**
     * Get similar words (for typo correction)
     */
    private async _getSuggestions(word: string, language: string): Promise<string[]> {
        // Use autocomplete as a simple similarity check
        const results = await this.autocomplete(word.slice(0, 3), language, 20);

        // Filter results by edit distance (simple implementation)
        return results
            .filter((r) => this._levenshteinDistance(word.toLowerCase(), r.word.toLowerCase()) <= 2)
            .slice(0, 5)
            .map((r) => r.word);
    }

    /**
     * Simple Levenshtein distance implementation for typo detection
     */
    private _levenshteinDistance(a: string, b: string): number {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Combine entries from multiple dictionaries
     */
    private _combineEntries(primary: DictionaryEntry, secondary: DictionaryEntry): DictionaryEntry {
        let mergedLinguisticData = primary.linguisticData;
        if (secondary.linguisticData && secondary.linguisticData.length > 0) {
            if (!mergedLinguisticData || mergedLinguisticData.length === 0) {
                mergedLinguisticData = secondary.linguisticData;
            } else {
                const primaryKeys = new Set(mergedLinguisticData.map((d) => d.key));
                const newData = secondary.linguisticData.filter((d) => !primaryKeys.has(d.key));
                if (newData.length > 0) {
                    mergedLinguisticData = [...mergedLinguisticData, ...newData];
                }
            }
        }

        return {
            ...primary,
            cefr: primary.cefr || secondary.cefr,
            frequency: primary.frequency ?? secondary.frequency,
            phonetic: primary.phonetic || secondary.phonetic,
            audio: primary.audio || secondary.audio,
            partOfSpeech: primary.partOfSpeech || secondary.partOfSpeech,
            translations:
                primary.translations || secondary.translations
                    ? [...new Set([...(primary.translations || []), ...(secondary.translations || [])])]
                    : undefined,
            linguisticData: mergedLinguisticData,
            definitions: [...primary.definitions, ...secondary.definitions],
            examples:
                primary.examples || secondary.examples
                    ? [...new Set([...(primary.examples || []), ...(secondary.examples || [])])]
                    : undefined,
            synonyms:
                primary.synonyms || secondary.synonyms
                    ? [...new Set([...(primary.synonyms || []), ...(secondary.synonyms || [])])]
                    : undefined,
            antonyms:
                primary.antonyms || secondary.antonyms
                    ? [...new Set([...(primary.antonyms || []), ...(secondary.antonyms || [])])]
                    : undefined,
        };
    }

    /**
     * Get autocomplete suggestions for a prefix
     */
    async autocomplete(prefix: string, language?: string, limit: number = 10): Promise<AutocompleteResult[]> {
        const enabled = await this.isEnabled();
        // Fallback to simpler check: if we have local db content, autcomplete could work locally (TODO)
        // For now, only API unless we implement `db.searchPrefix`
        if (!enabled || prefix.length < 2) {
            return [];
        }

        const settings = await this._settingsProvider.get(['metheusUrl', 'metheusTargetLanguage']);
        const { metheusUrl, metheusTargetLanguage } = settings;
        const lang = language ?? metheusTargetLanguage ?? 'en';

        try {
            const headers = await this._getAuthHeaders();
            const encodedPrefix = encodeURIComponent(prefix.toLowerCase());
            const response = await fetch(
                `${metheusUrl}/api/dictionary/${lang}/autocomplete?q=${encodedPrefix}&limit=${limit}`,
                { headers }
            );

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            return data.suggestions ?? [];
        } catch (error) {
            // console.error('Autocomplete error:', error);
            return [];
        }
    }

    /**
     * Map raw optimized DB entry to our rich DictionaryEntry format
     */
    private _mapRawToEntry(raw: any, language: string): DictionaryEntry {
        // raw structure: { w, d: [{ m, ex, pos }], pos, l }

        const definitions: DictionaryDefinition[] = [];
        const rawDefs = Array.isArray(raw.d) ? raw.d : [];

        for (const d of rawDefs) {
            // Handle LN Dictionaries (String defs)
            if (typeof d === 'string') {
                definitions.push({
                    meaning: d,
                    examples: [],
                });
            }
            // Handle Object defs
            else if (typeof d === 'object') {
                const exArray = Array.isArray(d.ex) ? d.ex : d.examples || [];
                const examples = exArray.map((ex: any) => ({
                    sentence: typeof ex === 'string' ? ex : ex.s || ex.sentence || '',
                    collocations: ex.collocations || [],
                }));

                definitions.push({
                    meaning: d.m || d.meaning || '',
                    examples,
                    partOfSpeech: d.pos,
                });
            }
        }

        return {
            ...raw, // Preserve all raw keys (w, d, lang, l) for the UI Adapter
            word: raw.w || raw.entry_word,
            language,
            cefr: raw.l || raw.level,
            partOfSpeech: raw.pos,
            definitions,
            // Add other extracted fields if optimized format has them (frequency, etc)
        };
    }

    /**
     * Parse raw dictionary entry from API into our format
     */
    private _parseEntry(raw: Record<string, unknown>): DictionaryEntry {
        const definitions: DictionaryDefinition[] = [];

        // Handle formatted API response format (Web App)
        if (raw.definitions && Array.isArray(raw.definitions)) {
            for (const def of raw.definitions) {
                if (typeof def === 'object' && def !== null) {
                    const defObj = def as any;
                    const examples =
                        defObj.examples && Array.isArray(defObj.examples)
                            ? defObj.examples.map((ex: any) => ({
                                  sentence: typeof ex === 'string' ? ex : ex.sentence || ex.s || '',
                                  collocations: ex.collocations || [],
                              }))
                            : undefined;

                    const meaning = String(defObj.meaning || defObj.definition || defObj.m || '');

                    if (meaning && meaning.trim().length > 0) {
                        definitions.push({
                            meaning,
                            examples,
                            synonyms:
                                defObj.synonyms && Array.isArray(defObj.synonyms)
                                    ? defObj.synonyms.map(String)
                                    : defObj.rel?.syn && Array.isArray(defObj.rel.syn)
                                      ? defObj.rel.syn.map(String)
                                      : undefined,
                            antonyms:
                                defObj.antonyms && Array.isArray(defObj.antonyms)
                                    ? defObj.antonyms.map(String)
                                    : defObj.rel?.ant && Array.isArray(defObj.rel.ant)
                                      ? defObj.rel.ant.map(String)
                                      : undefined,
                        });
                    }
                }
            }
        } else if (raw.d && Array.isArray(raw.d)) {
            // Handle raw dictionary format (fallback if API returns raw)
            for (const def of raw.d) {
                if (typeof def === 'object' && def !== null) {
                    const defObj = def as Record<string, unknown>;
                    const examples =
                        defObj.ex && Array.isArray(defObj.ex)
                            ? defObj.ex.map((ex: any) => ({
                                  sentence: ex.s || '',
                                  collocations: ex.collocations || [],
                              }))
                            : undefined;

                    definitions.push({
                        meaning: String(defObj.m || ''),
                        examples,
                        synonyms:
                            (defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.syn &&
                            Array.isArray((defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.syn)
                                ? ((defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.syn as unknown[]).map(
                                      String
                                  )
                                : undefined,
                        antonyms:
                            (defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.ant &&
                            Array.isArray((defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.ant)
                                ? ((defObj.rel as { syn?: unknown; ant?: unknown } | undefined)?.ant as unknown[]).map(
                                      String
                                  )
                                : undefined,
                    });
                }
            }
        } else {
            if (raw.meanings && Array.isArray(raw.meanings)) {
                for (const meaning of raw.meanings) {
                    if (meaning.definitions && Array.isArray(meaning.definitions)) {
                        for (const def of meaning.definitions) {
                            definitions.push({
                                meaning: def.definition || def.meaning || String(def),
                                example: def.example,
                            });
                        }
                    }
                }
            } else if (raw.definition) {
                definitions.push({
                    meaning: String(raw.definition),
                });
            }
        }

        let examples: string[] = [];
        if (raw.examples && Array.isArray(raw.examples)) {
            examples = raw.examples.map((e) => String(e));
        }

        const synonyms = raw.synonyms && Array.isArray(raw.synonyms) ? raw.synonyms.map((s) => String(s)) : undefined;
        const antonyms = raw.antonyms && Array.isArray(raw.antonyms) ? raw.antonyms.map((a) => String(a)) : undefined;

        let cefr = (raw.cefr || raw.level || raw.lvl || '').toString();

        const frequencyRaw = (raw.frequency || raw.rank || raw.freq || 0) as any;
        let frequency: number | undefined = undefined;
        if (typeof frequencyRaw === 'number') {
            frequency = frequencyRaw;
        } else if (typeof frequencyRaw === 'string') {
            const match = frequencyRaw.match(/(\d+)/);
            if (match) {
                frequency = parseInt(match[1], 10);
            }
        }

        if (raw.badges && Array.isArray(raw.badges)) {
            const badges = raw.badges as { type: string; label: string }[];
            if (!cefr) {
                const levelBadge = badges.find((b) => b.type === 'level');
                if (levelBadge) cefr = levelBadge.label;
            }
            if (!frequency) {
                const freqBadge = badges.find((b) => b.type === 'frequency');
                if (freqBadge) {
                    const match = freqBadge.label.match(/(\d+)/);
                    if (match) {
                        frequency = parseInt(match[1], 10);
                    }
                }
            }
        }

        const levelFromFormatted = (raw.level ?? raw.lvl ?? raw.cefr ?? raw.cefr_level) as unknown;
        if (!cefr && levelFromFormatted) {
            cefr = String(levelFromFormatted);
        }

        const phonetic = (raw.phonetic || raw.pronunciation || raw.ipa) as string | undefined;

        const linguisticData = raw.linguisticData as
            | { label: string; value: string | number; key: string }[]
            | undefined;

        return {
            word: String(raw.word || raw.term || raw.w || ''),
            language: (raw.language || raw.lang) as string | undefined,
            phonetic,
            partOfSpeech: (raw.partOfSpeech || raw.part_of_speech || raw.pos) as string | undefined,
            definitions: definitions.filter((d) => d.meaning && d.meaning.trim().length > 0),
            examples: examples.length > 0 ? examples : undefined,
            synonyms,
            antonyms,
            cefr,
            frequency,
            audio: raw.audio as string | undefined,
            translations: raw.translations as string[] | undefined,
            linguisticData,
        };
    }

    /**
     * Fetch entries from online dictionary providers.
     */
    private async _lookupOnline(word: string, language: string): Promise<DictionaryEntry[]> {
        const onlineService = getOnlineDictionaryService();
        if (!onlineService.isEnabled) return [];

        const result = await onlineService.lookup(word, language);
        return result.entries;
    }

    /**
     * Fire-and-forget online enrichment that runs in parallel.
     * When results arrive, merges them with local entries and calls onEnrich.
     */
    private _enrichWithOnline(
        word: string,
        language: string,
        localEntries: DictionaryEntry[],
        cacheKey: string,
        onEnrich: (result: DictionaryLookupResult) => void
    ): void {
        this._lookupOnline(word, language)
            .then((onlineEntries) => {
                if (onlineEntries.length === 0) return;

                // Merge local + online
                const allEntries = [...localEntries, ...onlineEntries];

                let combinedEntry = allEntries[0];
                for (let i = 1; i < allEntries.length; i++) {
                    combinedEntry = this._combineEntries(combinedEntry, allEntries[i]);
                }
                // Keep local source marker on the combined entry since local is primary
                combinedEntry.source = 'local';

                // Update cache with merged results
                this._addToCache(cacheKey, allEntries);

                // Notify caller
                onEnrich({ found: true, entry: combinedEntry, allEntries });
            })
            .catch((e) => {
                console.warn('[Dictionary] Online enrichment failed silently:', e);
            });
    }

    private _addToCache(key: string, entries: DictionaryEntry[]): void {
        if (this._cache.size >= this._maxCacheSize) {
            const firstKey = this._cache.keys().next().value;
            if (firstKey) {
                this._cache.delete(firstKey);
            }
        }
        this._cache.set(key, entries);
    }

    clearCache(): void {
        this._cache.clear();
    }

    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: this._cache.size,
            maxSize: this._maxCacheSize,
        };
    }
}

let _instance: MetheusDictionaryService | null = null;
export function getMetheusDictionaryService(settingsProvider: SettingsProvider): MetheusDictionaryService {
    if (!_instance) {
        _instance = new MetheusDictionaryService(settingsProvider);
    }
    return _instance;
}
