/**
 * Online Dictionary Provider Types
 *
 * Defines the contract for online dictionary providers that fetch
 * definitions, examples, audio, and phonetics from external APIs.
 */

import { DictionaryEntry } from '../metheus-dictionary';

/**
 * Interface that every online dictionary provider must implement.
 */
export interface OnlineDictionaryProvider {
    /** Human-readable name (e.g. "Free Dictionary API", "Jisho") */
    readonly name: string;

    /** BCP-47 language codes this provider supports */
    readonly supportedLanguages: string[];

    /** Per-provider timeout in ms (individual, not global) */
    readonly timeout: number;

    /**
     * Fetch dictionary entries for a word in a given language.
     * Must handle errors internally and return [] on failure.
     * Entries should use existing DictionaryEntry fields only:
     *   word, phonetic, partOfSpeech, definitions, examples,
     *   synonyms, antonyms, audio, linguisticData, translations
     */
    lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]>;
}

/**
 * Cached online lookup result stored in IndexedDB.
 */
export interface OnlineCacheEntry {
    /** Auto-incremented primary key */
    id?: number;
    /** Lowercase word */
    w: string;
    /** Language code */
    lang: string;
    /** Serialized DictionaryEntry[] */
    entries: DictionaryEntry[];
    /** Timestamp when fetched */
    fetchedAt: number;
}

/**
 * Result from the OnlineDictionaryService.
 */
export interface OnlineLookupResult {
    /** Entries collected from all providers */
    entries: DictionaryEntry[];
    /** Whether results came from cache */
    fromCache: boolean;
    /** Provider names that contributed entries */
    sources: string[];
}
