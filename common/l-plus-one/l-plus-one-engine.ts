/**
 * ============================================================================
 * L+1 ENGINE - Motor de Comprehensible Input
 * ============================================================================
 *
 * Implementación completa de la teoría i+1 de Krashen para detectar
 * contenido con nivel óptimo de comprensión para aprendizaje de idiomas.
 *
 * El motor analiza texto y determina:
 * - Porcentaje de comprensión basado en palabras conocidas
 * - Nivel L+N (0-5) del contenido
 * - Palabras desconocidas candidatas para aprender
 * - Recomendaciones de minado basadas en frecuencia
 */

import type {
    L1SentenceResult,
    UnknownWordAnalysis,
    VideoAnalysisResult,
    KnownWordsProvider,
    L1EngineConfig,
    SubtitleForAnalysis,
    ComprehensionLevel,
    FrequencyData,
} from './types';

import { tokenize, normalizeWord } from './tokenizer';
import {
    loadFrequencyData,
    getWordFrequencyRank,
    rankToScore,
    rankToDifficulty,
    isL1Candidate,
    initializeWithFallback,
    getFrequencyDataFromCache,
} from './frequency-data';

/**
 * Configuración por defecto del motor
 */
const DEFAULT_CONFIG: Required<L1EngineConfig> = {
    language: 'en',
    l1MinComprehension: 85,
    l1MaxComprehension: 98,
    l1MaxUnknownWords: 2,
    minFrequencyForL1: 5,
    countLearningAsHalfKnown: true,
    maxRecommendedWords: 20,
};

/**
 * Motor L+1 para análisis de comprensión
 */
export class LPlusOneEngine {
    private readonly config: Required<L1EngineConfig>;
    private readonly knownWords: KnownWordsProvider;
    private frequencyData: FrequencyData | null = null;
    private initialized: boolean = false;

    constructor(knownWords: KnownWordsProvider, config: L1EngineConfig) {
        this.knownWords = knownWords;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Inicializar el motor (cargar datos de frecuencia)
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Inicializar con fallback embebido primero
        initializeWithFallback(this.config.language);

        // Intentar cargar datos completos
        try {
            this.frequencyData = await loadFrequencyData(this.config.language);
        } catch (error) {
            console.warn('[LPlusOneEngine] Using fallback frequency data:', error);
            this.frequencyData = getFrequencyDataFromCache(this.config.language) || null;
        }

        this.initialized = true;
    }

    /**
     * Analizar una sola frase
     * @param sentence Frase a analizar
     * @param timestamp Timestamp opcional del subtítulo
     */
    analyze(sentence: string, timestamp?: number): L1SentenceResult {
        // Asegurar inicialización mínima
        if (!this.frequencyData) {
            initializeWithFallback(this.config.language);
            this.frequencyData = getFrequencyDataFromCache(this.config.language) || {
                rankings: new Map(),
                totalWords: 0,
                language: this.config.language,
                source: 'empty',
            };
        }

        // Tokenizar
        const { contentWords, uniqueWords } = tokenize(sentence, {
            language: this.config.language,
            excludeStopWords: true,
            lowercase: true,
            minLength: 2,
        });

        // Si no hay palabras de contenido, es 100% comprensión
        if (contentWords.length === 0) {
            return {
                sentence,
                comprehension: 100,
                level: 'L+0',
                unknownWords: [],
                learningWords: [],
                contentWordCount: 0,
                knownWordCount: 0,
                isRecommended: false,
                timestamp,
            };
        }

        // Contar palabras conocidas y desconocidas
        let knownCount = 0;
        let learningCount = 0;
        const unknownWords: UnknownWordAnalysis[] = [];
        const learningWords: string[] = [];
        const seenUnknown = new Set<string>();

        for (const word of contentWords) {
            const normalized = normalizeWord(word);

            if (this.knownWords.isKnown(normalized)) {
                knownCount++;
            } else if (this.knownWords.isLearning(normalized)) {
                learningCount++;
                if (!learningWords.includes(normalized)) {
                    learningWords.push(normalized);
                }
            } else {
                // Palabra desconocida
                if (!seenUnknown.has(normalized)) {
                    seenUnknown.add(normalized);

                    const rank = getWordFrequencyRank(normalized, this.frequencyData);
                    const score = rankToScore(rank, this.frequencyData.totalWords);
                    const difficulty = rankToDifficulty(rank, this.frequencyData.totalWords);

                    unknownWords.push({
                        word,
                        normalized,
                        frequencyRank: rank === Infinity ? 99999 : rank,
                        frequencyScore: score,
                        difficulty,
                        isL1Candidate: isL1Candidate(
                            rank,
                            this.frequencyData.totalWords,
                            this.config.minFrequencyForL1
                        ),
                        occurrences: 1,
                        contexts: [sentence],
                    });
                } else {
                    // Incrementar ocurrencias
                    const existing = unknownWords.find((w) => w.normalized === normalized);
                    if (existing) {
                        existing.occurrences++;
                    }
                }
            }
        }

        // Calcular comprensión
        // Opcionalmente contar palabras en aprendizaje como 0.5
        let effectiveKnown = knownCount;
        if (this.config.countLearningAsHalfKnown) {
            effectiveKnown += learningCount * 0.5;
        }

        const comprehension = Math.round((effectiveKnown / contentWords.length) * 100);

        // Determinar nivel
        const level = this.calculateLevel(comprehension, unknownWords.length);

        // ¿Es recomendada?
        const isRecommended = (level === 'L+1' || level === 'L+2') && unknownWords.some((w) => w.isL1Candidate);

        return {
            sentence,
            comprehension,
            level,
            unknownWords: unknownWords.sort((a, b) => a.frequencyRank - b.frequencyRank),
            learningWords,
            contentWordCount: contentWords.length,
            knownWordCount: knownCount,
            isRecommended,
            timestamp,
        };
    }

    /**
     * Calcular nivel L+N basado en comprensión y palabras desconocidas
     */
    private calculateLevel(comprehension: number, unknownCount: number): ComprehensionLevel {
        const { l1MinComprehension, l1MaxComprehension, l1MaxUnknownWords } = this.config;

        if (comprehension >= l1MaxComprehension) {
            return 'L+0';
        }

        if (comprehension >= l1MinComprehension && unknownCount <= l1MaxUnknownWords) {
            return 'L+1';
        }

        if (comprehension >= 75 && unknownCount <= 3) {
            return 'L+2';
        }

        if (comprehension >= 60) {
            return 'L+3';
        }

        return 'L+5';
    }

    /**
     * Analizar múltiples subtítulos (video completo)
     * @param subtitles Array de subtítulos
     * @param videoId ID del video (opcional)
     */
    analyzeSubtitles(subtitles: SubtitleForAnalysis[], videoId?: string): VideoAnalysisResult {
        const sentenceResults: L1SentenceResult[] = [];
        const wordOccurrences = new Map<string, UnknownWordAnalysis>();

        // Analizar cada subtítulo
        for (const subtitle of subtitles) {
            const result = this.analyze(subtitle.text, subtitle.start);
            sentenceResults.push(result);

            // Acumular palabras desconocidas
            for (const unknownWord of result.unknownWords) {
                const existing = wordOccurrences.get(unknownWord.normalized);

                if (existing) {
                    existing.occurrences += unknownWord.occurrences;
                    existing.contexts.push(...unknownWord.contexts);
                } else {
                    wordOccurrences.set(unknownWord.normalized, { ...unknownWord });
                }
            }
        }

        // Filtrar L+1 sentences
        const l1Sentences = sentenceResults.filter((r) => r.level === 'L+1');
        const l2Sentences = sentenceResults.filter((r) => r.level === 'L+2');

        // Calcular comprensión promedio
        const totalComprehension = sentenceResults.reduce((sum, r) => sum + r.comprehension, 0);
        const averageComprehension =
            sentenceResults.length > 0 ? Math.round(totalComprehension / sentenceResults.length) : 0;

        // Distribución de niveles
        const levelDistribution = {
            'L+0': 0,
            'L+1': 0,
            'L+2': 0,
            'L+3': 0,
            'L+5': 0,
        };

        for (const result of sentenceResults) {
            levelDistribution[result.level]++;
        }

        // Palabras recomendadas (ordenadas por frecuencia, solo candidatas L+1)
        const recommendedWords = Array.from(wordOccurrences.values())
            .filter((w) => w.isL1Candidate)
            .sort((a, b) => {
                // Primero por ocurrencias (más = mejor)
                if (b.occurrences !== a.occurrences) {
                    return b.occurrences - a.occurrences;
                }
                // Luego por frecuencia (más común = mejor)
                return a.frequencyRank - b.frequencyRank;
            })
            .slice(0, this.config.maxRecommendedWords)
            .map((w) => ({
                ...w,
                // Limitar contextos a 3 por palabra
                contexts: w.contexts.slice(0, 3),
            }));

        return {
            videoId,
            totalSentences: subtitles.length,
            l1SentenceCount: l1Sentences.length,
            l2SentenceCount: l2Sentences.length,
            averageComprehension,
            sentenceResults,
            l1Sentences,
            recommendedWords,
            analyzedAt: Date.now(),
            levelDistribution,
        };
    }

    /**
     * Obtener palabras L+1 de un conjunto de subtítulos rápidamente
     * (versión ligera sin análisis completo)
     */
    getL1Words(subtitles: SubtitleForAnalysis[]): UnknownWordAnalysis[] {
        const analysis = this.analyzeSubtitles(subtitles);
        return analysis.recommendedWords;
    }

    /**
     * Verificar si una frase es L+1
     */
    isL1Sentence(sentence: string): boolean {
        const result = this.analyze(sentence);
        return result.isRecommended;
    }

    /**
     * Obtener configuración actual
     */
    getConfig(): Required<L1EngineConfig> {
        return { ...this.config };
    }

    /**
     * Verificar si está inicializado
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Crear una instancia del motor L+1
 */
export async function createLPlusOneEngine(
    knownWords: KnownWordsProvider,
    config: L1EngineConfig
): Promise<LPlusOneEngine> {
    const engine = new LPlusOneEngine(knownWords, config);
    await engine.initialize();
    return engine;
}

/**
 * Crear un proveedor de palabras conocidas simple desde un Set
 */
export function createSimpleKnownWordsProvider(
    known: Set<string>,
    learning: Set<string> = new Set()
): KnownWordsProvider {
    const normalizedKnown = new Set(Array.from(known).map((word) => normalizeWord(word)));
    const normalizedLearning = new Set(Array.from(learning).map((word) => normalizeWord(word)));

    return {
        isKnown(word: string): boolean {
            return normalizedKnown.has(normalizeWord(word));
        },

        isLearning(word: string): boolean {
            return normalizedLearning.has(normalizeWord(word));
        },

        getStatus(word: string) {
            const normalized = normalizeWord(word);
            if (normalizedKnown.has(normalized)) return 'known';
            if (normalizedLearning.has(normalized)) return 'learning';
            return 'unknown';
        },

        getKnownWords(): Set<string> {
            return new Set(normalizedKnown);
        },

        getLearningWords(): Set<string> {
            return new Set(normalizedLearning);
        },
    };
}
