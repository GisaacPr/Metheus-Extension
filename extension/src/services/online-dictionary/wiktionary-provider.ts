/**
 * Wiktionary REST API Provider
 * https://api.wikimedia.org/wiki/Core_REST_API
 *
 * Universal fallback — supports all 21 languages via Wiktionary editions.
 * Returns: definitions extracted from wiki content, etymology as linguisticData,
 *          part-of-speech mappings for Details tab.
 */

import { DictionaryEntry, DictionaryDefinition } from '../metheus-dictionary';
import { OnlineDictionaryProvider } from './types';

// Map our language codes to Wiktionary edition codes
const WIKI_LANG_MAP: Record<string, string> = {
    en: 'en',
    es: 'es',
    fr: 'fr',
    de: 'de',
    it: 'it',
    pt: 'pt',
    ja: 'ja',
    zh: 'zh',
    ko: 'ko',
    vi: 'vi',
    ru: 'ru',
    ar: 'ar',
    hi: 'hi',
    tr: 'tr',
    pl: 'pl',
    nl: 'nl',
    sv: 'sv',
    id: 'id',
    el: 'el',
    hu: 'hu',
    la: 'la',
};

export class WiktionaryProvider implements OnlineDictionaryProvider {
    readonly name = 'Wiktionary';
    readonly supportedLanguages = Object.keys(WIKI_LANG_MAP);
    readonly timeout = 2500;

    private readonly _baseUrl = 'https://en.wiktionary.org/api/rest_v1/page/definition';

    async lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
        if (!WIKI_LANG_MAP[language]) return [];

        try {
            // Use English Wiktionary which has entries for all languages
            const url = `${this._baseUrl}/${encodeURIComponent(word)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: signal ?? AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) return [];

            const data = await response.json();
            return this._mapResponse(data, word, language);
        } catch {
            return [];
        }
    }

    private _mapResponse(data: any, word: string, language: string): DictionaryEntry[] {
        // Wiktionary REST API returns { [langCode]: [{ partOfSpeech, language, definitions: [...] }] }
        const langKey = WIKI_LANG_MAP[language] || language;
        const sections = data[langKey];

        if (!Array.isArray(sections) || sections.length === 0) return [];

        const entries: DictionaryEntry[] = [];
        const linguisticData: { label: string; value: string | number; key: string }[] = [];

        // Collect language name from the first section
        const languageName = sections[0]?.language;
        if (languageName && languageName !== language) {
            linguisticData.push({ label: 'Language', value: languageName, key: 'wiki_language' });
        }

        for (const section of sections) {
            const pos = section.partOfSpeech || undefined;
            const definitions: DictionaryDefinition[] = [];

            if (!Array.isArray(section.definitions)) continue;

            for (const def of section.definitions) {
                // Definition text is HTML — strip tags
                const meaning = this._stripHtml(def.definition || '');
                if (!meaning || meaning.trim().length === 0) continue;

                const examples: { sentence: string; collocations?: string[] }[] = [];
                if (Array.isArray(def.examples)) {
                    for (const ex of def.examples) {
                        const sentence = this._stripHtml(typeof ex === 'string' ? ex : ex.text || ex.example || '');
                        if (sentence) {
                            examples.push({ sentence });
                        }
                    }
                }
                // Also check parsedExamples
                if (Array.isArray(def.parsedExamples)) {
                    for (const ex of def.parsedExamples) {
                        const sentence = this._stripHtml(ex.example || '');
                        if (sentence) {
                            examples.push({ sentence });
                        }
                    }
                }

                definitions.push({
                    meaning,
                    partOfSpeech: pos,
                    examples: examples.length > 0 ? examples : undefined,
                });
            }

            if (definitions.length > 0) {
                // Add POS-specific data to linguisticData
                const sectionLinguistic = [...linguisticData];

                if (pos) {
                    sectionLinguistic.push({ label: 'Part of Speech', value: pos, key: `pos_${pos}` });
                }

                entries.push({
                    word,
                    language,
                    partOfSpeech: pos,
                    definitions,
                    linguisticData: sectionLinguistic.length > 0 ? sectionLinguistic : undefined,
                    source: 'api',
                });
            }
        }

        return entries;
    }

    /**
     * Strips HTML tags from Wiktionary definition text.
     * Uses a simple regex approach safe for service worker context.
     */
    private _stripHtml(html: string): string {
        if (!html) return '';
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ') // Collapse whitespace
            .trim();
    }
}
