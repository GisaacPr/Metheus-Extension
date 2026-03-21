import type { SettingsProvider } from '@metheus/common/settings';
import { db, type AiDefinitionFallbackCacheEntry } from './db/dictionary-db';
import type { FallbackRequest, FallbackResponse } from './language-intelligence';
import type { UnifiedEntry } from '../ui/dictionary-adapter';
import { normalizeLanguageCode, normalizeMeaningText, normalizePhraseText, sanitizeCacheText } from './language-cache';

const ALGORITHM_VERSION = 1;
const hashCache = new Map<string, Promise<string>>();

async function computeStableHash(value: string): Promise<string> {
    const normalized = sanitizeCacheText(value);
    if (!normalized) {
        return 'empty';
    }

    if (!hashCache.has(normalized)) {
        hashCache.set(
            normalized,
            (async () => {
                const encoded = new TextEncoder().encode(normalized);
                const buffer = await crypto.subtle.digest('SHA-256', encoded);
                return Array.from(new Uint8Array(buffer))
                    .map((byte) => byte.toString(16).padStart(2, '0'))
                    .join('');
            })()
        );
    }

    return hashCache.get(normalized)!;
}

function buildLookupKey(
    sourceLanguage: string,
    targetLanguage: string,
    lookupText: string,
    contextHash: string
): string {
    return [
        normalizeLanguageCode(sourceLanguage),
        normalizeLanguageCode(targetLanguage),
        normalizeMeaningText(lookupText),
        contextHash,
    ].join(':');
}

async function getAuthHeaders(settingsProvider: SettingsProvider): Promise<Record<string, string>> {
    try {
        const settings = await settingsProvider.get(['metheusApiKey', 'metheusToken']);
        const authValue = settings.metheusApiKey || settings.metheusToken;
        return authValue ? { Authorization: `Bearer ${authValue}` } : {};
    } catch {
        return {};
    }
}

function toUnifiedEntry(lookupText: string, sourceLanguage: string, result: FallbackResponse): UnifiedEntry {
    return {
        id: `ai_fallback_${lookupText}_${Date.now()}`,
        word: sanitizeCacheText(lookupText),
        phonetic: undefined,
        badges: [],
        linguisticData: [...(result.lemma ? [{ label: 'Lemma', value: result.lemma, key: 'lemma' }] : [])],
        definitions: [
            {
                index: 1,
                meaning: sanitizeCacheText(result.shortDefinition),
                synonyms: [],
                antonyms: [],
                examples: [],
            },
        ],
        language: normalizeLanguageCode(sourceLanguage),
        source: 'api',
        translations: Array.from(
            new Set(
                [result.bestMeaning, ...(result.translations || [])]
                    .map((item) => sanitizeCacheText(item))
                    .filter(Boolean)
            )
        ),
    };
}

async function buildCacheEntry(
    request: FallbackRequest,
    response: FallbackResponse
): Promise<AiDefinitionFallbackCacheEntry> {
    const [lookupHash, contextHash] = await Promise.all([
        computeStableHash(normalizeMeaningText(request.lookupText)),
        computeStableHash(normalizePhraseText(request.contextText)),
    ]);
    const now = Date.now();

    return {
        key: buildLookupKey(request.sourceLanguage, request.targetLanguage, request.lookupText, contextHash),
        algorithmVersion: ALGORITHM_VERSION,
        sourceLanguage: normalizeLanguageCode(request.sourceLanguage),
        targetLanguage: normalizeLanguageCode(request.targetLanguage),
        createdAt: now,
        updatedAt: now,
        sourceScope: request.sourceScope,
        lookupText: sanitizeCacheText(request.lookupText),
        lookupHash,
        contextHash,
        sourceFingerprint: sanitizeCacheText(request.sourceFingerprint) || 'extension-local',
        lemma: response.lemma,
        bestMeaning: sanitizeCacheText(response.bestMeaning),
        shortDefinition: sanitizeCacheText(response.shortDefinition),
        translations: Array.from(
            new Set((response.translations || []).map((item) => sanitizeCacheText(item)).filter(Boolean))
        ),
        confidence: response.confidence,
        mode: request.mode,
        source: 'ai-fallback',
    };
}

async function getCachedFallback(request: FallbackRequest): Promise<AiDefinitionFallbackCacheEntry | null> {
    const contextHash = await computeStableHash(normalizePhraseText(request.contextText));
    const key = buildLookupKey(request.sourceLanguage, request.targetLanguage, request.lookupText, contextHash);
    return (await db.getAiDefinitionFallbackCache(key)) || null;
}

export async function defineWithAiFallback(
    settingsProvider: SettingsProvider,
    request: FallbackRequest
): Promise<UnifiedEntry | null> {
    const cached = await getCachedFallback(request);
    if (cached) {
        return toUnifiedEntry(request.lookupText, request.sourceLanguage, {
            lemma: cached.lemma,
            bestMeaning: cached.bestMeaning,
            shortDefinition: cached.shortDefinition,
            translations: cached.translations,
            confidence: cached.confidence,
            source: 'ai-fallback',
        });
    }

    try {
        const settings = await settingsProvider.get(['metheusUrl']);
        const baseUrl = `${(settings.metheusUrl || '').replace(/\/$/, '')}`;
        if (!baseUrl) {
            return null;
        }

        const response = await fetch(`${baseUrl}/api/dictionary/fallback/define`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getAuthHeaders(settingsProvider)),
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as { result?: FallbackResponse | null };
        if (!payload.result) {
            return null;
        }

        const cacheEntry = await buildCacheEntry(request, payload.result);
        await db.setAiDefinitionFallbackCache(cacheEntry);
        return toUnifiedEntry(request.lookupText, request.sourceLanguage, payload.result);
    } catch {
        return null;
    }
}
