import { MetheusDictionaryService } from './metheus-dictionary';
import { UnifiedEntry } from '../ui/dictionary-adapter';

// Status Constants (should match your project structure)
const STATUS = {
    NEW: 0,
    SEEN: 1,
    LEARNING_1: 1, // Range start
    KNOWN: 5,
};

export class VocabularyService {
    /**
     * Performs a "Sliding Window Greedy Lookup" to find the longest matching dictionary entry
     * that INCLUDES the word at the clicked position.
     *
     * Strategy:
     * 1. Iterate phrase lengths from MAX (4) down to 1.
     * 2. For each length, check all possible start positions such that the phrase covers textTokenized[clickedIndex].
     * 3. Clean the candidate phrase and check the DB.
     * 4. Return the first (longest) match found.
     *
     * @param textTokenized Array of string tokens (words and punctuation)
     * @param clickedIndex Index of the clicked token in textTokenized
     * @param dictionaryService Instance of dictionary service for lookup
     * @param language Dictionary language
     * @returns The longest matching phrase string, or null if no match found.
     */
    static async findLongestMatch(
        textTokenized: string[],
        clickedIndex: number,
        dictionaryService: MetheusDictionaryService,
        language: string
    ): Promise<string | null> {
        const MAX_PHRASE_LENGTH = 4; // Idioms rarely exceed 4 words ("get out of hand")

        // Ensure bounds
        if (clickedIndex < 0 || clickedIndex >= textTokenized.length) return null;

        // SLIDING WINDOW STRATEGY:
        // We want to find the longest phrase (length 4 -> 1) that:
        // 1. EXISTS in the dictionary
        // 2. INCLUDES the clicked word (at clickedIndex)

        for (let length = MAX_PHRASE_LENGTH; length >= 1; length--) {
            // Determine possible start positions for a window of this length
            // A window of 'length' including 'clickedIndex' can start from:
            // max(0, clickedIndex - length + 1)  up to  clickedIndex

            const minStart = Math.max(0, clickedIndex - length + 1);
            const maxStart = clickedIndex;

            // Iterate all valid windows of this length containing the click
            for (let start = minStart; start <= maxStart; start++) {
                const end = start + length;
                if (end > textTokenized.length) continue;

                // Extract phrase
                const phraseTokens = textTokenized.slice(start, end);
                const rawPhrase = phraseTokens.join('');

                // Clean for dictionary lookup (trim edges, remove trailing punctuation)
                // e.g. "figure out." -> "figure out"
                // IMPORTANT: Use replace logic that preserves CJK but removes punctuation
                const cleanPhrase = rawPhrase
                    .trim()
                    .replace(/[.,;!?"\(\)]+$/, '')
                    .toLowerCase();

                if (!cleanPhrase) continue;

                // Check DB
                // Extension lookup method returns { found: boolean }
                // We use 'lookup' which checks local DB and creates a cache entry
                const result = await dictionaryService.lookup(cleanPhrase, language);

                if (result.found) {
                    // FOUND A MATCH!
                    // console.log(`[VocabularyService] Greedy Match Found: "${cleanPhrase}" for clicked index ${clickedIndex}`);
                    return cleanPhrase;
                }
            }
        }

        return null;
    }

    /**
     * Reorders dictionary definitions based on semantic overlap with the surrounding context.
     * Uses a "Keyword Overlap" heuristic.
     */
    static rankDefinitions(
        definitions: UnifiedEntry['definitions'],
        contextTokens: string[]
    ): UnifiedEntry['definitions'] {
        if (!contextTokens || contextTokens.length === 0 || !definitions || definitions.length <= 1) {
            return definitions;
        }

        // 1. Prepare unique context keywords
        const uniqueContext = new Set(
            contextTokens.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 2 || /[^\u0000-\u007F]/.test(t)) // Keep >2 chars OR non-ASCII (CJK)
        );

        if (uniqueContext.size === 0) return definitions;

        // 2. Score each definition
        const scored = definitions.map((def) => {
            let score = 0;
            // Construct a "search corpus" from the definition and its examples
            const corpus = (
                def.meaning +
                ' ' +
                (def.examples?.map((ex) => ex.sentence).join(' ') || '') +
                ' ' +
                (def.synonyms?.join(' ') || '')
            ).toLowerCase();

            uniqueContext.forEach((token) => {
                // "Language Agnostic" Match:
                // We use .includes() which works for "river" in "riverbank" AND "川" in "山川".
                if (corpus.includes(token)) {
                    score++;
                }
            });

            return { def, score };
        });

        // 3. Sort by Score Descending
        scored.sort((a, b) => b.score - a.score);

        return scored.map((s) => s.def);
    }
}
