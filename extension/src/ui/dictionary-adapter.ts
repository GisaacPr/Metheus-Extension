import { DictionaryEntry, DictionaryDefinition } from '../services/metheus-dictionary';

export interface UnifiedEntry {
    id: string;
    word: string;
    phonetic?: string;
    phoneticLabel?: string; // e.g., "IPA", "Pinyin", "Romaji"

    // Core badges
    badges: {
        type: 'pos' | 'level' | 'frequency' | 'other';
        label: string;
        color?: string; // Optional hint for UI
    }[];

    // Data for Metadata Tab
    linguisticData: {
        label: string;
        value: string | number;
        key: string;
    }[];

    // Normalized Definitions
    definitions: {
        index: number;
        meaning: string;
        context?: string;
        synonyms: string[];
        antonyms: string[];
        examples: {
            sentence: string;
            translation?: string;
            grammarNote?: string;
            collocations: string[];
        }[];
    }[];

    language: string; // 'en', 'es', 'zh', etc.
    source?: 'local' | 'api' | 'cache';
    audio?: string;
    translations?: string[]; // Top level translations of the word itself
}

/**
 * Tokenizes text into an array of { text: string, isWord: boolean } objects.
 * Uses Intl.Segmenter for robust, language-aware segmentation (supports CJK).
 */
export function tokenizeText(text: string, language: string = 'en'): { text: string; isWord: boolean }[] {
    if (!text) return [];

    try {
        // Use native Intl.Segmenter
        // @ts-ignore
        const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
        // @ts-ignore
        const segments = segmenter.segment(text);
        const tokens: { text: string; isWord: boolean }[] = [];

        // @ts-ignore
        for (const segment of segments) {
            const isWord =
                segment.isWordLike !== undefined
                    ? segment.isWordLike
                    : /[a-zA-Z0-9À-ÿ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(segment.segment);

            tokens.push({
                text: segment.segment,
                isWord,
            });
        }
        return tokens;
    } catch (e) {
        // Fallback
        const parts = text.split(/([a-zA-Z0-9À-ÿ]+)/g);
        return parts
            .map((token) => {
                if (!token) return null;
                const isWord = /[a-zA-Z0-9À-ÿ]/.test(token);
                return { text: token, isWord };
            })
            .filter((t): t is { text: string; isWord: boolean } => t !== null);
    }
}

/**
 * Normalizes raw dictionary data (optimized, legacy, or mixed) into a clean UI-ready structure.
 * This acts as an Anti-Corruption Layer between chaotic optimized JSONs and the UI.
 */
export function normalizeEntry(raw: DictionaryEntry): UnifiedEntry {
    const entry = raw as any; // Allow relaxed access for dynamic audit keys

    // 1. Resolve Headword
    const word = entry.w || entry.entry_word || entry.word || 'Unknown';

    // 2. Resolve Phonetic
    // Priority: IPA (European) > Pinyin (CN) > Kana/Romaji (JP) > Others
    let phonetic = entry.ipa;
    let phoneticLabel = 'IPA';

    // Helper to safely get the linguistic data object
    const langData = typeof entry.lang === 'object' && entry.lang !== null ? entry.lang : entry.language_specific_data;

    if (!phonetic && langData) {
        if (langData.py) {
            phonetic = langData.py;
            phoneticLabel = 'Pinyin';
        } else if (langData.kana || langData.kana_equivalents) {
            phonetic = langData.kana || langData.kana_equivalents;
            phoneticLabel = 'Kana';
        } else if (langData.romanization) {
            phonetic = langData.romanization;
            phoneticLabel = 'Romanization';
        } else if (langData.zh_py) {
            phonetic = langData.zh_py;
            phoneticLabel = 'Pinyin';
        }
    }

    // Fallback path specifically for "pron" object seen in some legacy/mixed data
    if (!phonetic && entry.pron?.romanization) {
        phonetic = entry.pron.romanization;
        phoneticLabel = 'Romanization';
    }

    // 3. Resolve Badges (POS, Level, Frequency)
    const badges: UnifiedEntry['badges'] = [];

    // Part of Speech
    const pos = entry.pos || entry.part_of_speech;
    if (pos && typeof pos === 'string' && pos.toLowerCase() !== 'unknown') {
        badges.push({ type: 'pos', label: pos });
    }

    // Level (CEFR, HSK, JLPT)
    // 'lvl' is the optimized key for CEFR usually.
    // 'hsk' or 'jlpt' might exist in 'lang' for Asian languages?
    const level = entry.lvl || entry.cefr_level || langData?.hsk || langData?.jlpt;
    if (level) {
        badges.push({ type: 'level', label: String(level) });
    }

    // Frequency
    const freq = entry.frequency || entry.f;
    if (freq) {
        // "f" is usually a rank (1 = most common). "frequency" might be "Top 300".
        // If it's a number, format it.
        const label = typeof freq === 'number' ? `Top ${freq}` : freq;
        badges.push({ type: 'frequency', label: label.toString() });
    }

    // 4. Resolve Metadata (Linguistic Details)
    // Flatten attributes from 'lang' object
    const linguisticData: UnifiedEntry['linguisticData'] = [];

    if (langData) {
        if (Array.isArray(langData)) {
            // Already mapped array
            linguisticData.push(...langData);
        } else {
            // Object map
            const metadataMap: Record<string, string> = {
                strk: 'Strokes',
                stroke_count: 'Strokes',
                rad: 'Radical',
                radical: 'Radical',
                tone: 'Tones',
                tone_number: 'Tones',
                scr: 'Script',
                wazn: 'Weight',
                root: 'Root',
                root_letters: 'Root',
                cases: 'Cases',
                gender: 'Gender',
                aspect: 'Aspect',
                hanja: 'Hanja',
                onyomi: 'On Reading',
                on: 'On Reading',
                kunyomi: 'Kun Reading',
                kun: 'Kun Reading',
                kana: 'Reading',
                romaji: 'Romaji',
                hsk: 'HSK Level',
                jlpt: 'JLPT Level',
                py: 'Pinyin',
                zh_py: 'Pinyin',
                pym: 'Pinyin (Marks)',
                pyn: 'Pinyin (Numbers)',
                hrk: 'Vocalization',
                devanagari: 'Devanagari',
                postpositions: 'Postpositions',
                postpositions_notes: 'Postpositions Notes',
                copula_omission_notes: 'Copula Omission',
                vowel_harmony: 'Vowel Harmony',
                pol: 'Politeness Level',
                declension: 'Declension',
                conjugation: 'Conjugation',
            };

            Object.keys(langData).forEach((key) => {
                const label = metadataMap[key];
                if (label && langData[key]) {
                    linguisticData.push({
                        label,
                        value: langData[key],
                        key,
                    });
                }
            });
        }
    }

    if (entry.register) {
        linguisticData.push({ label: 'Register', value: entry.register, key: 'register' });
    }

    // 5. Resolve Definitions
    const definitions: UnifiedEntry['definitions'] = [];
    const rawDefs = entry.d || entry.definitions || [];

    // Map raw definitions
    if (Array.isArray(rawDefs)) {
        rawDefs.forEach((d: any, index: number) => {
            let rawMeaning = '';
            let context = undefined;
            let synonyms: string[] = [];
            let antonyms: string[] = [];
            let exList: any[] = [];

            // 1. Extract Raw Data based on type
            if (typeof d === 'string') {
                rawMeaning = d;
            } else {
                rawMeaning = d.m || d.meaning || 'No definition text';
                context = d.ctx || d.usage_context || d.context;
                synonyms = d.rel?.syn || d.rel?.synonyms || d.relations?.synonyms || d.synonyms || [];
                antonyms = d.rel?.ant || d.rel?.antonyms || d.relations?.antonyms || d.antonyms || [];

                // Extract Examples
                const rawExamples = d.ex || d.examples || [];
                if (Array.isArray(rawExamples)) {
                    rawExamples.forEach((ex: any) => {
                        let sentence = '';
                        let grammarNote = undefined;
                        let collocations: string[] = [];
                        let translation = undefined;

                        if (typeof ex === 'string') {
                            sentence = ex;
                        } else {
                            sentence = ex.s || ex.sentence || '';
                            grammarNote = ex.gn || ex.grammatical_note || ex.grammarNote;
                            collocations = ex.collocations || [];
                            translation = ex.translation;
                        }

                        if (sentence) {
                            exList.push({
                                sentence,
                                grammarNote,
                                collocations,
                                translation,
                            });
                        }
                    });
                }
            }

            // 2. Expand Clumped Definitions (1. A<br>2. B)
            const expandedMeanings: string[] = [];
            // Pattern: Split by <br>, <br/>, or newlines
            const lines = rawMeaning
                .split(/(?:<br\s*\/?>|\r?\n)+/)
                .map((l) => l.trim())
                .filter((l) => l);
            // Heuristic: Check if we have numbered items "1. ", "2. "
            const hasNumberedList = lines.some((l) => /^\d+[\.)]/.test(l));

            if (hasNumberedList && lines.length > 1) {
                lines.forEach((line) => {
                    if (/^\d+[\.)]\s+/.test(line)) {
                        expandedMeanings.push(line.replace(/^\d+[\.)]\s+/, ''));
                    } else if (line.length > 2 && !/^\d+$/.test(line)) {
                        expandedMeanings.push(line);
                    }
                });
            }

            if (expandedMeanings.length === 0) {
                expandedMeanings.push(rawMeaning);
            }

            // 3. Push to Definitions
            expandedMeanings.forEach((m) => {
                definitions.push({
                    index: definitions.length + 1,
                    meaning: m,
                    context,
                    synonyms,
                    antonyms,
                    examples: exList,
                });
            });
        });
    } else if (entry.definition) {
        // Legacy single definition fallback
        definitions.push({
            index: 1,
            meaning: entry.definition,
            synonyms: [],
            antonyms: [],
            examples: [],
        });
    }

    return {
        id: entry.id || word,
        word,
        phonetic,
        phoneticLabel,
        badges,
        linguisticData,
        definitions,
        language: entry.language || 'en',
        source: entry.source as any,
        audio: entry.audio,
        translations: entry.translations,
    };
}

/**
 * Greedily merges multiple dictionary entries into a single UnifiedEntry.
 */
export function normalizeAndMergeEntries(rawEntries: DictionaryEntry[]): UnifiedEntry | null {
    if (!rawEntries || rawEntries.length === 0) return null;

    // 1. Normalize all individually first
    const unifiedEntries = rawEntries.map(normalizeEntry);

    // 2. Find the "Best" Base Entry
    const base = unifiedEntries.reduce((prev, curr) => {
        const prevScore = (prev.phonetic ? 2 : 0) + (prev.badges.find((b) => b.type === 'level') ? 1 : 0);
        const currScore = (curr.phonetic ? 2 : 0) + (curr.badges.find((b) => b.type === 'level') ? 1 : 0);
        return currScore > prevScore ? curr : prev;
    }, unifiedEntries[0]);

    // 3. Merge Data
    const mergedDefinitions = [...base.definitions];
    const mergedBadges = [...base.badges];
    const mergedLinguistic = [...base.linguisticData];

    const defSignatures = new Set(base.definitions.map((d) => d.meaning.toLowerCase().trim()));

    unifiedEntries.forEach((entry) => {
        if (entry === base) return;

        // A. Merge Definitions
        entry.definitions.forEach((def) => {
            const signature = def.meaning.toLowerCase().trim();

            // Skip empty definitions (e.g. Tatoeba example-only entries)
            if (!signature) {
                // But steal their examples and attach to existing definitions
                if (def.examples && def.examples.length > 0) {
                    _distributeExamples(mergedDefinitions, def.examples);
                }
                return;
            }

            if (!defSignatures.has(signature)) {
                defSignatures.add(signature);
                mergedDefinitions.push({
                    ...def,
                    index: mergedDefinitions.length + 1,
                });
            } else {
                // Definition already exists — enrich it with examples from the new source
                if (def.examples && def.examples.length > 0) {
                    const existing = mergedDefinitions.find((d) => d.meaning.toLowerCase().trim() === signature);
                    if (existing) {
                        const existingSentences = new Set(
                            existing.examples.map((e) => e.sentence.toLowerCase().trim())
                        );
                        const newExamples = def.examples.filter(
                            (e) => !existingSentences.has(e.sentence.toLowerCase().trim())
                        );
                        if (newExamples.length > 0) {
                            existing.examples = [...existing.examples, ...newExamples];
                        }
                    }
                }
            }
        });

        // B. Merge Badges
        entry.badges.forEach((badge) => {
            const exists = mergedBadges.some((b) => b.type === badge.type && b.label === badge.label);
            if (!exists) {
                if (badge.type === 'frequency') {
                    const existingFreq = mergedBadges.findIndex((b) => b.type === 'frequency');
                    if (existingFreq === -1) {
                        mergedBadges.push(badge);
                    }
                } else {
                    mergedBadges.push(badge);
                }
            }
        });

        // C. Merge Linguistic Data
        entry.linguisticData.forEach((item) => {
            const exists = mergedLinguistic.some((l) => l.key === item.key);
            if (!exists) mergedLinguistic.push(item);
        });
    });

    // D. Fill gaps: audio, phonetic, translations from any entry
    let mergedAudio = base.audio;
    let mergedPhonetic = base.phonetic;
    let mergedPhoneticLabel = base.phoneticLabel;
    let mergedTranslations = base.translations;

    for (const entry of unifiedEntries) {
        if (entry === base) continue;
        if (!mergedAudio && entry.audio) mergedAudio = entry.audio;
        if (!mergedPhonetic && entry.phonetic) {
            mergedPhonetic = entry.phonetic;
            mergedPhoneticLabel = entry.phoneticLabel;
        }
        if (!mergedTranslations && entry.translations) mergedTranslations = entry.translations;
    }

    return {
        ...base,
        definitions: mergedDefinitions,
        badges: mergedBadges,
        linguisticData: mergedLinguistic,
        audio: mergedAudio,
        phonetic: mergedPhonetic,
        phoneticLabel: mergedPhoneticLabel,
        translations: mergedTranslations,
    };
}

/**
 * Distributes orphan examples (from example-only entries like Tatoeba)
 * across existing definitions that lack examples.
 */
function _distributeExamples(
    definitions: UnifiedEntry['definitions'],
    examples: UnifiedEntry['definitions'][0]['examples']
): void {
    if (!examples || examples.length === 0) return;

    // Find definitions with no examples and give them some
    const defsWithoutExamples = definitions.filter((d) => d.examples.length === 0);
    let exIndex = 0;

    for (const def of defsWithoutExamples) {
        if (exIndex >= examples.length) break;
        // Give each empty definition 1-2 examples
        const count = Math.min(2, examples.length - exIndex);
        def.examples = examples.slice(exIndex, exIndex + count);
        exIndex += count;
    }

    // If there are leftover examples and the first definition exists, append to it
    if (exIndex < examples.length && definitions.length > 0) {
        const firstDef = definitions[0];
        const existingSentences = new Set(firstDef.examples.map((e) => e.sentence.toLowerCase().trim()));
        const remaining = examples
            .slice(exIndex)
            .filter((e) => !existingSentences.has(e.sentence.toLowerCase().trim()));
        firstDef.examples = [...firstDef.examples, ...remaining];
    }
}
