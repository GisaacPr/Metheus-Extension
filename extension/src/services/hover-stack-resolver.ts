import type { SettingsProvider } from '@metheus/common/settings';
import { getMetheusDictionaryService } from './metheus-dictionary';
import { normalizeAndMergeEntries, tokenizeText } from '../ui/dictionary-adapter';
import { analyzeLexicalUnit } from './lexical-analysis';
import { resolveSenseRanking } from './sense-ranking';
import { getSemanticReranker } from './semantic-reranker';
import type { HoverSenseCandidate } from './language-intelligence';
import { db } from './db/dictionary-db';
import {
    getCachedPhraseTranslation,
    normalizeLanguageCode,
    normalizePhraseText,
    persistPhraseTranslation,
    sanitizeCacheText,
} from './language-cache';
import { translateWithExtensionProviders } from './browser-translation';

export interface HoverStackResolution {
    bestTranslation: string;
    alternatives: string[];
    orderedCandidates: string[];
}

const semanticReranker = getSemanticReranker();

const stripAnchorMarkers = (value?: string | null): string => (value || '').replace(/\[\[\[|\]\]\]/g, '');

const sanitizeAnchorAwareText = (value?: string | null): string =>
    sanitizeCacheText(value)
        .replace(/<\/?c[^>]*>/gi, ' ')
        .replace(/\[(?:\/)?c\]/gi, ' ')
        .trim();

const sanitizeText = (value?: string | null): string => stripAnchorMarkers(sanitizeAnchorAwareText(value));

const normalizeLookupWord = (value?: string | null): string =>
    sanitizeText(value || '')
        .replace(/[.,!?;:()]/g, '')
        .trim();

const uniqueNonEmpty = (items: Array<string | null | undefined>) =>
    Array.from(new Set(items.map((item) => sanitizeText(item)).filter(Boolean)));

const isSameWord = (a: string, b: string) => sanitizeText(a).toLowerCase() === sanitizeText(b).toLowerCase();

const isTranslationCandidate = (value: string, sourceWord: string): boolean => {
    const clean = sanitizeText(value);
    return Boolean(clean) && !isSameWord(clean, sourceWord);
};

const buildAnchoredContextText = (contextText: string, lookupWord: string): string => {
    const cleanContext = sanitizeText(contextText);
    const cleanLookup = sanitizeText(lookupWord);
    if (!cleanContext || !cleanLookup) {
        return cleanContext;
    }

    const loweredContext = cleanContext.toLowerCase();
    const loweredLookup = cleanLookup.toLowerCase();
    const index = loweredContext.indexOf(loweredLookup);
    if (index === -1) {
        return cleanContext;
    }

    const originalSlice = cleanContext.slice(index, index + cleanLookup.length);
    return `${cleanContext.slice(0, index)}[[[${originalSlice}]]]${cleanContext.slice(index + cleanLookup.length)}`;
};

const extractQuotedTranslation = (translatedText?: string | null): string | null => {
    const cleanText = sanitizeAnchorAwareText(translatedText || '');
    if (!cleanText) {
        return null;
    }

    const match = cleanText.match(/\[\[\[\s*([^[\]]{1,80}?)\s*\]\]\]/);
    return match?.[1] ? sanitizeText(match[1]) : null;
};

const extractLocalSynonyms = (definitions: Array<{ synonyms?: string[] }>): string[] =>
    uniqueNonEmpty((definitions || []).flatMap((definition) => definition.synonyms || [])).slice(0, 6);

const buildExamples = (definitions: Array<{ examples?: Array<{ sentence: string }> }>): string[] =>
    uniqueNonEmpty(
        (definitions || []).flatMap((definition) => (definition.examples || []).map((example) => example.sentence))
    ).slice(0, 3);

const buildLexemeKey = (sourceLanguage: string, targetLanguage: string, lookupText: string) =>
    `${normalizeLanguageCode(sourceLanguage)}:${normalizeLanguageCode(targetLanguage)}:${normalizeLookupWord(lookupText)}`;

const buildContextKey = (sourceLanguage: string, targetLanguage: string, lookupText: string, contextText: string) =>
    `${buildLexemeKey(sourceLanguage, targetLanguage, lookupText)}:${normalizePhraseText(contextText)}`;

const rankDefinitionsByContext = (definitions: any[], contextText: string, language: string) => {
    if (!definitions || definitions.length <= 1 || !contextText) {
        return definitions || [];
    }

    const contextTokens = tokenizeText(contextText, language)
        .filter((token) => token.isWord)
        .map((token) => token.text.toLowerCase())
        .filter(Boolean);

    if (contextTokens.length === 0) {
        return definitions;
    }

    const scored = definitions.map((definition) => {
        const corpus =
            `${definition.meaning} ${(definition.examples || []).map((example: any) => example.sentence).join(' ')}`.toLowerCase();
        let score = 0;
        for (const token of contextTokens) {
            if (token.length >= 2 && corpus.includes(token)) {
                score += 1;
            }
        }

        return { definition, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((item) => item.definition);
};

async function translateCachedText(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
    sourceFingerprint: string
): Promise<string | null> {
    const cleanText = sanitizeText(text);
    if (!cleanText) {
        return null;
    }

    if (normalizeLanguageCode(sourceLanguage) === normalizeLanguageCode(targetLanguage)) {
        return cleanText;
    }

    const cached = await getCachedPhraseTranslation(sourceLanguage, targetLanguage, cleanText, sourceFingerprint);
    if (cached?.translatedText) {
        return cached.translatedText;
    }

    const translated = await translateWithExtensionProviders(cleanText, targetLanguage, sourceLanguage);
    if (!translated.translated) {
        return null;
    }

    await persistPhraseTranslation({
        sourceLanguage,
        targetLanguage,
        text: cleanText,
        translatedText: translated.translated,
        sourceFingerprint,
        sourceScope: 'private-local',
    });

    return translated.translated;
}

function buildSenseCandidates(params: {
    orderedSeed: string[];
    meaning: string;
    examples: string[];
    lemma?: string | null;
    matchedVariant?: string | null;
    pos?: string | null;
    localTranslations: string[];
    translatedSynonyms: string[];
}): HoverSenseCandidate[] {
    const candidates = new Map<string, HoverSenseCandidate>();
    const localSet = new Set(params.localTranslations.map((item) => sanitizeText(item)));
    const synonymSet = new Set(params.translatedSynonyms.map((item) => sanitizeText(item)));

    for (const [index, translation] of params.orderedSeed.entries()) {
        const normalized = sanitizeText(translation);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        const source: HoverSenseCandidate['source'] = localSet.has(normalized)
            ? 'local-translation'
            : synonymSet.has(normalized)
              ? 'translated-synonym'
              : 'cached-lexeme';

        if (!candidates.has(key)) {
            candidates.set(key, {
                senseKey: `${source}:${key}:${index}`,
                translation: normalized,
                meaning: params.meaning,
                shortDefinition: params.meaning,
                translations: [normalized],
                examples: params.examples,
                source,
                lemma: params.lemma || null,
                matchedVariant: params.matchedVariant || null,
                pos: params.pos || null,
            });
        }
    }

    return Array.from(candidates.values());
}

export async function resolveHoverStack(
    settingsProvider: SettingsProvider,
    params: {
        word: string;
        contextText: string;
        sourceLanguage?: string;
        targetLanguage?: string;
    }
): Promise<HoverStackResolution | null> {
    const lookupWord = normalizeLookupWord(params.word);
    const contextText = sanitizeText(params.contextText);
    if (!lookupWord) {
        return null;
    }

    const settings = (await settingsProvider.getAll()) as Record<string, any>;
    const sourceLanguage = normalizeLanguageCode(params.sourceLanguage || settings.metheusTargetLanguage || 'en');
    const targetLanguage = normalizeLanguageCode(
        params.targetLanguage ||
            settings.ln_cached_native_language ||
            settings.language ||
            settings.ln_cached_interface_language ||
            'en'
    );

    const contextKey = buildContextKey(sourceLanguage, targetLanguage, lookupWord, contextText);
    const cachedContext = await db.getHoverContextCache(contextKey);
    if (cachedContext?.bestCandidate) {
        return {
            bestTranslation: cachedContext.bestCandidate,
            alternatives: (cachedContext.orderedCandidates || []).filter(Boolean).slice(1, 4),
            orderedCandidates: (cachedContext.orderedCandidates || []).filter(Boolean).slice(0, 5),
        };
    }

    const lexemeKey = buildLexemeKey(sourceLanguage, targetLanguage, lookupWord);
    const cachedLexeme = await db.getHoverLexemeCache(lexemeKey);

    const lexical = analyzeLexicalUnit({
        text: lookupWord,
        language: sourceLanguage,
        contextText,
    });

    const dictionaryService = getMetheusDictionaryService(settingsProvider);
    const studyLanguage = normalizeLanguageCode(settings.metheusTargetLanguage || sourceLanguage);
    const languageOrder = Array.from(new Set([sourceLanguage, studyLanguage])).filter(Boolean);

    let mergedEntry: any = null;
    let matchedVariant: string | null = null;
    for (const variant of lexical.lookupVariants.length > 0 ? lexical.lookupVariants : [lookupWord]) {
        const collected: any[] = [];
        for (const language of languageOrder) {
            const result = await dictionaryService.lookup(variant, language, undefined, { skipBlockingOnline: true });
            if (result.allEntries && result.allEntries.length > 0) {
                collected.push(...result.allEntries);
            } else if (result.found && result.entry) {
                collected.push(result.entry);
            }
        }

        if (collected.length > 0) {
            mergedEntry = normalizeAndMergeEntries(collected as any);
            matchedVariant = variant;
            break;
        }
    }

    if (!mergedEntry) {
        if (cachedLexeme?.orderedCandidates?.length) {
            return {
                bestTranslation: cachedLexeme.orderedCandidates[0],
                alternatives: cachedLexeme.orderedCandidates.slice(1, 4),
                orderedCandidates: cachedLexeme.orderedCandidates.slice(0, 5),
            };
        }

        return null;
    }

    const rankedDefinitions = rankDefinitionsByContext(
        mergedEntry.definitions || [],
        contextText,
        mergedEntry.language || sourceLanguage
    );
    const bestMeaning = sanitizeText(rankedDefinitions[0]?.meaning || '');
    const examples = buildExamples(rankedDefinitions);
    const pos = mergedEntry.badges?.find((badge: any) => badge.type === 'pos')?.label || null;

    const localTranslations = uniqueNonEmpty(mergedEntry.translations || []).slice(0, 4);
    const localSynonyms = extractLocalSynonyms(rankedDefinitions);

    const [translatedWord, ...translatedSynonymsRaw] = await Promise.all(
        [lookupWord, ...localSynonyms].map((text) =>
            translateCachedText(sourceLanguage, targetLanguage, text, 'hover-stack')
        )
    );
    const translatedSynonyms = translatedSynonymsRaw.filter((value): value is string => Boolean(value));

    const translatedContext = contextText
        ? await translateCachedText(sourceLanguage, targetLanguage, contextText, 'hover-context-v2')
        : null;
    const anchoredContext = contextText ? buildAnchoredContextText(contextText, lookupWord) : '';
    const anchoredTranslatedContext =
        anchoredContext && anchoredContext !== contextText
            ? await translateCachedText(sourceLanguage, targetLanguage, anchoredContext, 'hover-context-anchored-v3')
            : translatedContext;
    const anchoredContextCandidate = extractQuotedTranslation(anchoredTranslatedContext);

    const orderedSeed = uniqueNonEmpty([
        ...localTranslations,
        anchoredContextCandidate,
        ...(cachedLexeme?.orderedCandidates || []),
        translatedWord,
        ...translatedSynonyms,
    ]).filter((text) => isTranslationCandidate(text, lookupWord));

    const senseCandidates = buildSenseCandidates({
        orderedSeed,
        meaning: bestMeaning,
        examples,
        lemma: lexical.lemma,
        matchedVariant,
        pos,
        localTranslations,
        translatedSynonyms,
    });

    let resolution = resolveSenseRanking({
        candidates: senseCandidates,
        sourceLanguage,
        translatedContext: anchoredTranslatedContext || translatedContext,
        preferredPos: pos,
        localTranslationSet: localTranslations,
        usedLemma: Boolean(lexical.lemma && matchedVariant === lexical.lemma),
    });

    const semanticResolution = await semanticReranker.rerank({
        contextText,
        sourceLanguage,
        candidates: resolution?.orderedCandidates || senseCandidates,
    });

    if (semanticResolution) {
        resolution = semanticResolution;
    }

    const orderedCandidates = uniqueNonEmpty(
        (resolution?.orderedCandidates || senseCandidates).flatMap((candidate) => [
            candidate.translation,
            ...(candidate.translations || []),
        ])
    )
        .filter((text) => isTranslationCandidate(text, lookupWord))
        .slice(0, 5);

    if (orderedCandidates.length === 0) {
        return null;
    }

    const bestTranslation = orderedCandidates[0];
    const alternatives = orderedCandidates.slice(1, 4);
    const now = Date.now();

    await db.setHoverLexemeCache({
        key: lexemeKey,
        orderedCandidates,
        bestMeaning,
        updatedAt: now,
    });

    await db.setHoverContextCache({
        key: contextKey,
        orderedCandidates,
        bestCandidate: bestTranslation,
        confidence: resolution?.confidence || 'medium',
        updatedAt: now,
    });

    return {
        bestTranslation,
        alternatives,
        orderedCandidates,
    };
}
