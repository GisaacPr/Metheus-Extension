import Dexie, { Table } from 'dexie';

// Interface for Dictionary Chunk Metadata
export interface DictionaryChunk {
    id: string; // e.g. "en_A", "ja_1"
    language: string; // e.g. "en"
    chunkId: string; // e.g. "A", "1"
    version: number; // e.g. 1
    loadedAt: number; // timestamp
}

// Interface for Dictionary Entry (Optimized for storage)
export interface StoredDictionaryEntry {
    id: string; // e.g. "en_hello_123"
    w: string; // word (for indexing)
    lang: string; // language code
    d: any; // data (the full entry object)
}

// Interface for Dictionary Manifest/Status
export interface DictionaryStatus {
    language: string;
    version: string;
    totalChunks: number;
    downloadedChunks: number;
    lastUpdated: number;
    isComplete: boolean;
}

// Interface for Online Dictionary Cache
export interface OnlineCacheEntry {
    id?: number;
    w: string;
    lang: string;
    entries: any[];
    fetchedAt: number;
}

export class DictionaryDatabase extends Dexie {
    chunks!: Table<DictionaryChunk, string>;
    entries!: Table<StoredDictionaryEntry, string>;
    status!: Table<DictionaryStatus, string>;
    onlineCache!: Table<OnlineCacheEntry, number>;

    constructor() {
        super('MetheusDictionaries');

        // Define schema
        this.version(1).stores({
            chunks: 'id, language, chunkId',
            entries: 'id, w, lang, [lang+w]', // Compound index for fast lookup
            status: 'language',
        });

        // Version 2: Add online dictionary cache store
        this.version(2).stores({
            chunks: 'id, language, chunkId',
            entries: 'id, w, lang, [lang+w]',
            status: 'language',
            onlineCache: '++id, [lang+w], fetchedAt',
        });
    }

    /**
     * Bulk add entries to the database
     */
    async bucketImport(language: string, chunkId: string, version: number, entries: any[]): Promise<void> {
        await this.transaction('rw', this.chunks, this.entries, async () => {
            // 1. Register chunk
            await this.chunks.put({
                id: `${language}_${chunkId}`,
                language,
                chunkId,
                version,
                loadedAt: Date.now(),
            });

            // 2. Add entries
            // Remap optimized JSON entries to storage format
            const storedEntries: StoredDictionaryEntry[] = entries.map((e) => ({
                id: `${language}_${e.w}_${Math.random().toString(36).substr(2, 5)}`,
                w: e.w,
                lang: language,
                d: e,
            }));

            await this.entries.bulkPut(storedEntries);
        });
    }

    /**
     * Look up a word (Exact or Case-insensitive logic handled by caller or simple regex here)
     * Dexie `equals` is case-sensitive usually, so we might store lowercase `w` if we want easy case-insensitivity,
     * but the optimized dicts already have `w` as the display word.
     * We'll implement a flexible lookup in the service layer (exact -> lower -> title).
     */
    async lookup(word: string, language: string): Promise<any[]> {
        console.log(`[DB Debug] Looking up: lang='${language}', word='${word}'`);
        console.log(`[DB Debug] Index being used: [lang+w]`);

        // Try exact match first
        const results = await this.entries.where('[lang+w]').equals([language, word]).toArray();
        console.log(`[DB Debug] Exact match results: ${results.length}`);

        return results.map((r) => r.d);
    }

    /**
     * Lookup with case fallback (helper)
     */
    async lookupWithFallback(word: string, language: string): Promise<any[]> {
        console.log(`[DB Debug] lookupWithFallback called for '${word}' in '${language}'`);

        // 1. Exact
        let results = await this.lookup(word, language);
        console.log(`[DB Debug] Step 1 - Exact match: ${results.length} results`);
        if (results.length > 0) return results;

        // 2. Lowercase
        const lower = word.toLowerCase();
        if (lower !== word) {
            console.log(`[DB Debug] Step 2 - Trying lowercase: '${lower}'`);
            results = await this.lookup(lower, language);
            console.log(`[DB Debug] Step 2 - Lowercase match: ${results.length} results`);
            if (results.length > 0) return results;
        } else {
            console.log(`[DB Debug] Step 2 - Skipping lowercase (same as original)`);
        }

        // 3. Titlecase
        const title = lower.charAt(0).toUpperCase() + lower.slice(1);
        if (title !== word && title !== lower) {
            console.log(`[DB Debug] Step 3 - Trying titlecase: '${title}'`);
            results = await this.lookup(title, language);
            console.log(`[DB Debug] Step 3 - Titlecase match: ${results.length} results`);
            if (results.length > 0) return results;
        } else {
            console.log(`[DB Debug] Step 3 - Skipping titlecase (same as previous)`);
        }

        console.log(`[DB Debug] No results found for '${word}' in any case variant`);
        return [];
    }

    /**
     * Check if a language is fully downloaded
     */
    async isLanguageDownloaded(language: string): Promise<boolean> {
        const status = await this.status.get(language);
        return !!status?.isComplete;
    }

    /**
     * Delete all data associated with a language
     */
    async deleteLanguage(language: string): Promise<void> {
        await this.transaction('rw', this.chunks, this.entries, this.status, async () => {
            // 1. Delete Status
            await this.status.delete(language);

            // 2. Delete Chunks
            await this.chunks.where('language').equals(language).delete();

            // 3. Delete Entries
            await this.entries.where('lang').equals(language).delete();
        });
    }

    // ── Online Cache Methods ──────────────────────────────────────────────

    /**
     * Get cached online lookup result for a word+language pair.
     */
    async getOnlineCache(word: string, language: string): Promise<OnlineCacheEntry | undefined> {
        try {
            const results = await this.onlineCache.where('[lang+w]').equals([language, word.toLowerCase()]).toArray();
            return results.length > 0 ? results[0] : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Store online lookup result in cache.
     */
    async setOnlineCache(word: string, language: string, entries: any[]): Promise<void> {
        const normalizedWord = word.toLowerCase();
        try {
            // Delete existing entry for this word+lang
            await this.onlineCache.where('[lang+w]').equals([language, normalizedWord]).delete();

            // Insert new
            await this.onlineCache.add({
                w: normalizedWord,
                lang: language,
                entries,
                fetchedAt: Date.now(),
            });
        } catch (e) {
            console.warn('[DictDB] Failed to write online cache:', e);
        }
    }

    /**
     * Delete expired online cache entries.
     */
    async cleanExpiredOnlineCache(ttlMs: number): Promise<number> {
        const cutoff = Date.now() - ttlMs;
        try {
            const count = await this.onlineCache.where('fetchedAt').below(cutoff).delete();
            return count;
        } catch {
            return 0;
        }
    }
}

export const db = new DictionaryDatabase();
