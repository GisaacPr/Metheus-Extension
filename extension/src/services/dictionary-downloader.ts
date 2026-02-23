import { db, DictionaryChunk } from './db/dictionary-db';
import { SettingsProvider } from '@metheus/common/settings';

/**
 * Service to handle downloading dictionaries
 * Simulates the "API gives me a link" flow by constructing CDN URLs or asking API.
 */
export class DictionaryDownloadService {
    private static BATCH_SIZE = 6; // Parallel downloads limit (browser/server friendly)
    private static CDN_BASE_URL = 'https://cdn.metheus.app/file/metheus-assets';

    /**
     * Get the base URL for the dictionary manifest/chunks.
     */
    static getSourceConfig(): { baseUrl: string; manifestUrl: string } {
        // We use the public CDN URL directly.
        // In the future this could be overridden by settings if needed.
        const baseUrl = this.CDN_BASE_URL;
        return {
            baseUrl: `${baseUrl}/dictionaries`,
            manifestUrl: `${baseUrl}/dictionaries/_STATS_PHASE2.json`,
        };
    }

    /**
     * Download and install a dictionary for a specific language
     */
    static async downloadDictionary(
        settingsProvider: SettingsProvider,
        language: string,
        onProgress?: (percent: number, status: string) => void,
        explicitDictionaryIds?: string[]
    ): Promise<void> {
        const source = this.getSourceConfig();

        // 1. Fetch Manifest
        onProgress?.(0, 'Checking manifest...');
        let manifest: any[] = [];
        try {
            const res = await fetch(source.manifestUrl);
            if (res.ok) {
                manifest = await res.json();
            } else {
                console.warn('[DictDownloader] Failed to fetch manifest:', res.status);
            }
        } catch (e) {
            console.warn('[DictDownloader] Manifest fetch error', e);
        }

        // Get dictionary IDs for this language
        // Priority 1: Use explicit IDs from config (Standard Parity)
        // Priority 2: Use manifest based discovery (Legacy/Fallback)
        let targetDicts: string[] = [];

        if (explicitDictionaryIds && explicitDictionaryIds.length > 0) {
            targetDicts = explicitDictionaryIds;
        } else if (manifest.length > 0) {
            // Find dictionaries where language matches
            targetDicts = manifest
                .filter(
                    (d: any) =>
                        d.language === language || d.dictionary.startsWith(this.getDictionaryFolderName(language))
                )
                .map((d: any) => d.dictionary);
        }

        if (targetDicts.length === 0) {
            // Fallback to standard naming if manifest fails
            targetDicts = [this.getDictionaryFolderName(language)];
        }

        console.log(`[DictDownloader] Downloading dictionaries for ${language}:`, targetDicts);

        let totalProgress = 0;
        const progressPerDict = 100 / targetDicts.length;

        for (const dictId of targetDicts) {
            await this.downloadSingleDictionary(source.baseUrl, dictId, manifest, (p, s) => {
                const overall = totalProgress + (p * progressPerDict) / 100;
                onProgress?.(overall, `${dictId}: ${s}`);
            });
            totalProgress += progressPerDict;
        }

        // Update Status in DB
        await db.status.put({
            language,
            version: '2.0', // Phase 2
            totalChunks: 0, // We could sum them up but simple is fine
            downloadedChunks: 0,
            lastUpdated: Date.now(),
            isComplete: true,
        });

        onProgress?.(100, 'Complete');
    }

    private static async downloadSingleDictionary(
        baseUrl: string,
        dictId: string,
        manifest: any[],
        onProgress: (p: number, s: string) => void
    ): Promise<void> {
        // Determine chunks
        let chunks: string[] = [];
        const dictStats = manifest.find((d: any) => d.dictionary === dictId);

        if (dictStats && dictStats.chunks) {
            chunks = Object.keys(dictStats.chunks);
        } else {
            // Fallback A-Z
            chunks = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        }

        const total = chunks.length;
        let completed = 0;
        let failed = 0;

        // Process in batches
        for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
            const batch = chunks.slice(i, i + this.BATCH_SIZE);

            await Promise.allSettled(
                batch.map(async (chunkId) => {
                    try {
                        await this.processChunk(baseUrl, dictId, chunkId);
                        completed++;
                    } catch (e) {
                        console.error(`[DictDownloader] Failed chunk ${chunkId} for ${dictId}`, e);
                        failed++;
                    }
                })
            );

            onProgress((completed / total) * 100, `Downloaded ${completed}/${total} parts`);
        }

        if (failed > 0) {
            // We don't throw, just warn, so other dicts can proceed
            console.warn(`[DictDownloader] ${dictId} completed with ${failed} errors`);
        }
    }

    /**
     * Process a single chunk: Download -> Decompress -> Store
     */
    private static async processChunk(baseUrl: string, dictId: string, chunkId: string): Promise<void> {
        const gzUrl = `${baseUrl}/${dictId}/${chunkId}.json.gz`;
        const jsonUrl = `${baseUrl}/${dictId}/${chunkId}.json`;

        let data: any = null;

        // Try GZIP first (Priority)
        try {
            data = await this.fetchGzip(gzUrl);
        } catch (e) {
            // Fallback to JSON
            const res = await fetch(jsonUrl);
            if (!res.ok) throw new Error(`Chunk ${chunkId} not found`);
            data = await res.json();
        }

        if (Array.isArray(data)) {
            const langCode = this.mapDictIdToLang(dictId);
            await db.bucketImport(langCode, chunkId, 1, data);
        }
    }

    private static mapDictIdToLang(dictId: string): string {
        // Reverse map or simple heuristic
        if (dictId.startsWith('English')) return 'en';
        if (dictId.startsWith('Español')) return 'es';
        if (dictId.startsWith('Frances')) return 'fr';
        if (dictId.startsWith('Aleman')) return 'de';
        if (dictId.startsWith('Italiano')) return 'it';
        if (dictId.startsWith('Portugues')) return 'pt';
        if (dictId.startsWith('Japones')) return 'ja';
        if (dictId.startsWith('Chino')) return 'zh';
        if (dictId.startsWith('Korean')) return 'ko';
        if (dictId.startsWith('Ruso')) return 'ru';

        // LN_en style
        if (dictId.startsWith('LN_')) return dictId.split('_')[1];

        // Generic fallback: try to find language code in string
        return 'en'; // Dangerous fallback?
    }

    /**
     * Fetch and decompress GZIP file using browser native API
     */
    private static async fetchGzip(url: string): Promise<any> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Check if DecompressionStream is supported (Chrome 80+)
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('DecompressionStream not supported');
        }

        const ds = new DecompressionStream('gzip');
        const decompressed = res.body?.pipeThrough(ds);
        if (!decompressed) throw new Error('Decompression failed');

        const blob = await new Response(decompressed).blob();
        const text = await blob.text();
        return JSON.parse(text);
    }

    private static getDictionaryFolderName(lang: string): string {
        const map: Record<string, string> = {
            en: 'English_dictionary',
            es: 'Español_dictionary',
            ja: 'Japones_dictionary',
            fr: 'Frances_dictionary',
            de: 'Aleman_dictionary',
            it: 'Italiano_dictionary',
            pt: 'Portugues_dictionary',
            zh: 'Chino_dictionary',
            ko: 'Korean_dictionary',
            ru: 'Ruso_dictionary',
            vi: 'Vietnamese_dictionary',
            ar: 'Arabic_dictionary',
            hi: 'Hindi_dictionary',
            tr: 'Turkish_dictionary',
            pl: 'Polish_dictionary',
            nl: 'Dutch_dictionary',
            sv: 'Swedish_dictionary',
        };
        return map[lang] || `${lang}_dictionary`;
    }
}
