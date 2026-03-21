export type LanguageConfidence = 'high' | 'medium' | 'low';

export type ConfidenceReason =
    | 'surface-match'
    | 'lemma-match'
    | 'pos-match'
    | 'definition-context-overlap'
    | 'semantic-context-match'
    | 'translated-context-match'
    | 'online-variant'
    | 'local-translation'
    | 'ai-fallback';

export interface LexicalAnalysisResult {
    sourceLanguage: string;
    surface: string;
    normalizedSurface: string;
    lemma: string | null;
    lookupVariants: string[];
    languageConfidence: LanguageConfidence;
    usedRuleBasedFallback: boolean;
}

export interface HoverSenseCandidate {
    senseKey: string;
    translation: string;
    meaning: string;
    shortDefinition?: string;
    translations: string[];
    examples: string[];
    source:
        | 'local-translation'
        | 'online-translation'
        | 'translated-synonym'
        | 'cached-lexeme'
        | 'ai-fallback';
    lemma: string | null;
    matchedVariant: string | null;
    pos: string | null;
    score?: number;
    confidenceReasons?: ConfidenceReason[];
}

export interface HoverResolutionResult {
    bestCandidate: HoverSenseCandidate;
    orderedCandidates: HoverSenseCandidate[];
    confidence: 'high' | 'medium' | 'low';
    confidenceReasons: ConfidenceReason[];
    usedLemma: boolean;
}

export type DefinitionFallbackMode = 'automatic' | 'on-demand';

export interface FallbackRequest {
    lookupText: string;
    contextText: string;
    sourceLanguage: string;
    targetLanguage: string;
    pos?: string | null;
    lemma?: string | null;
    localCandidates: Array<{
        senseKey: string;
        translation: string;
        meaning: string;
        source: HoverSenseCandidate['source'];
    }>;
    mode: DefinitionFallbackMode;
    sourceScope: 'public-shared' | 'private-local';
    sourceFingerprint?: string | null;
}

export interface FallbackResponse {
    lemma: string | null;
    bestMeaning: string;
    shortDefinition: string;
    translations: string[];
    confidence: 'high' | 'medium' | 'low';
    source: 'ai-fallback';
}

export interface EmbeddingProvider {
    embed(texts: string[], options?: { language?: string }): Promise<number[][]>;
}

export interface SemanticReranker {
    rerank(input: {
        contextText: string;
        candidates: HoverSenseCandidate[];
        sourceLanguage: string;
    }): Promise<HoverResolutionResult | null>;
}
