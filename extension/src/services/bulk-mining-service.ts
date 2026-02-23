/**
 * BULK MINING SERVICE
 *
 * Service for bulk mining words with audio and screenshots
 */

import type { UnknownWordAnalysis, L1SentenceResult } from '@metheus/common/l-plus-one';

export interface BulkMineWord {
    word: UnknownWordAnalysis;
    context: L1SentenceResult;
    timestamp?: number;
}

export interface BulkMiningResult {
    word: string;
    success: boolean;
    error?: string;
}

export interface BulkMiningProgress {
    status: 'idle' | 'preparing' | 'mining' | 'completed' | 'cancelled' | 'error';
    current?: string;
    currentIndex: number;
    totalWords: number;
    completed: number;
    total: number;
    results: BulkMiningResult[];
    error?: string;
}
