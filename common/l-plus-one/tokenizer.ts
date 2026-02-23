/**
 * ============================================================================
 * Tokenizer - Procesamiento de texto para análisis L+1
 * ============================================================================
 *
 * Funciones para tokenizar texto en diferentes idiomas.
 * Maneja casos especiales como contracciones, guiones, y scripts no-latinos.
 */

import { isStopWord } from './stop-words';

/**
 * Resultado de tokenización
 */
export interface TokenizeResult {
    /** Todos los tokens encontrados */
    allTokens: string[];

    /** Solo palabras de contenido (sin stop words) */
    contentWords: string[];

    /** Palabras únicas (normalizadas) */
    uniqueWords: Set<string>;

    /** Conteo de cada palabra */
    wordCounts: Map<string, number>;
}

/**
 * Opciones de tokenización
 */
export interface TokenizeOptions {
    /** Idioma para filtrar stop words */
    language: string;

    /** Incluir números como tokens */
    includeNumbers?: boolean;

    /** Longitud mínima de palabra */
    minLength?: number;

    /** Normalizar a lowercase */
    lowercase?: boolean;

    /** Excluir stop words */
    excludeStopWords?: boolean;
}

/**
 * E-M3 FIX: Normalize a word for comparison.
 * Only strip diacritics for English — other languages use accents semantically
 * (e.g. Spanish: año ≠ ano, French: résumé ≠ resume)
 */
export function normalizeWord(word: string, language?: string): string {
    const lower = word.toLowerCase().trim();
    // Only strip diacritics for English where accents are uncommon
    if (!language || language === 'en') {
        return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return lower;
}

/**
 * Tokenizar texto para idiomas occidentales (espacios como separador)
 */
function tokenizeWestern(text: string, options: TokenizeOptions): string[] {
    const { includeNumbers = false, minLength = 2, lowercase = true } = options;

    // Remover HTML/tags si hay
    let cleanText = text.replace(/<[^>]*>/g, ' ');

    // Expandir contracciones comunes en inglés
    cleanText = cleanText
        .replace(/n't/gi, ' not')
        .replace(/'re/gi, ' are')
        .replace(/'ve/gi, ' have')
        .replace(/'ll/gi, ' will')
        .replace(/'d/gi, ' would')
        .replace(/'m/gi, ' am')
        .replace(/'s/gi, ' is'); // Nota: puede ser posesivo también

    // Tokenizar
    const tokenRegex = includeNumbers ? /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu : /[\p{L}]+(?:[-'][\p{L}]+)*/gu;

    const tokens = cleanText.match(tokenRegex) || [];

    return tokens.map((t) => (lowercase ? t.toLowerCase() : t)).filter((t) => t.length >= minLength);
}

/**
 * Tokenizar texto japonés (sin espacios)
 * Usa segmentación básica - para mejor precisión usar biblioteca como kuromoji
 */
function tokenizeJapanese(text: string, _options: TokenizeOptions): string[] {
    // Intl.Segmenter si está disponible (Chrome 87+)
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
        const segments = segmenter.segment(text);

        const words: string[] = [];
        for (const segment of segments) {
            // Solo incluir segmentos que son palabras (no puntuación)
            if (segment.isWordLike) {
                words.push(segment.segment);
            }
        }
        return words;
    }

    // Fallback: segmentación básica por caracteres/patrones
    // Separar kanji, hiragana, katakana en grupos
    const segments: string[] = [];

    // Regex para diferentes tipos de caracteres japoneses
    const regex = /[\u4e00-\u9faf]+|[\u3040-\u309f]+|[\u30a0-\u30ff]+|[\uff66-\uff9f]+/g;
    const matches = text.match(regex);

    if (matches) {
        segments.push(...matches);
    }

    return segments;
}

/**
 * Tokenizar texto chino (sin espacios)
 */
function tokenizeChinese(text: string, _options: TokenizeOptions): string[] {
    // Intl.Segmenter si está disponible
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
        const segments = segmenter.segment(text);

        const words: string[] = [];
        for (const segment of segments) {
            if (segment.isWordLike) {
                words.push(segment.segment);
            }
        }
        return words;
    }

    // E-L5 FIX: Fallback to individual characters (each CJK char has meaning)
    const chars = text.match(/[\u4e00-\u9fff]+/g) || [];
    return chars.flatMap((chunk) => {
        // Split into individual characters — more accurate than arbitrary 2-char pairs
        return [...chunk];
    });
}

/**
 * Tokenizar texto coreano
 */
function tokenizeKorean(text: string, options: TokenizeOptions): string[] {
    // Intl.Segmenter si está disponible
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter('ko', { granularity: 'word' });
        const segments = segmenter.segment(text);

        const words: string[] = [];
        for (const segment of segments) {
            if (segment.isWordLike) {
                words.push(segment.segment);
            }
        }
        return words;
    }

    // Fallback: espacios + caracteres hangul
    return tokenizeWestern(text, options).filter((w) => /[\uac00-\ud7af]/.test(w));
}

/**
 * Tokenizar texto según el idioma
 * @param text Texto a tokenizar
 * @param options Opciones de tokenización
 */
export function tokenize(text: string, options: TokenizeOptions): TokenizeResult {
    const { language, excludeStopWords = true } = options;

    let tokens: string[];

    // Seleccionar tokenizador según idioma
    switch (language) {
        case 'ja':
            tokens = tokenizeJapanese(text, options);
            break;
        case 'zh':
        case 'yue': // Cantonés
            tokens = tokenizeChinese(text, options);
            break;
        case 'ko':
            tokens = tokenizeKorean(text, options);
            break;
        default:
            // Idiomas occidentales y otros con espacios
            tokens = tokenizeWestern(text, options);
    }

    // Filtrar stop words si es necesario
    const contentWords = excludeStopWords ? tokens.filter((t) => !isStopWord(t, language)) : tokens;

    // Calcular únicos y conteos
    const wordCounts = new Map<string, number>();
    const uniqueWords = new Set<string>();

    for (const word of contentWords) {
        const normalized = normalizeWord(word);
        uniqueWords.add(normalized);
        wordCounts.set(normalized, (wordCounts.get(normalized) || 0) + 1);
    }

    return {
        allTokens: tokens,
        contentWords,
        uniqueWords,
        wordCounts,
    };
}

/**
 * Tokenizar rápido solo para obtener palabras de contenido
 * @param text Texto a tokenizar
 * @param language Idioma
 */
export function quickTokenize(text: string, language: string): string[] {
    const result = tokenize(text, {
        language,
        excludeStopWords: true,
        lowercase: true,
        minLength: 2,
    });
    return result.contentWords;
}

/**
 * Obtener palabras únicas de un texto
 * @param text Texto a analizar
 * @param language Idioma
 */
export function getUniqueWords(text: string, language: string): string[] {
    const result = tokenize(text, {
        language,
        excludeStopWords: true,
        lowercase: true,
        minLength: 2,
    });
    return Array.from(result.uniqueWords);
}
