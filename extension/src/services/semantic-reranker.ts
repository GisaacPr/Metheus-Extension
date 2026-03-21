import type {
    EmbeddingProvider,
    HoverResolutionResult,
    HoverSenseCandidate,
    SemanticReranker,
} from './language-intelligence';

export type SemanticRerankInput = {
    contextText: string;
    candidates: HoverSenseCandidate[];
    sourceLanguage: string;
};

type FeatureExtractor = (texts: string | string[], options?: Record<string, unknown>) => Promise<unknown>;

const EMBEDDING_MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const SEMANTIC_RERANK_SUPPORTED_LANGUAGES = [
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'ja',
    'zh',
    'ko',
    'vi',
    'ru',
    'ar',
    'hi',
    'tr',
    'pl',
    'nl',
    'sv',
    'id',
    'el',
    'hu',
] as const;

const SUPPORTED_LANGUAGE_SET = new Set<string>(SEMANTIC_RERANK_SUPPORTED_LANGUAGES);
const embeddingCache = new Map<string, number[]>();
let extractorPromise: Promise<FeatureExtractor> | null = null;
let warnedUnavailable = false;

const sanitizeText = (value?: string | null): string =>
    (value || '')
        .replace(/<\/?c[^>]*>/gi, ' ')
        .replace(/\[(?:\/)?c\]/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeLanguage = (value?: string | null): string => (value || '').trim().toLowerCase().split('-')[0];

const normalizeEmbeddingInput = (value: string): string => sanitizeText(value).slice(0, 1200);

const magnitude = (vector: number[]): number => Math.sqrt(vector.reduce((sum, current) => sum + current * current, 0));

const cosineSimilarity = (left: number[], right: number[]): number => {
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
        return 0;
    }

    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftMagnitude += left[index] * left[index];
        rightMagnitude += right[index] * right[index];
    }

    const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
    if (!denominator) {
        return 0;
    }

    return dot / denominator;
};

const normalizeEmbeddingOutput = (rawOutput: unknown, expectedLength: number): number[][] => {
    const output =
        rawOutput && typeof rawOutput === 'object' && 'tolist' in rawOutput
            ? (rawOutput as { tolist: () => unknown }).tolist()
            : rawOutput;

    if (!Array.isArray(output)) {
        return Array.from({ length: expectedLength }, () => []);
    }

    if (output.length > 0 && typeof output[0] === 'number') {
        return [output.map((value) => Number(value))];
    }

    return output.map((item) => (Array.isArray(item) ? item.map((value) => Number(value)) : []));
};

const buildCandidateCorpus = (candidate: HoverSenseCandidate): string => {
    const sourceLanguageSignals = [candidate.meaning, candidate.shortDefinition, ...(candidate.examples || [])]
        .map((value) => sanitizeText(value))
        .filter(Boolean);

    const translatedSignals = [candidate.translation, ...(candidate.translations || [])]
        .map((value) => sanitizeText(value))
        .filter(Boolean);

    const corpus = sourceLanguageSignals.length > 0 ? sourceLanguageSignals : translatedSignals;
    return corpus.join('. ');
};

const canSemanticRerank = (sourceLanguage: string, contextText: string, candidateCount: number) =>
    SUPPORTED_LANGUAGE_SET.has(normalizeLanguage(sourceLanguage)) &&
    sanitizeText(contextText).length >= 12 &&
    candidateCount >= 2;

const getFeatureExtractor = async (): Promise<FeatureExtractor> => {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const transformersModule = await import('@huggingface/transformers');
            const extractor = (await transformersModule.pipeline(
                'feature-extraction',
                EMBEDDING_MODEL_ID
            )) as unknown as FeatureExtractor;
            return extractor;
        })().catch((error) => {
            extractorPromise = null;
            throw error;
        });
    }

    return extractorPromise;
};

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
    async embed(texts: string[], options?: { language?: string }): Promise<number[][]> {
        const language = normalizeLanguage(options?.language);
        const normalizedTexts = texts.map((text) => normalizeEmbeddingInput(text));
        const embeddings = Array.from({ length: normalizedTexts.length }, () => [] as number[]);
        const uncachedTexts: string[] = [];
        const uncachedIndexes: number[] = [];

        normalizedTexts.forEach((text, index) => {
            if (!text) {
                return;
            }

            const cacheKey = `${EMBEDDING_MODEL_ID}:${language}:${text}`;
            const cachedVector = embeddingCache.get(cacheKey);
            if (cachedVector) {
                embeddings[index] = cachedVector;
                return;
            }

            uncachedTexts.push(text);
            uncachedIndexes.push(index);
        });

        if (uncachedTexts.length === 0) {
            return embeddings;
        }

        const extractor = await getFeatureExtractor();
        const rawOutput = await extractor(uncachedTexts, {
            pooling: 'mean',
            normalize: true,
        });
        const resolvedVectors = normalizeEmbeddingOutput(rawOutput, uncachedTexts.length);

        uncachedTexts.forEach((text, index) => {
            const vector = resolvedVectors[index] || [];
            const cacheKey = `${EMBEDDING_MODEL_ID}:${language}:${text}`;
            embeddingCache.set(cacheKey, vector);
            embeddings[uncachedIndexes[index]] = vector;
        });

        return embeddings;
    }
}

export class TransformersSemanticReranker implements SemanticReranker {
    constructor(private readonly provider: EmbeddingProvider = new TransformersJsEmbeddingProvider()) {}

    async rerank(input: SemanticRerankInput): Promise<HoverResolutionResult | null> {
        const contextText = sanitizeText(input.contextText);
        const candidates = input.candidates.filter(
            (candidate) => sanitizeText(candidate.translation) && buildCandidateCorpus(candidate)
        );

        if (!canSemanticRerank(input.sourceLanguage, contextText, candidates.length)) {
            return null;
        }

        try {
            const corpora = candidates.map((candidate) => buildCandidateCorpus(candidate));
            const vectors = await this.provider.embed([contextText, ...corpora], {
                language: input.sourceLanguage,
            });

            if (vectors.length !== corpora.length + 1) {
                return null;
            }

            const contextVector = vectors[0] || [];
            if (contextVector.length === 0 || magnitude(contextVector) === 0) {
                return null;
            }

            const reranked = candidates.map((candidate, index) => {
                const candidateVector = vectors[index + 1] || [];
                const similarity = cosineSimilarity(contextVector, candidateVector);
                const baseScore = typeof candidate.score === 'number' ? candidate.score : 0;
                const semanticBoost = Math.max(0, similarity) * 80;
                const reasons = new Set(candidate.confidenceReasons || []);

                if (similarity >= 0.24) {
                    reasons.add('semantic-context-match');
                }

                return {
                    candidate: {
                        ...candidate,
                        score: baseScore + semanticBoost,
                        confidenceReasons: Array.from(reasons),
                    },
                    similarity,
                    combinedScore: baseScore + semanticBoost,
                };
            });

            reranked.sort((left, right) => {
                if (right.combinedScore !== left.combinedScore) {
                    return right.combinedScore - left.combinedScore;
                }
                return right.similarity - left.similarity;
            });

            const orderedCandidates = reranked.map((entry) => entry.candidate);
            const bestCandidate = orderedCandidates[0];
            const bestSimilarity = reranked[0]?.similarity || 0;
            const nextSimilarity = reranked[1]?.similarity || 0;
            const confidenceReasons = Array.from(new Set(bestCandidate.confidenceReasons || []));

            let confidence: HoverResolutionResult['confidence'] = 'low';
            if (bestSimilarity >= 0.42 && bestSimilarity - nextSimilarity >= 0.06) {
                confidence = 'high';
            } else if (bestSimilarity >= 0.26 || confidenceReasons.length > 0) {
                confidence = 'medium';
            }

            return {
                bestCandidate,
                orderedCandidates,
                confidence,
                confidenceReasons,
                usedLemma: Boolean(bestCandidate.lemma),
            };
        } catch (error) {
            if (!warnedUnavailable) {
                warnedUnavailable = true;
                console.warn('[SemanticReranker] Falling back to heuristic ranking', error);
            }
            return null;
        }
    }
}

const defaultSemanticReranker = new TransformersSemanticReranker();

export const getSemanticReranker = (): SemanticReranker => defaultSemanticReranker;
export const supportsSemanticReranking = (language: string): boolean =>
    SUPPORTED_LANGUAGE_SET.has(normalizeLanguage(language));
