/**
 * Jisho.org API Provider (Japanese)
 * https://jisho.org/api/v1/search/words
 *
 * Japanese-only provider with rich data:
 * furigana/reading as phonetic, JLPT levels, common word flag, POS, definitions.
 */

import { DictionaryEntry, DictionaryDefinition } from '../metheus-dictionary';
import { OnlineDictionaryProvider } from './types';

export class JishoProvider implements OnlineDictionaryProvider {
    readonly name = 'Jisho';
    readonly supportedLanguages = ['ja'];
    readonly timeout = 2000;

    private readonly _baseUrl = 'https://jisho.org/api/v1/search/words';

    async lookup(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
        if (language !== 'ja') return [];

        try {
            const url = `${this._baseUrl}?keyword=${encodeURIComponent(word)}`;
            const response = await fetch(url, {
                method: 'GET',
                signal: signal ?? AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) return [];

            const data = await response.json();
            if (!data?.data || !Array.isArray(data.data) || data.data.length === 0) return [];

            // Only take top 3 results to avoid noise
            return this._mapResponse(data.data.slice(0, 3), word);
        } catch {
            return [];
        }
    }

    private _mapResponse(results: any[], word: string): DictionaryEntry[] {
        const entries: DictionaryEntry[] = [];

        for (const item of results) {
            // Extract reading (furigana) and word form
            let headword = word;
            let reading: string | undefined;

            if (Array.isArray(item.japanese) && item.japanese.length > 0) {
                const jp = item.japanese[0];
                headword = jp.word || jp.reading || word;
                reading = jp.reading;
            }

            // Extract senses → definitions
            if (!Array.isArray(item.senses) || item.senses.length === 0) continue;

            const definitions: DictionaryDefinition[] = [];
            const allPos = new Set<string>();

            for (const sense of item.senses) {
                // English definitions
                const englishDefs = Array.isArray(sense.english_definitions) ? sense.english_definitions : [];
                if (englishDefs.length === 0) continue;

                const meaning = englishDefs.join('; ');

                // POS tags
                const posTags = Array.isArray(sense.parts_of_speech) ? sense.parts_of_speech : [];
                for (const p of posTags) {
                    if (p) allPos.add(p);
                }

                definitions.push({
                    meaning,
                    partOfSpeech: posTags[0] || undefined,
                });
            }

            // Build linguistic metadata
            const linguisticData: { label: string; value: string | number; key: string }[] = [];

            // JLPT Level
            if (Array.isArray(item.jlpt) && item.jlpt.length > 0) {
                const jlptLevel = item.jlpt[0].replace('jlpt-', '').toUpperCase();
                linguisticData.push({ label: 'JLPT Level', value: jlptLevel, key: 'jlpt' });
            }

            // Common word
            if (item.is_common) {
                linguisticData.push({ label: 'Common Word', value: 'Yes', key: 'is_common' });
            }

            // Additional readings
            if (Array.isArray(item.japanese) && item.japanese.length > 1) {
                const altReadings = item.japanese
                    .slice(1, 4)
                    .map((jp: any) => jp.reading)
                    .filter(Boolean)
                    .join(', ');
                if (altReadings) {
                    linguisticData.push({ label: 'Alt. Readings', value: altReadings, key: 'alt_readings' });
                }
            }

            if (definitions.length > 0) {
                entries.push({
                    word: headword,
                    language: 'ja',
                    phonetic: reading,
                    partOfSpeech: allPos.size > 0 ? Array.from(allPos)[0] : undefined,
                    definitions,
                    linguisticData: linguisticData.length > 0 ? linguisticData : undefined,
                    // JLPT level as CEFR equivalent
                    cefr:
                        Array.isArray(item.jlpt) && item.jlpt.length > 0
                            ? item.jlpt[0].replace('jlpt-', '').toUpperCase()
                            : undefined,
                    source: 'api',
                });
            }
        }

        return entries;
    }
}
