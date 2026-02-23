/**
 * ============================================================================
 * Frequency Data - Datos de frecuencia de palabras
 * ============================================================================
 *
 * Gestión de listas de frecuencia para diferentes idiomas.
 * Estas listas permiten determinar qué palabras son "comunes" y merecen
 * ser aprendidas vs palabras raras que no valen el esfuerzo.
 */

import type { FrequencyData } from './types';
import { normalizeWord } from './tokenizer';

/** Cache de datos de frecuencia por idioma */
const frequencyCache = new Map<string, FrequencyData>();

/** URLs de listas de frecuencia (relativas a la plataforma) */
const FREQUENCY_LISTS: Record<string, { url: string; source: string }> = {
    en: {
        url: '/data/vocabulary/en_50k.txt',
        source: 'Subtitle Frequency List',
    },
    es: {
        url: '/data/vocabulary/es_50k.txt',
        source: 'Subtitle Frequency List',
    },
    fr: {
        url: '/data/vocabulary/fr_50k.txt',
        source: 'Subtitle Frequency List',
    },
    de: {
        url: '/data/vocabulary/de_50k.txt',
        source: 'Subtitle Frequency List',
    },
    ja: {
        url: '/data/vocabulary/ja_50k.txt',
        source: 'Subtitle Frequency List',
    },
    zh: {
        url: '/data/vocabulary/zh_50k.txt',
        source: 'Subtitle Frequency List',
    },
    ko: {
        url: '/data/vocabulary/ko_50k.txt',
        source: 'Subtitle Frequency List',
    },
    pt: {
        url: '/data/vocabulary/pt_50k.txt',
        source: 'Subtitle Frequency List',
    },
    it: {
        url: '/data/vocabulary/it_50k.txt',
        source: 'Subtitle Frequency List',
    },
    ru: {
        url: '/data/vocabulary/ru_50k.txt',
        source: 'Subtitle Frequency List',
    },
    ar: {
        url: '/data/vocabulary/ar_50k.txt',
        source: 'Subtitle Frequency List',
    },
    nl: {
        url: '/data/vocabulary/nl_50k.txt',
        source: 'Subtitle Frequency List',
    },
    pl: {
        url: '/data/vocabulary/pl_50k.txt',
        source: 'Subtitle Frequency List',
    },
    sv: {
        url: '/data/vocabulary/sv_50k.txt',
        source: 'Subtitle Frequency List',
    },
    tr: {
        url: '/data/vocabulary/tr_50k.txt',
        source: 'Subtitle Frequency List',
    },
    vi: {
        url: '/data/vocabulary/vi_50k.txt',
        source: 'Subtitle Frequency List',
    },
    hu: {
        url: '/data/vocabulary/hu_50k.txt',
        source: 'Subtitle Frequency List',
    },
    el: {
        url: '/data/vocabulary/el_50k.txt',
        source: 'Subtitle Frequency List',
    },
    id: {
        url: '/data/vocabulary/id_50k.txt',
        source: 'Subtitle Frequency List',
    },
};

/**
 * Cargar datos de frecuencia para un idioma
 * @param language Código ISO del idioma
 * @param baseUrl URL base (opcional, para extensión)
 */
export async function loadFrequencyData(language: string, baseUrl?: string): Promise<FrequencyData> {
    // Verificar cache
    if (frequencyCache.has(language)) {
        return frequencyCache.get(language)!;
    }

    const listInfo = FREQUENCY_LISTS[language];

    if (!listInfo) {
        console.warn(`[FrequencyData] No frequency list available for language: ${language}`);
        return createEmptyFrequencyData(language);
    }

    try {
        let finalUrl = listInfo.url;
        // In the extension context, load the local bundled file
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            const cleanPath = listInfo.url.startsWith('/') ? listInfo.url.slice(1) : listInfo.url;
            finalUrl = chrome.runtime.getURL(cleanPath);
        } else {
            // Fallback for normal web app usage
            finalUrl = baseUrl ? `${baseUrl}${listInfo.url}` : listInfo.url;
        }

        const response = await fetch(finalUrl);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        const words = text
            .split('\n')
            .map((line) => line.trim().split(/\s+/)[0])
            .filter((word) => word.length > 0);

        // Construir mapa de rankings
        const rankings = new Map<string, number>();
        words.forEach((word, index) => {
            rankings.set(word.toLowerCase(), index + 1);
        });

        const data: FrequencyData = {
            rankings,
            totalWords: words.length,
            language,
            source: listInfo.source,
        };

        // Guardar en cache
        frequencyCache.set(language, data);

        console.log(`[FrequencyData] Loaded ${words.length} words for ${language} from ${listInfo.source}`);

        return data;
    } catch (error) {
        console.error(`[FrequencyData] Failed to load frequency data for ${language}:`, error);
        return createEmptyFrequencyData(language);
    }
}

/**
 * Crear datos de frecuencia vacíos
 */
function createEmptyFrequencyData(language: string): FrequencyData {
    return {
        rankings: new Map(),
        totalWords: 0,
        language,
        source: 'none',
    };
}

/**
 * Obtener el ranking de frecuencia de una palabra
 * @param word Palabra a buscar
 * @param frequencyData Datos de frecuencia
 * @returns Ranking (1 = más común) o Infinity si no está en la lista
 */
export function getWordFrequencyRank(word: string, frequencyData: FrequencyData): number {
    const normalized = normalizeWord(word);
    return frequencyData.rankings.get(normalized) || Infinity;
}

/**
 * Convertir ranking a score 1-10
 * @param rank Ranking de frecuencia
 * @param totalWords Total de palabras en la lista
 */
export function rankToScore(rank: number, totalWords: number): number {
    if (rank === Infinity || totalWords === 0) return 1;

    // Top 10% = score 10, bottom 10% = score 1
    const percentile = 1 - rank / totalWords;
    return Math.max(1, Math.min(10, Math.round(percentile * 10)));
}

/**
 * Determinar dificultad basada en frecuencia
 * @param rank Ranking de frecuencia
 * @param totalWords Total de palabras en la lista
 */
export function rankToDifficulty(rank: number, totalWords: number): 'easy' | 'medium' | 'hard' | 'rare' {
    if (rank === Infinity) return 'rare';

    const percentile = rank / totalWords;

    if (percentile <= 0.1) return 'easy'; // Top 10%
    if (percentile <= 0.4) return 'medium'; // Top 40%
    if (percentile <= 0.8) return 'hard'; // Top 80%
    return 'rare'; // Bottom 20%
}

/**
 * Verificar si una palabra es candidata L+1
 * Solo palabras comunes (frecuencia > umbral) son recomendadas
 */
export function isL1Candidate(rank: number, totalWords: number, minScore: number = 5): boolean {
    const score = rankToScore(rank, totalWords);
    return score >= minScore;
}

/**
 * Precargar datos de frecuencia para múltiples idiomas
 * @param languages Array de códigos de idioma
 * @param baseUrl URL base opcional
 */
export async function preloadFrequencyData(languages: string[], baseUrl?: string): Promise<void> {
    await Promise.all(languages.map((lang) => loadFrequencyData(lang, baseUrl)));
}

/**
 * Limpiar cache de frecuencia
 */
export function clearFrequencyCache(): void {
    frequencyCache.clear();
}

/**
 * Obtener idiomas disponibles con datos de frecuencia
 */
export function getAvailableFrequencyLanguages(): string[] {
    return Object.keys(FREQUENCY_LISTS);
}

/**
 * Verificar si hay datos de frecuencia cargados para un idioma
 */
export function hasFrequencyDataLoaded(language: string): boolean {
    return frequencyCache.has(language);
}

/**
 * Obtener datos de frecuencia del cache (sin cargar)
 */
export function getFrequencyDataFromCache(language: string): FrequencyData | undefined {
    return frequencyCache.get(language);
}

// ============================================================================
// Datos embebidos para inglés (fallback sin red)
// ============================================================================

/**
 * Top 500 palabras más comunes en inglés
 * Usado como fallback cuando no hay conexión a la plataforma
 */
export const EMBEDDED_ENGLISH_TOP_500 = [
    'time',
    'year',
    'people',
    'way',
    'day',
    'world',
    'life',
    'hand',
    'part',
    'place',
    'case',
    'week',
    'company',
    'system',
    'program',
    'question',
    'work',
    'government',
    'number',
    'night',
    'point',
    'home',
    'water',
    'room',
    'mother',
    'area',
    'money',
    'story',
    'fact',
    'month',
    'lot',
    'right',
    'study',
    'book',
    'eye',
    'job',
    'word',
    'business',
    'issue',
    'side',
    'kind',
    'head',
    'house',
    'service',
    'friend',
    'father',
    'power',
    'hour',
    'game',
    'line',
    'end',
    'member',
    'law',
    'car',
    'city',
    'community',
    'name',
    'president',
    'team',
    'minute',
    'idea',
    'kid',
    'body',
    'information',
    'back',
    'parent',
    'face',
    'others',
    'level',
    'office',
    'door',
    'health',
    'person',
    'art',
    'war',
    'history',
    'party',
    'result',
    'change',
    'morning',
    'reason',
    'research',
    'girl',
    'guy',
    'moment',
    'air',
    'teacher',
    'force',
    'education',
    'foot',
    'boy',
    'age',
    'policy',
    'process',
    'music',
    'market',
    'sense',
    'nation',
    'plan',
    'college',
    'interest',
    'death',
    'experience',
    'effect',
    'effort',
    'development',
    'view',
    'role',
    'class',
    'control',
    'rate',
    'court',
    'couple',
    'field',
    'value',
    'action',
    'report',
    'paper',
    'building',
    'ground',
    'industry',
    'media',
    'picture',
    'situation',
    'movie',
    'west',
    'brother',
    'love',
    'price',
    'event',
    'wife',
    'term',
    'season',
    'training',
    'society',
    'activity',
    'star',
    'table',
    'need',
    'deal',
    'economy',
    'bank',
    'attention',
    'family',
    'practice',
    'condition',
    'cost',
    'staff',
    'article',
    'south',
    'risk',
    'chance',
    'opportunity',
    'performance',
    'statement',
    'care',
    'order',
    'future',
    'voice',
    'center',
    'color',
    'police',
    'sound',
    'product',
    'relationship',
    'century',
    'manager',
    'mission',
    'army',
    'source',
    'wall',
    'position',
    'evidence',
    'loss',
    'campaign',
    'board',
    'tax',
    'production',
    'defense',
    'form',
    'growth',
    'income',
    'design',
    'space',
    'record',
    'stage',
    'north',
    'return',
    'size',
    'attention',
    'theory',
    'series',
    'husband',
    'technology',
    'management',
    'scene',
    'security',
    'career',
    'purpose',
    'road',
    'peace',
    'letter',
    'operation',
    'success',
    'fire',
    'analysis',
    'data',
    'fight',
    'response',
    'project',
    'discussion',
    'structure',
    'type',
    'nature',
    'choice',
    'support',
    'test',
    'direction',
    'doctor',
    'course',
    'language',
    'pressure',
    'heart',
    'song',
    'sister',
    'hair',
    'feeling',
    'agent',
    'focus',
    'gas',
    'site',
    'fund',
    'east',
    'model',
    'drug',
    'reality',
    'marriage',
    'standard',
    'network',
    'list',
    'labor',
    'oil',
    'treatment',
    'quality',
    'meeting',
    'school',
    'food',
    'degree',
    'street',
    'measure',
    'image',
    'benefit',
    'material',
    'news',
    'thought',
    'behavior',
    'attack',
    'amount',
    'method',
    'energy',
    'rule',
    'property',
    'hotel',
    'window',
    'account',
    'step',
    'sport',
    'bed',
    'arm',
    'region',
    'section',
    'strategy',
    'film',
    'department',
    'student',
    'base',
    'institution',
    'majority',
    'organization',
    'example',
    'author',
    'approach',
    'truth',
    'access',
    'citizen',
    'audience',
    'customer',
    'movement',
    'player',
    'race',
    'sale',
    'feature',
    'skill',
    'concern',
    'reform',
    'range',
    'technology',
    'debate',
    'worker',
    'cell',
    'individual',
    'violence',
    'election',
    'director',
    'memory',
    'middle',
    'victim',
    'impact',
    'vision',
    'detail',
    'character',
    'responsibility',
    'land',
    'culture',
    'share',
    'reach',
    'budget',
    'style',
    'task',
    'difference',
    'official',
    'employee',
    'station',
    'capital',
    'challenge',
    'option',
    'message',
    'garden',
    'ball',
    'factor',
    'machine',
    'interview',
    'dream',
    'tradition',
    'truth',
    'adult',
    'candidate',
    'presence',
    'rest',
    'doctor',
    'freedom',
    'resource',
    'winner',
    'magazine',
    'danger',
    'crisis',
    'credit',
    'pleasure',
    'demand',
    'mile',
    'season',
    'victim',
    'artist',
    'crowd',
    'investment',
    'bill',
    'facility',
    'average',
    'shoulder',
    'answer',
    'generation',
    'target',
    'hospital',
    'environment',
    'flight',
    'profit',
    'race',
    'trouble',
    'solution',
    'bottom',
    'driver',
    'chief',
    'judge',
    'reality',
    'context',
    'progress',
    'violence',
    'traffic',
    'commitment',
    'expert',
    'store',
    'belief',
    'shop',
    'speech',
    'mistake',
    'capacity',
    'version',
    'animal',
    'tour',
    'trial',
    'attitude',
    'pattern',
    'influence',
    'bridge',
    'comment',
    'connection',
    'knowledge',
    'protection',
    'opinion',
    'track',
    'insurance',
    'client',
    'science',
    'leadership',
    'device',
    'sample',
    'instance',
    'competition',
    'weight',
];

/**
 * Crear datos de frecuencia embebidos para inglés
 */
export function getEmbeddedEnglishFrequency(): FrequencyData {
    const rankings = new Map<string, number>();
    EMBEDDED_ENGLISH_TOP_500.forEach((word, index) => {
        rankings.set(word, index + 1);
    });

    return {
        rankings,
        totalWords: EMBEDDED_ENGLISH_TOP_500.length,
        language: 'en',
        source: 'Embedded Top 500',
    };
}

/**
 * Inicializar con datos embebidos como fallback
 * @param language Idioma
 */
export function initializeWithFallback(language: string): void {
    if (!frequencyCache.has(language)) {
        if (language === 'en') {
            frequencyCache.set(language, getEmbeddedEnglishFrequency());
        }
    }
}
