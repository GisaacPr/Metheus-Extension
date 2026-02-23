/**
 * ============================================================================
 * BULK MINING MODAL
 * ============================================================================
 *
 * Modal para mostrar progreso y opciones de minado masivo.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useTranslation } from 'react-i18next';

import type { UnknownWordAnalysis, L1SentenceResult } from '@metheus/common/l-plus-one';
import type { BulkMiningProgress, BulkMiningResult, BulkMineWord } from '../../services/bulk-mining-service';

// ============================================================================
// Types
// ============================================================================

export interface Deck {
    id: string;
    name: string;
}

export interface BulkMiningModalProps {
    /** Abrir modal */
    open: boolean;

    /** Cerrar modal */
    onClose: () => void;

    /** Palabras a minar */
    words: UnknownWordAnalysis[];

    /** Contextos de las palabras (frases L+1) */
    contexts: L1SentenceResult[];

    /** Decks disponibles */
    decks?: Deck[];

    /** Deck seleccionado por defecto */
    defaultDeckId?: string;

    /** Callback cuando inicia el minado */
    onStartMining: (options: {
        words: BulkMineWord[];
        includeAudio: boolean;
        includeScreenshots: boolean;
        deckId: string;
    }) => void;

    /** Progreso actual */
    progress?: BulkMiningProgress;

    /** Callback para cancelar */
    onCancel?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export default function BulkMiningModal({
    open,
    onClose,
    words,
    contexts,
    decks = [],
    defaultDeckId = '',
    onStartMining,
    progress,
    onCancel,
}: BulkMiningModalProps) {
    const { t } = useTranslation();
    // Options state
    const [includeAudio, setIncludeAudio] = useState(true);
    const [includeScreenshots, setIncludeScreenshots] = useState(false);
    const [selectedDeckId, setSelectedDeckId] = useState(defaultDeckId);

    // Reset deck selection when default changes
    useEffect(() => {
        if (defaultDeckId) {
            setSelectedDeckId(defaultDeckId);
        }
    }, [defaultDeckId]);

    // Get context for a word
    const getContextForWord = useCallback(
        (word: UnknownWordAnalysis): L1SentenceResult | undefined => {
            return contexts.find((ctx) => ctx.unknownWords.some((w) => w.word === word.word));
        },
        [contexts]
    );

    // Handle start mining
    const handleStart = useCallback(() => {
        const wordsToMine: BulkMineWord[] = [];

        for (const word of words) {
            const context = getContextForWord(word);
            if (context) {
                wordsToMine.push({
                    word,
                    context,
                    timestamp: context.timestamp,
                });
            }
        }

        onStartMining({
            words: wordsToMine,
            includeAudio,
            includeScreenshots,
            deckId: selectedDeckId,
        });
    }, [words, getContextForWord, includeAudio, includeScreenshots, selectedDeckId, onStartMining]);

    // Get icon for result status
    const getResultIcon = (word: string) => {
        if (!progress) return <RadioButtonUncheckedIcon color="disabled" />;

        const result = progress.results.find((r: BulkMiningResult) => r.word === word);

        if (result) {
            return result.success ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />;
        }

        if (progress.current === word) {
            return <HourglassEmptyIcon color="primary" />;
        }

        return <RadioButtonUncheckedIcon color="disabled" />;
    };

    // Check if mining is in progress
    const isMining = progress?.status === 'mining' || progress?.status === 'preparing';
    const isCompleted = progress?.status === 'completed';
    const isCancelled = progress?.status === 'cancelled';

    // Calculate success/fail counts
    const successCount = progress?.results.filter((r: BulkMiningResult) => r.success).length || 0;
    const failCount = progress?.results.filter((r: BulkMiningResult) => !r.success).length || 0;

    return (
        <Dialog open={open} onClose={isMining ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isMining
                    ? t('bulkMining.titleMining', { defaultValue: 'Mining Words...' })
                    : isCompleted
                      ? t('bulkMining.titleComplete', { defaultValue: 'Mining Complete' })
                      : t('bulkMining.titleIdle', { defaultValue: 'Mine L+1 Words' })}
            </DialogTitle>

            <DialogContent>
                {/* Progress bar */}
                {(isMining || isCompleted || isCancelled) && progress && (
                    <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                {isMining && progress.current
                                    ? t('bulkMining.processing', {
                                          defaultValue: 'Processing: {{word}}',
                                          word: progress.current,
                                      })
                                    : isCompleted
                                      ? t('bulkMining.allProcessed', { defaultValue: 'All words processed' })
                                      : t('bulkMining.cancelled', { defaultValue: 'Cancelled' })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {progress.completed}/{progress.total}
                            </Typography>
                        </Box>
                        <LinearProgress
                            variant="determinate"
                            value={(progress.completed / progress.total) * 100}
                            color={isCompleted ? 'success' : isCancelled ? 'warning' : 'primary'}
                        />
                        {isCompleted && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                {t('bulkMining.summary', {
                                    defaultValue: '✓ {{success}} succeeded',
                                    success: successCount,
                                })}
                                {failCount > 0 &&
                                    ` • ${t('bulkMining.summaryFailed', {
                                        defaultValue: '✗ {{fail}} failed',
                                        fail: failCount,
                                    })}`}
                            </Typography>
                        )}
                    </Box>
                )}

                {/* Options (only before mining starts) */}
                {!isMining && !isCompleted && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            {t('bulkMining.options', { defaultValue: 'Options' })}
                        </Typography>

                        <FormControlLabel
                            control={
                                <Checkbox checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} />
                            }
                            label={t('bulkMining.includeAudio', { defaultValue: 'Include audio clips' })}
                        />

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={includeScreenshots}
                                    onChange={(e) => setIncludeScreenshots(e.target.checked)}
                                />
                            }
                            label={t('bulkMining.includeScreenshots', { defaultValue: 'Include screenshots' })}
                        />

                        {decks.length > 0 && (
                            <FormControl fullWidth sx={{ mt: 2 }}>
                                <InputLabel>{t('settings.deck')}</InputLabel>
                                <Select
                                    value={selectedDeckId}
                                    onChange={(e) => setSelectedDeckId(e.target.value)}
                                    label={t('settings.deck')}
                                >
                                    {decks.map((deck) => (
                                        <MenuItem key={deck.id} value={deck.id}>
                                            {deck.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Box>
                )}

                {/* Word list */}
                <Typography variant="subtitle2" gutterBottom>
                    {t('bulkMining.words', { defaultValue: 'Words' })} ({words.length})
                </Typography>

                <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                    {words.map((word) => (
                        <ListItem key={word.word}>
                            <ListItemIcon sx={{ minWidth: 36 }}>{getResultIcon(word.word)}</ListItemIcon>
                            <ListItemText
                                primary={word.word}
                                secondary={
                                    progress?.results.find((r: BulkMiningResult) => r.word === word.word && !r.success)
                                        ?.error ||
                                    t('bulkMining.wordSecondary', {
                                        defaultValue: 'Freq: {{freq}}/10 • {{difficulty}}',
                                        freq: word.frequencyScore,
                                        difficulty: word.difficulty,
                                    })
                                }
                                secondaryTypographyProps={{
                                    color: progress?.results.find(
                                        (r: BulkMiningResult) => r.word === word.word && !r.success
                                    )
                                        ? 'error'
                                        : 'text.secondary',
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            </DialogContent>

            <DialogActions>
                {!isMining && !isCompleted && (
                    <>
                        <Button onClick={onClose}>{t('action.cancel')}</Button>
                        <Button variant="contained" onClick={handleStart} disabled={words.length === 0}>
                            {t('bulkMining.mineWords', {
                                defaultValue: 'Mine {{count}} Words',
                                count: words.length,
                            })}
                        </Button>
                    </>
                )}

                {isMining && (
                    <Button onClick={onCancel} color="error">
                        {t('bulkMining.cancelMining', { defaultValue: 'Cancel Mining' })}
                    </Button>
                )}

                {(isCompleted || isCancelled) && (
                    <Button onClick={onClose} variant="contained">
                        {t('bulkMining.close', { defaultValue: 'Close' })}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
