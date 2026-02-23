export type { UnifiedEntry } from './dictionary-adapter';

export interface UnifiedDefinition {
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
}
