/**
 * Online Dictionary Module — barrel export
 */
export { OnlineDictionaryService, getOnlineDictionaryService } from './online-dictionary-service';
export type { OnlineDictionaryProvider, OnlineCacheEntry, OnlineLookupResult } from './types';
export { FreeDictionaryProvider } from './free-dictionary-provider';
export { WiktionaryProvider } from './wiktionary-provider';
export { JishoProvider } from './jisho-provider';
export { NiklKoreanProvider } from './nikl-korean-provider';
export { TatoebaProvider } from './tatoeba-provider';
