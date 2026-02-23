/**
 * ============================================================================
 * KNOWN WORDS PROVIDER ADAPTER
 * ============================================================================
 *
 * Adapta el MetheusSyncService para funcionar con el motor L+1.
 * Implementa la interfaz KnownWordsProvider.
 */

import type { KnownWordsProvider, WordKnowledgeStatus } from '@metheus/common/l-plus-one';
import { MetheusSyncService, WordStatus } from './metheus-sync';

/**
 * Adaptador que conecta MetheusSyncService con KnownWordsProvider
 */
export class KnownWordsProviderAdapter implements KnownWordsProvider {
    private readonly _syncService: MetheusSyncService;
    private readonly _language: string;

    // Cache local para lookups síncronos
    private _knownSet: Set<string> = new Set();
    private _learningSet: Set<string> = new Set();
    private _initialized: boolean = false;

    constructor(syncService: MetheusSyncService, language: string) {
        this._syncService = syncService;
        this._language = language;
    }

    /**
     * Inicializar el adaptador cargando datos del sync service
     */
    async initialize(): Promise<void> {
        if (this._initialized) return;

        // Cargar palabras del sync service
        const words = this._syncService.getKnownWordsForLanguage(this._language);

        for (const word of words) {
            const normalized = word.word.toLowerCase();

            if (word.status >= 4) {
                // Status 4-5 = conocida
                this._knownSet.add(normalized);
            } else if (word.status >= 1) {
                // Status 1-3 = en aprendizaje
                this._learningSet.add(normalized);
            }
        }

        this._initialized = true;
        console.log(
            `[KnownWordsAdapter] Initialized with ${this._knownSet.size} known, ${this._learningSet.size} learning`
        );
    }

    /**
     * Refrescar datos desde el sync service
     */
    async refresh(): Promise<void> {
        this._knownSet.clear();
        this._learningSet.clear();
        this._initialized = false;
        await this.initialize();
    }

    /**
     * Verificar si una palabra es conocida
     */
    isKnown(word: string): boolean {
        return this._knownSet.has(word.toLowerCase());
    }

    /**
     * Verificar si una palabra está en aprendizaje
     */
    isLearning(word: string): boolean {
        return this._learningSet.has(word.toLowerCase());
    }

    /**
     * Obtener el estado de una palabra
     */
    getStatus(word: string): WordKnowledgeStatus {
        const normalized = word.toLowerCase();

        if (this._knownSet.has(normalized)) return 'known';
        if (this._learningSet.has(normalized)) return 'learning';

        return 'unknown';
    }

    /**
     * Obtener todas las palabras conocidas
     */
    getKnownWords(): Set<string> {
        return new Set(this._knownSet);
    }

    /**
     * Obtener todas las palabras en aprendizaje
     */
    getLearningWords(): Set<string> {
        return new Set(this._learningSet);
    }

    /**
     * Actualizar estado cuando se marca una palabra desde la extensión
     */
    updateWord(word: string, status: 'known' | 'learning' | 'unknown'): void {
        const normalized = word.toLowerCase();

        // Actualizar sets locales
        this._knownSet.delete(normalized);
        this._learningSet.delete(normalized);

        if (status === 'known') {
            this._knownSet.add(normalized);
        } else if (status === 'learning') {
            this._learningSet.add(normalized);
        }
    }

    /**
     * Obtener estadísticas
     */
    getStats(): { known: number; learning: number; total: number } {
        return {
            known: this._knownSet.size,
            learning: this._learningSet.size,
            total: this._knownSet.size + this._learningSet.size,
        };
    }

    /**
     * Verificar si está inicializado
     */
    get initialized(): boolean {
        return this._initialized;
    }
}

/**
 * Convertir WordStatus numérico a WordKnowledgeStatus
 */
export function wordStatusToKnowledge(status: WordStatus): WordKnowledgeStatus {
    if (status >= 4) return 'known';
    if (status >= 1) return 'learning';
    return 'unknown';
}

/**
 * Convertir WordKnowledgeStatus a WordStatus numérico
 */
export function knowledgeToWordStatus(status: WordKnowledgeStatus): WordStatus {
    switch (status) {
        case 'known':
            return 5;
        case 'learning':
            return 2;
        default:
            return 0;
    }
}
