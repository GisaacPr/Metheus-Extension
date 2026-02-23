/**
 * ============================================================================
 * L+1 Types
 * ============================================================================
 */

/** Niveles de comprensión basados en teoría i+1 de Krashen */
export type ComprehensionLevel = 'L+0' | 'L+1' | 'L+2' | 'L+3' | 'L+5';

/** Dificultad estimada de una palabra */
export type WordDifficulty = 'easy' | 'medium' | 'hard' | 'rare';

/** Estado de conocimiento de una palabra */
export type WordKnowledgeStatus = 'known' | 'learning' | 'seen' | 'unknown';

/**
 * Resultado del análisis L+1 de una frase
 */
export interface L1SentenceResult {
    /** La oración original */
    sentence: string;

    /** Porcentaje de comprensión (0-100) */
    comprehension: number;

    /** Nivel L+N calculado */
    level: ComprehensionLevel;

    /** Palabras desconocidas encontradas */
    unknownWords: UnknownWordAnalysis[];

    /** Palabras en proceso de aprendizaje */
    learningWords: string[];

    /** Total de palabras de contenido (sin stop words) */
    contentWordCount: number;

    /** Total de palabras conocidas */
    knownWordCount: number;

    /** ¿Es recomendada para estudio? (L+1 o L+2) */
    isRecommended: boolean;

    /** Timestamp del subtítulo (si aplica) */
    timestamp?: number;
}

/**
 * Análisis detallado de una palabra desconocida
 */
export interface UnknownWordAnalysis {
    /** La palabra original */
    word: string;

    /** Palabra normalizada (lowercase) */
    normalized: string;

    /** Ranking de frecuencia (1 = más común) */
    frequencyRank: number;

    /** Score de frecuencia 1-10 (10 = muy común) */
    frequencyScore: number;

    /** Dificultad estimada */
    difficulty: WordDifficulty;

    /** ¿Es candidata L+1? (solo palabras comunes) */
    isL1Candidate: boolean;

    /** Cantidad de veces que aparece en el contenido */
    occurrences: number;

    /** Contextos donde aparece */
    contexts: string[];
}

/**
 * Resultado del análisis de un video/contenido completo
 */
export interface VideoAnalysisResult {
    /** ID del video (si aplica) */
    videoId?: string;

    /** Total de subtítulos analizados */
    totalSentences: number;

    /** Cantidad de frases L+1 */
    l1SentenceCount: number;

    /** Cantidad de frases L+2 */
    l2SentenceCount: number;

    /** Comprensión promedio del contenido */
    averageComprehension: number;

    /** Resultados de todas las frases */
    sentenceResults: L1SentenceResult[];

    /** Frases L+1 filtradas */
    l1Sentences: L1SentenceResult[];

    /** Palabras únicas recomendadas para aprender */
    recommendedWords: UnknownWordAnalysis[];

    /** Timestamp del análisis */
    analyzedAt: number;

    /** Distribución de niveles */
    levelDistribution: {
        'L+0': number;
        'L+1': number;
        'L+2': number;
        'L+3': number;
        'L+5': number;
    };
}

/**
 * Interfaz para proveedor de palabras conocidas
 */
export interface KnownWordsProvider {
    /** Verificar si una palabra es conocida */
    isKnown(word: string): boolean;

    /** Verificar si una palabra está en aprendizaje */
    isLearning(word: string): boolean;

    /** Obtener el estado de una palabra */
    getStatus(word: string): WordKnowledgeStatus;

    /** Obtener todas las palabras conocidas (para batch) */
    getKnownWords(): Set<string>;

    /** Obtener todas las palabras en aprendizaje */
    getLearningWords(): Set<string>;
}

/**
 * Configuración del motor L+1
 */
export interface L1EngineConfig {
    /** Idioma para análisis */
    language: string;

    /** Umbral mínimo de comprensión para L+1 (default: 85) */
    l1MinComprehension?: number;

    /** Umbral máximo de comprensión para L+1 (default: 98) */
    l1MaxComprehension?: number;

    /** Máximo de palabras desconocidas para L+1 (default: 2) */
    l1MaxUnknownWords?: number;

    /** Frecuencia mínima para ser candidato L+1 (default: 5) */
    minFrequencyForL1?: number;

    /** Incluir palabras en aprendizaje como "parcialmente conocidas" */
    countLearningAsHalfKnown?: boolean;

    /** Máximo de palabras recomendadas (default: 20) */
    maxRecommendedWords?: number;
}

/**
 * Modelo de subtítulo para análisis
 */
export interface SubtitleForAnalysis {
    /** Texto del subtítulo */
    text: string;

    /** Tiempo de inicio en segundos */
    start: number;

    /** Tiempo de fin en segundos */
    end: number;

    /** ID del subtítulo (opcional) */
    id?: string;
}

/**
 * Datos de frecuencia de palabras
 */
export interface FrequencyData {
    /** Mapa palabra -> ranking (1 = más común) */
    rankings: Map<string, number>;

    /** Total de palabras en la lista */
    totalWords: number;

    /** Idioma de los datos */
    language: string;

    /** Fuente de los datos (e.g., "Oxford 3000") */
    source: string;
}
