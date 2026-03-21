import type { SettingsProvider } from '@metheus/common/settings';
import { db } from './db/dictionary-db';

export type SharedLanguageCacheScope = 'public-shared' | 'private-local';

export interface DefinitionTranslationCacheEntry {
    key: string;
    algorithmVersion: number;
    sourceLanguage: string;
    targetLanguage: string;
    createdAt: number;
    updatedAt: number;
    sourceScope: SharedLanguageCacheScope;
    definitionHash: string;
    translatedText: string;
}

export interface PhraseTranslationCacheEntry {
    key: string;
    algorithmVersion: number;
    sourceLanguage: string;
    targetLanguage: string;
    createdAt: number;
    updatedAt: number;
    sourceScope: SharedLanguageCacheScope;
    normalizedTextHash: string;
    sourceFingerprint: string;
    translatedText: string;
}

const ALGORITHM_VERSION = 1;
const hashCache = new Map<string, Promise<string>>();

export const sanitizeCacheText = (value?: string | null): string =>
    (value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const normalizeMeaningText = (value?: string | null): string =>
    sanitizeCacheText(value)
        .toLowerCase()
        .replace(/[“”"']/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export const normalizePhraseText = (value?: string | null): string =>
    sanitizeCacheText(value)
        .toLowerCase()
        .replace(/[.,!?;:()[\]{}"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const normalizeLanguageCode = (value?: string | null): string =>
    sanitizeCacheText(value || 'auto')
        .toLowerCase()
        .replace(/^ln_/i, '')
        .split('-')[0] || 'auto';

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

function buildDefinitionKey(sourceLanguage: string, targetLanguage: string, definition: string): string {
    return `${normalizeLanguageCode(sourceLanguage)}:${normalizeLanguageCode(targetLanguage)}:${normalizeMeaningText(definition)}`;
}

function buildPhraseKey(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
    sourceFingerprint: string
): string {
    return `${normalizeLanguageCode(sourceLanguage)}:${normalizeLanguageCode(targetLanguage)}:${sanitizeCacheText(
        sourceFingerprint
    )}:${normalizePhraseText(text)}`;
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

async function readSharedDefinition(
    settingsProvider: SettingsProvider,
    sourceLanguage: string,
    targetLanguage: string,
    definitionHash: string
): Promise<DefinitionTranslationCacheEntry | null> {
    try {
        const settings = await settingsProvider.get(['metheusUrl']);
        const baseUrl = `${(settings.metheusUrl || '').replace(/\/$/, '')}`;
        if (!baseUrl) return null;
        const url = `${baseUrl}/api/cache/shared/definition?sourceLanguage=${encodeURIComponent(
            sourceLanguage
        )}&targetLanguage=${encodeURIComponent(targetLanguage)}&definitionHash=${encodeURIComponent(definitionHash)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: await getAuthHeaders(settingsProvider),
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as { entry?: DefinitionTranslationCacheEntry | null };
        return payload.entry || null;
    } catch {
        return null;
    }
}

async function writeSharedDefinition(
    settingsProvider: SettingsProvider,
    entry: DefinitionTranslationCacheEntry
): Promise<void> {
    try {
        const settings = await settingsProvider.get(['metheusUrl']);
        const baseUrl = `${(settings.metheusUrl || '').replace(/\/$/, '')}`;
        if (!baseUrl) return;
        await fetch(`${baseUrl}/api/cache/shared/definition`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getAuthHeaders(settingsProvider)),
            },
            body: JSON.stringify(entry),
        });
    } catch {
        // ignore shared write failures
    }
}

export async function getCachedDefinitionTranslation(
    settingsProvider: SettingsProvider,
    sourceLanguage: string,
    targetLanguage: string,
    definition: string
): Promise<DefinitionTranslationCacheEntry | null> {
    const key = buildDefinitionKey(sourceLanguage, targetLanguage, definition);
    const local = await db.getDefinitionTranslationCache(key);
    if (local) return local;

    const definitionHash = await computeStableHash(normalizeMeaningText(definition));
    const remote = await readSharedDefinition(
        settingsProvider,
        normalizeLanguageCode(sourceLanguage),
        normalizeLanguageCode(targetLanguage),
        definitionHash
    );

    if (remote) {
        await db.setDefinitionTranslationCache(remote);
    }

    return remote;
}

export async function persistDefinitionTranslation(
    settingsProvider: SettingsProvider,
    sourceLanguage: string,
    targetLanguage: string,
    definition: string,
    translatedText: string
): Promise<void> {
    const definitionHash = await computeStableHash(normalizeMeaningText(definition));
    const now = Date.now();
    const entry: DefinitionTranslationCacheEntry = {
        key: buildDefinitionKey(sourceLanguage, targetLanguage, definition),
        algorithmVersion: ALGORITHM_VERSION,
        sourceLanguage: normalizeLanguageCode(sourceLanguage),
        targetLanguage: normalizeLanguageCode(targetLanguage),
        createdAt: now,
        updatedAt: now,
        sourceScope: 'public-shared',
        definitionHash,
        translatedText: sanitizeCacheText(translatedText),
    };

    await db.setDefinitionTranslationCache(entry);
    void writeSharedDefinition(settingsProvider, entry);
}

export async function getCachedPhraseTranslation(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
    sourceFingerprint: string
): Promise<PhraseTranslationCacheEntry | null> {
    return (
        (await db.getPhraseTranslationCache(buildPhraseKey(sourceLanguage, targetLanguage, text, sourceFingerprint))) ||
        null
    );
}

export async function persistPhraseTranslation(params: {
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
    translatedText: string;
    sourceFingerprint?: string | null;
    sourceScope?: SharedLanguageCacheScope;
}): Promise<void> {
    const normalizedTextHash = await computeStableHash(normalizePhraseText(params.text));
    const now = Date.now();
    const entry: PhraseTranslationCacheEntry = {
        key: buildPhraseKey(
            params.sourceLanguage,
            params.targetLanguage,
            params.text,
            sanitizeCacheText(params.sourceFingerprint) || 'local'
        ),
        algorithmVersion: ALGORITHM_VERSION,
        sourceLanguage: normalizeLanguageCode(params.sourceLanguage),
        targetLanguage: normalizeLanguageCode(params.targetLanguage),
        createdAt: now,
        updatedAt: now,
        sourceScope: params.sourceScope || 'private-local',
        normalizedTextHash,
        sourceFingerprint: sanitizeCacheText(params.sourceFingerprint) || 'local',
        translatedText: sanitizeCacheText(params.translatedText),
    };

    await db.setPhraseTranslationCache(entry);
}
