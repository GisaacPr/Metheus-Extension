/**
 * Free Dictionary API Provider
 * https://dictionaryapi.dev/
 *
 * Supports 12+ languages via GET /api/v2/entries/{lang}/{word}
 * Returns: definitions, IPA phonetics, audio URLs, examples, synonyms, antonyms,
 *          etymology/origin → linguisticData for Details tab
 */

import { DictionaryEntry, DictionaryDefinition } from '../metheus-dictionary';
import { OnlineDictionaryProvider } from './types';

// Language code mapping for the Free Dictionary API
// The API uses slightly different codes for some languages
const LANG_MAP: Record<string, string> = {
    en: 'en',
    es: 'es',
    fr: 'fr',
    de: 'de',
    it: 'it',
    pt: 'pt-BR',
    nl: 'nl',
    ru: 'ru',
    ar: 'ar',
    tr: 'tr',
    hi: 'hi',
    sv: 'sv',
};

export class FreeDictionaryProvider implements OnlineDictionaryProvider {
    readonly name = 'Free Dictionary API';
    readonly supportedLanguages = Object.keys(LANG_MAP);
    readonly timeout = 2000;

    private readonly _baseUrl = 'https://api.dictionaryapi.dev/api/v2/entries';

    async lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
        const apiLang = LANG_MAP[language];
        if (!apiLang) return [];

        try {
            const url = `${this._baseUrl}/${apiLang}/${encodeURIComponent(word.toLowerCase())}`;
            const response = await fetch(url, {
                method: 'GET',
                signal: signal ?? AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) return [];

            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) return [];

            return this._mapResponse(data, word, language);
        } catch {
            return [];
        }
    }

    private _mapResponse(data: any[], word: string, language: string): DictionaryEntry[] {
        const entries: DictionaryEntry[] = [];

        for (const item of data) {
            // Extract ALL phonetics (not just first)
            let phonetic: string | undefined;
            let audioUrl: string | undefined;
            const allPhonetics: string[] = [];

            if (Array.isArray(item.phonetics)) {
                for (const p of item.phonetics) {
                    if (p.text) {
                        allPhonetics.push(p.text);
                        if (!phonetic) phonetic = p.text;
                    }
                    if (p.audio && typeof p.audio === 'string' && p.audio.length > 0 && !audioUrl) {
                        audioUrl = p.audio;
                    }
                }
            }
            if (!phonetic && item.phonetic) {
                phonetic = item.phonetic;
            }

            // Extract etymology/origin → linguisticData for Details tab
            const linguisticData: { label: string; value: string | number; key: string }[] = [];

            if (item.origin && typeof item.origin === 'string' && item.origin.trim()) {
                linguisticData.push({ label: 'Origin', value: item.origin.trim(), key: 'origin' });
            }

            // Some responses have sourceUrls
            if (Array.isArray(item.sourceUrls) && item.sourceUrls.length > 0) {
                linguisticData.push({ label: 'Source', value: item.sourceUrls[0], key: 'source_url' });
            }

            // Additional phonetic variants
            if (allPhonetics.length > 1) {
                linguisticData.push({
                    label: 'Phonetic Variants',
                    value: allPhonetics.join(', '),
                    key: 'phonetic_variants',
                });
            }

            // License info
            if (item.license?.name) {
                linguisticData.push({ label: 'License', value: item.license.name, key: 'license' });
            }

            // Extract meanings → definitions
            if (!Array.isArray(item.meanings)) continue;

            for (const meaning of item.meanings) {
                const pos = meaning.partOfSpeech || undefined;
                const definitions: DictionaryDefinition[] = [];

                if (!Array.isArray(meaning.definitions)) continue;

                for (const def of meaning.definitions) {
                    const examples: { sentence: string; collocations?: string[] }[] = [];
                    if (def.example) {
                        examples.push({ sentence: def.example });
                    }

                    definitions.push({
                        meaning: def.definition || '',
                        partOfSpeech: pos,
                        examples: examples.length > 0 ? examples : undefined,
                        synonyms: Array.isArray(def.synonyms) && def.synonyms.length > 0 ? def.synonyms : undefined,
                        antonyms: Array.isArray(def.antonyms) && def.antonyms.length > 0 ? def.antonyms : undefined,
                    });
                }

                // Collect top-level synonyms/antonyms from the meaning
                const topSynonyms = Array.isArray(meaning.synonyms) ? meaning.synonyms : [];
                const topAntonyms = Array.isArray(meaning.antonyms) ? meaning.antonyms : [];

                if (definitions.length > 0) {
                    entries.push({
                        word: item.word || word,
                        language,
                        phonetic,
                        partOfSpeech: pos,
                        definitions,
                        audio: audioUrl,
                        synonyms: topSynonyms.length > 0 ? topSynonyms : undefined,
                        antonyms: topAntonyms.length > 0 ? topAntonyms : undefined,
                        linguisticData: linguisticData.length > 0 ? linguisticData : undefined,
                        source: 'api',
                    });
                }
            }
        }

        return entries;
    }
}
