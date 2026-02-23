/**
 * Online Dictionary Service
 *
 * Orchestrates multiple online dictionary providers to fetch definitions,
 * examples, audio, and phonetics from external APIs.
 *
 * Features:
 * - Parallel execution of all compatible providers via Promise.allSettled()
 * - Per-provider AbortSignal timeout
 * - Global timeout (2.5s) for the entire batch
 * - IndexedDB caching with 7-day TTL
 * - Streaming: lookupSingleProvider() for per-provider calls
 * - Graceful error handling (individual provider failures don't break others)
 */

import { DictionaryEntry } from '../metheus-dictionary';
import { OnlineDictionaryProvider, OnlineLookupResult } from './types';
import { FreeDictionaryProvider } from './free-dictionary-provider';
import { WiktionaryProvider } from './wiktionary-provider';
import { JishoProvider } from './jisho-provider';
import { NiklKoreanProvider } from './nikl-korean-provider';
import { TatoebaProvider } from './tatoeba-provider';
import { db } from '../db/dictionary-db';

/** 7 days in milliseconds */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Global timeout for all providers combined */
const GLOBAL_TIMEOUT_MS = 2500;

export class OnlineDictionaryService {
    private readonly _providers: OnlineDictionaryProvider[];
    private _enabled: boolean = true;

    constructor() {
        this._providers = [
            new FreeDictionaryProvider(),
            new WiktionaryProvider(),
            new JishoProvider(),
            new NiklKoreanProvider(),
            new TatoebaProvider(),
        ];
    }

    /** Enable or disable online lookups */
    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    get isEnabled(): boolean {
        return this._enabled;
    }

    /**
     * Returns the names of providers that support a given language.
     * Used by the popup to fire parallel per-provider streaming requests.
     */
    getCompatibleProviderNames(language: string): string[] {
        return this._providers.filter((p) => p.supportedLanguages.includes(language)).map((p) => p.name);
    }

    /**
     * Look up a word using a SINGLE provider by name.
     * Returns entries from that one provider. No caching (caller should cache if needed).
     */
    async lookupSingleProvider(word: string, language: string, providerName: string): Promise<OnlineLookupResult> {
        if (!this._enabled) {
            return { entries: [], fromCache: false, sources: [] };
        }

        const provider = this._providers.find((p) => p.name === providerName);
        if (!provider || !provider.supportedLanguages.includes(language)) {
            return { entries: [], fromCache: false, sources: [] };
        }

        try {
            const signal = AbortSignal.timeout(provider.timeout);
            const entries = await provider.lookup(word, language, signal);
            for (const entry of entries) {
                entry.source = 'api';
            }
            return { entries, fromCache: false, sources: entries.length > 0 ? [providerName] : [] };
        } catch {
            return { entries: [], fromCache: false, sources: [] };
        }
    }

    /**
     * Look up a word using all compatible online providers.
     * Returns cached results if available and not expired.
     */
    async lookup(word: string, language: string): Promise<OnlineLookupResult> {
        if (!this._enabled) {
            return { entries: [], fromCache: false, sources: [] };
        }

        const normalizedWord = word.toLowerCase().trim();
        if (!normalizedWord) {
            return { entries: [], fromCache: false, sources: [] };
        }

        // 1. Check cache first
        try {
            const cached = await db.getOnlineCache(normalizedWord, language);
            if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
                // Mark all cached entries with source = 'cache'
                const entries = cached.entries.map((e) => ({ ...e, source: 'cache' as const }));
                return { entries, fromCache: true, sources: ['cache'] };
            }
        } catch (e) {
            console.warn('[OnlineDict] Cache read failed:', e);
        }

        // 2. Select providers that support this language
        const compatibleProviders = this._providers.filter((p) => p.supportedLanguages.includes(language));

        if (compatibleProviders.length === 0) {
            return { entries: [], fromCache: false, sources: [] };
        }

        // 3. Race all providers in parallel with global timeout
        const globalAbort = new AbortController();
        const globalTimeout = setTimeout(() => globalAbort.abort(), GLOBAL_TIMEOUT_MS);

        try {
            const providerPromises = compatibleProviders.map(async (provider) => {
                try {
                    // Create per-provider signal that also respects global abort
                    const signal = AbortSignal.any
                        ? AbortSignal.any([AbortSignal.timeout(provider.timeout), globalAbort.signal])
                        : globalAbort.signal; // Fallback if AbortSignal.any not available

                    const entries = await provider.lookup(word, language, signal);
                    return { provider: provider.name, entries };
                } catch {
                    return { provider: provider.name, entries: [] as DictionaryEntry[] };
                }
            });

            const results = await Promise.allSettled(providerPromises);

            const allEntries: DictionaryEntry[] = [];
            const sources: string[] = [];

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.entries.length > 0) {
                    allEntries.push(...result.value.entries);
                    sources.push(result.value.provider);
                }
            }

            // Mark all entries as 'api' source
            for (const entry of allEntries) {
                entry.source = 'api';
            }

            // 4. Cache the result (even if empty, to avoid re-fetching)
            try {
                await db.setOnlineCache(normalizedWord, language, allEntries);
            } catch (e) {
                console.warn('[OnlineDict] Cache write failed:', e);
            }

            return { entries: allEntries, fromCache: false, sources };
        } finally {
            clearTimeout(globalTimeout);
        }
    }

    /**
     * Clean expired cache entries. Should be called periodically
     * (e.g., on service worker startup).
     */
    async cleanExpiredCache(): Promise<void> {
        try {
            await db.cleanExpiredOnlineCache(CACHE_TTL_MS);
        } catch (e) {
            console.warn('[OnlineDict] Cache cleanup failed:', e);
        }
    }

    /** Get list of provider names and their supported languages */
    getProviderInfo(): { name: string; languages: string[] }[] {
        return this._providers.map((p) => ({
            name: p.name,
            languages: [...p.supportedLanguages],
        }));
    }
}

// Singleton
let _onlineInstance: OnlineDictionaryService | null = null;

export function getOnlineDictionaryService(): OnlineDictionaryService {
    if (!_onlineInstance) {
        _onlineInstance = new OnlineDictionaryService();
    }
    return _onlineInstance;
}
