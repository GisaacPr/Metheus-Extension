/**
 * Tatoeba API Provider (Example Sentences)
 * https://tatoeba.org/
 *
 * Universal provider — supports all 21 languages.
 * Returns ONLY examples (real sentences with translations).
 * Does NOT provide definitions, phonetics, or other fields.
 * Used to enrich existing entries with more example sentences.
 */

import { DictionaryEntry, DictionaryDefinition } from '../metheus-dictionary';
import { OnlineDictionaryProvider } from './types';

// Tatoeba uses ISO 639-3 codes for some languages
const TATOEBA_LANG_MAP: Record<string, string> = {
    en: 'eng',
    es: 'spa',
    fr: 'fra',
    de: 'deu',
    it: 'ita',
    pt: 'por',
    ja: 'jpn',
    zh: 'cmn',
    ko: 'kor',
    vi: 'vie',
    ru: 'rus',
    ar: 'ara',
    hi: 'hin',
    tr: 'tur',
    pl: 'pol',
    nl: 'nld',
    sv: 'swe',
    id: 'ind',
    el: 'ell',
    hu: 'hun',
    la: 'lat',
};

export class TatoebaProvider implements OnlineDictionaryProvider {
    readonly name = 'Tatoeba';
    readonly supportedLanguages = Object.keys(TATOEBA_LANG_MAP);
    readonly timeout = 2000;

    private readonly _baseUrl = 'https://tatoeba.org/en/api_v0/search';

    async lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
        const tatoebaLang = TATOEBA_LANG_MAP[language];
        if (!tatoebaLang) return [];

        try {
            const params = new URLSearchParams({
                from: tatoebaLang,
                to: 'eng', // Request English translations
                query: word,
                orphans: 'no',
                unapproved: 'no',
                sort: 'relevance',
            });

            const url = `${this._baseUrl}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                signal: signal ?? AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) return [];

            const data = await response.json();
            if (!data?.results || !Array.isArray(data.results) || data.results.length === 0) return [];

            return this._mapResponse(data.results.slice(0, 8), word, language);
        } catch {
            return [];
        }
    }

    private _mapResponse(results: any[], word: string, language: string): DictionaryEntry[] {
        const examples: { sentence: string; translation?: string; collocations?: string[] }[] = [];

        for (const result of results) {
            const sentence = result.text;
            if (!sentence || typeof sentence !== 'string') continue;

            // Find English translation from translations array
            let translation: string | undefined;
            if (Array.isArray(result.translations) && result.translations.length > 0) {
                // translations is an array of arrays: [[{text: "...", lang: "eng"}]]
                for (const translationGroup of result.translations) {
                    if (!Array.isArray(translationGroup)) continue;
                    for (const trans of translationGroup) {
                        if (trans.lang === 'eng' && trans.text) {
                            translation = trans.text;
                            break;
                        }
                    }
                    if (translation) break;
                }
            }

            examples.push({
                sentence,
                translation,
                collocations: [],
            });
        }

        if (examples.length === 0) return [];

        // Return a single entry with all examples attached to a dummy definition.
        // The merge logic in normalizeAndMergeEntries will distribute these examples
        // to matching definitions or add them as standalone examples.
        // Translations are placed ON the examples (not the entry-level translations array).
        const definition: DictionaryDefinition = {
            meaning: '', // Empty meaning — these are example-only entries
            examples: examples,
        };

        return [
            {
                word,
                language,
                definitions: [definition],
                examples: examples.map((ex) => ex.sentence),
                source: 'api',
            },
        ];
    }
}
