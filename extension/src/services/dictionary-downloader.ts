import { db } from './db/dictionary-db';
import { SettingsProvider } from '@metheus/common/settings';

/**
 * Service to handle downloading dictionaries
 * Simulates the "API gives me a link" flow by constructing CDN URLs or asking API.
 */
type DictionaryManifestEntry = {
    dictionary: string;
    language?: string;
    chunks?: Record<string, unknown>;
};

type DictionaryPlan = {
    dictId: string;
    chunks: string[];
};

export class DictionaryDownloadService {
    private static CHUNK_CONCURRENCY = 8; // Parallel chunk downloads per dictionary
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
        void settingsProvider;
        const source = this.getSourceConfig();

        // 1. Fetch Manifest
        onProgress?.(0, 'Checking manifest...');
        let manifest: DictionaryManifestEntry[] = [];
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

        const targetDicts = this.resolveTargetDictionaries(language, manifest, explicitDictionaryIds);

        console.log(`[DictDownloader] Downloading dictionaries for ${language}:`, targetDicts);

        const plans: DictionaryPlan[] = targetDicts.map((dictId) => ({
            dictId,
            chunks: this.resolveChunkIds(dictId, manifest),
        }));
        const totalChunks = plans.reduce((sum, plan) => sum + plan.chunks.length, 0);

        await db.status.put({
            language,
            version: '2.1',
            totalChunks,
            downloadedChunks: 0,
            lastUpdated: Date.now(),
            isComplete: false,
        });

        let completedAcrossAll = 0;
        let failedAcrossAll = 0;

        // Process dictionary IDs serially to avoid DB and decompression contention.
        for (const plan of plans) {
            const completedBefore = completedAcrossAll;
            const result = await this.downloadSingleDictionary(
                source.baseUrl,
                language,
                plan,
                (completedForDict, totalForDict, status) => {
                    const completedTotal = completedBefore + completedForDict;
                    const progress =
                        totalChunks > 0
                            ? Math.max(0, Math.min(100, Math.round((completedTotal / totalChunks) * 100)))
                            : 100;

                    onProgress?.(progress, `${plan.dictId}: ${status}`);
                    void db.status.put({
                        language,
                        version: '2.1',
                        totalChunks,
                        downloadedChunks: Math.min(totalChunks, completedTotal),
                        lastUpdated: Date.now(),
                        isComplete: false,
                    });

                    // Prevent TypeScript "unused arg" if we change this callback shape in the future.
                    void totalForDict;
                }
            );

            completedAcrossAll += result.completed;
            failedAcrossAll += result.failed;
        }

        if (failedAcrossAll > 0) {
            await db.status.put({
                language,
                version: '2.1',
                totalChunks,
                downloadedChunks: Math.min(totalChunks, completedAcrossAll),
                lastUpdated: Date.now(),
                isComplete: false,
            });
            const message = `Completed with ${failedAcrossAll} failed parts`;
            onProgress?.(
                totalChunks > 0 ? Math.max(0, Math.min(100, Math.round((completedAcrossAll / totalChunks) * 100))) : 0,
                message
            );
            throw new Error(`[DictDownloader] ${language} ${message}`);
        }

        await db.status.put({
            language,
            version: '2.1',
            totalChunks,
            downloadedChunks: totalChunks,
            lastUpdated: Date.now(),
            isComplete: true,
        });

        onProgress?.(100, 'Complete');
    }

    private static resolveTargetDictionaries(
        language: string,
        manifest: DictionaryManifestEntry[],
        explicitDictionaryIds?: string[]
    ): string[] {
        // Priority 1: Use explicit IDs from config (Standard Parity)
        if (explicitDictionaryIds && explicitDictionaryIds.length > 0) {
            return explicitDictionaryIds;
        }

        // Priority 2: Use manifest based discovery (Legacy/Fallback)
        if (manifest.length > 0) {
            const manifestDicts = manifest
                .filter(
                    (entry) =>
                        entry.language === language ||
                        entry.dictionary.startsWith(this.getDictionaryFolderName(language)) ||
                        entry.dictionary.startsWith(`LN_${language}`)
                )
                .map((entry) => entry.dictionary);
            if (manifestDicts.length > 0) {
                return manifestDicts;
            }
        }

        // Fallback to standard naming if manifest fails
        return [this.getDictionaryFolderName(language)];
    }

    private static resolveChunkIds(dictId: string, manifest: DictionaryManifestEntry[]): string[] {
        const dictStats = manifest.find((entry) => entry.dictionary === dictId);
        if (dictStats?.chunks) {
            return Object.keys(dictStats.chunks).sort();
        }

        // Fallback A-Z
        return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    }

    private static async downloadSingleDictionary(
        baseUrl: string,
        language: string,
        plan: DictionaryPlan,
        onProgress: (completed: number, total: number, status: string) => void
    ): Promise<{ completed: number; failed: number }> {
        const total = plan.chunks.length;
        const loadedChunks = await db.getLoadedChunkIds(language, plan.dictId);
        const pendingChunks: string[] = [];

        let completed = 0; // Includes already imported chunks for resume support
        let failed = 0;

        for (const chunkId of plan.chunks) {
            if (loadedChunks.has(chunkId)) {
                completed++;
            } else {
                pendingChunks.push(chunkId);
            }
        }

        onProgress(completed, total, `Downloaded ${completed}/${total} parts`);

        // Process in batches
        for (let i = 0; i < pendingChunks.length; i += this.CHUNK_CONCURRENCY) {
            const batch = pendingChunks.slice(i, i + this.CHUNK_CONCURRENCY);

            await Promise.allSettled(
                batch.map(async (chunkId) => {
                    try {
                        await this.processChunk(baseUrl, language, plan.dictId, chunkId);
                        completed++;
                    } catch (e) {
                        console.error(`[DictDownloader] Failed chunk ${chunkId} for ${plan.dictId}`, e);
                        failed++;
                    }
                })
            );

            onProgress(completed, total, `Downloaded ${completed}/${total} parts`);
        }

        if (failed > 0) {
            console.warn(`[DictDownloader] ${plan.dictId} completed with ${failed} errors`);
        }

        return { completed, failed };
    }

    /**
     * Process a single chunk: Download -> Decompress -> Store
     */
    private static async processChunk(
        baseUrl: string,
        language: string,
        dictId: string,
        chunkId: string
    ): Promise<void> {
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
            await db.bucketImport(language, chunkId, 1, data, dictId);
        } else {
            throw new Error(`Chunk ${chunkId} from ${dictId} did not return array data`);
        }
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

        return new Response(decompressed).json();
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
