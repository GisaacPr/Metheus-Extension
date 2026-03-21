import { tokenizeText } from '../ui/dictionary-adapter';
import type {
    ConfidenceReason,
    HoverResolutionResult,
    HoverSenseCandidate,
} from './language-intelligence';

const STOPWORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'have',
    'your',
    'de',
    'la',
    'el',
    'los',
    'las',
    'con',
    'por',
    'para',
    'que',
    'una',
    'uno',
]);

const sanitizeText = (value?: string | null): string =>
    (value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const normalize = (value?: string | null) =>
    sanitizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const extractKeywords = (text: string, language: string) =>
    Array.from(
        new Set(
            tokenizeText(text, language)
                .filter((token) => token.isWord)
                .map((token) => normalize(token.text))
                .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
        )
    );

const countOverlap = (contextKeywords: string[], corpus: string) => {
    if (contextKeywords.length === 0 || !corpus) return 0;
    const normalizedCorpus = normalize(corpus);
    return contextKeywords.reduce((acc, keyword) => acc + (normalizedCorpus.includes(keyword) ? 1 : 0), 0);
};

const countTranslatedMatch = (translation: string, translatedContext?: string | null) => {
    const candidate = normalize(translation);
    const context = normalize(translatedContext || '');
    if (!candidate || !context || !context.includes(candidate)) {
        return 0;
    }

    return candidate.length >= 5 ? 2 : 1;
};

export function resolveSenseRanking(params: {
    candidates: HoverSenseCandidate[];
    sourceLanguage: string;
    translatedContext?: string | null;
    preferredPos?: string | null;
    localTranslationSet?: string[];
    usedLemma?: boolean;
}): HoverResolutionResult | null {
    const candidates = params.candidates.filter((candidate) => sanitizeText(candidate.translation));
    if (candidates.length === 0) {
        return null;
    }

    const contextKeywords = extractKeywords(params.translatedContext || '', params.sourceLanguage || 'en');
    const localSet = new Set((params.localTranslationSet || []).map((item) => normalize(item)));
    const preferredPos = normalize(params.preferredPos || '');

    const scored = candidates.map((candidate, index) => {
        const reasons = new Set<ConfidenceReason>();
        let score = Math.max(1, candidates.length - index);

        const normalizedTranslation = normalize(candidate.translation);
        if (normalizedTranslation && localSet.has(normalizedTranslation)) {
            score += 45;
            reasons.add('local-translation');
        }

        if (candidate.matchedVariant) {
            score += 18;
            reasons.add(candidate.lemma ? 'lemma-match' : 'surface-match');
        }

        const overlap = countOverlap(
            contextKeywords,
            [candidate.meaning, candidate.shortDefinition, ...(candidate.examples || [])].join(' ')
        );
        if (overlap > 0) {
            score += overlap * 14;
            reasons.add('definition-context-overlap');
        }

        const translatedMatch = countTranslatedMatch(candidate.translation, params.translatedContext);
        if (translatedMatch > 0) {
            score += translatedMatch * 20;
            reasons.add('translated-context-match');
        }

        const candidatePos = normalize(candidate.pos || '');
        if (preferredPos && candidatePos && preferredPos === candidatePos) {
            score += 12;
            reasons.add('pos-match');
        }

        if (candidate.source === 'online-translation' || candidate.source === 'translated-synonym') {
            score += 4;
            reasons.add('online-variant');
        }

        if (candidate.source === 'ai-fallback') {
            score += 28;
            reasons.add('ai-fallback');
        }

        if (params.usedLemma && candidate.lemma) {
            score += 6;
            reasons.add('lemma-match');
        }

        return {
            candidate: {
                ...candidate,
                score,
                confidenceReasons: Array.from(reasons),
            },
            score,
        };
    });

    scored.sort((left, right) => right.score - left.score);
    const orderedCandidates = scored.map((item) => item.candidate);
    const bestCandidate = orderedCandidates[0];
    const reasons = new Set<ConfidenceReason>(bestCandidate.confidenceReasons || []);

    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (reasons.has('local-translation') && (reasons.has('translated-context-match') || reasons.has('definition-context-overlap'))) {
        confidence = 'high';
    } else if (reasons.size > 0) {
        confidence = 'medium';
    }

    return {
        bestCandidate,
        orderedCandidates,
        confidence,
        confidenceReasons: Array.from(reasons),
        usedLemma: Boolean(params.usedLemma && bestCandidate.lemma),
    };
}
