/**
 * NIKL Korean Dictionary API Provider
 * https://krdict.korean.go.kr/openApi/openApiInfo
 *
 * Korean-only provider via the National Institute of Korean Language open API.
 * Returns: definitions, pronunciation, difficulty levels, examples.
 *
 * Note: This API requires an API key. For now we use the public search endpoint
 * which returns XML. If unavailable, we fall back gracefully.
 */

import { DictionaryEntry, DictionaryDefinition } from '../metheus-dictionary';
import { OnlineDictionaryProvider } from './types';

export class NiklKoreanProvider implements OnlineDictionaryProvider {
    readonly name = 'NIKL Korean';
    readonly supportedLanguages = ['ko'];
    readonly timeout = 2000;

    // Public search endpoint (no auth, limited)
    private readonly _baseUrl = 'https://krdict.korean.go.kr/api/search';

    // API key can be set if available
    private _apiKey: string | undefined;

    constructor(apiKey?: string) {
        this._apiKey = apiKey;
    }

    async lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
        if (language !== 'ko') return [];

        try {
            const params = new URLSearchParams({
                q: word,
                translated: 'y',
                trans_lang: '1', // English translation
                sort: 'dict',
                num: '5',
                key: this._apiKey || '',
            });

            const url = `${this._baseUrl}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                signal: signal ?? AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) return [];

            const text = await response.text();
            return this._parseXmlResponse(text, word);
        } catch {
            return [];
        }
    }

    /**
     * Parse the XML response from NIKL API.
     * Uses regex-based parsing since DOMParser may not be available in service worker.
     */
    private _parseXmlResponse(xml: string, queryWord: string): DictionaryEntry[] {
        const entries: DictionaryEntry[] = [];

        // Extract <item> blocks
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;

        while ((itemMatch = itemRegex.exec(xml)) !== null) {
            const itemXml = itemMatch[1];

            // Extract fields
            const word = this._extractTag(itemXml, 'word') || queryWord;
            const pos = this._extractTag(itemXml, 'pos');
            const pronunciation = this._extractTag(itemXml, 'pronunciation');

            // Extract senses
            const senseRegex = /<sense>([\s\S]*?)<\/sense>/g;
            let senseMatch;
            const definitions: DictionaryDefinition[] = [];
            const linguisticData: { label: string; value: string | number; key: string }[] = [];

            while ((senseMatch = senseRegex.exec(itemXml)) !== null) {
                const senseXml = senseMatch[1];
                const definition = this._extractTag(senseXml, 'definition') || '';
                const translatedDef = this._extractTag(senseXml, 'trans_word') || '';
                const transDefinition = this._extractTag(senseXml, 'trans_dfn') || '';

                // Use English translation if available, otherwise Korean definition
                const meaning = transDefinition || translatedDef || definition;
                if (!meaning) continue;

                // Extract example sentences
                const examples: { sentence: string; collocations?: string[] }[] = [];
                const exampleRegex = /<example>([\s\S]*?)<\/example>/g;
                let exMatch;
                while ((exMatch = exampleRegex.exec(senseXml)) !== null) {
                    const sentence = this._stripHtml(exMatch[1]);
                    if (sentence) {
                        examples.push({ sentence });
                    }
                }

                definitions.push({
                    meaning: this._stripHtml(meaning),
                    examples: examples.length > 0 ? examples : undefined,
                });
            }

            // Difficulty level
            const grade = this._extractTag(itemXml, 'word_grade');
            if (grade) {
                linguisticData.push({ label: 'Difficulty', value: grade, key: 'word_grade' });
            }

            if (definitions.length > 0) {
                entries.push({
                    word,
                    language: 'ko',
                    phonetic: pronunciation || undefined,
                    partOfSpeech: pos || undefined,
                    definitions,
                    linguisticData: linguisticData.length > 0 ? linguisticData : undefined,
                    source: 'api',
                });
            }
        }

        return entries;
    }

    private _extractTag(xml: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    private _stripHtml(text: string): string {
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}
