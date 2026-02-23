/**
 * ============================================================================
 * L+1 ANALYSIS PANEL COMPONENT
 * ============================================================================
 *
 * Componente React para mostrar análisis de comprensión L+1 en videos.
 * Muestra:
 * - Barra de comprensión general
 * - Lista de frases L+1
 * - Palabras recomendadas para aprender
 * - Acciones de minado masivo
 */

import React, { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';

import type {
    VideoAnalysisResult,
    L1SentenceResult,
    UnknownWordAnalysis,
    ComprehensionLevel,
} from '@metheus/common/l-plus-one';

// ============================================================================
// Types
// ============================================================================

export interface L1AnalysisPanelProps {
    /** Resultado del análisis */
    analysis: VideoAnalysisResult | null;

    /** Está cargando/analizando */
    isLoading?: boolean;

    /** Callback cuando se quiere minar una palabra */
    onMineWord?: (word: UnknownWordAnalysis, context: L1SentenceResult) => void;

    /** Callback cuando se marca como conocida */
    onMarkKnown?: (word: string) => void;

    /** Callback para minar múltiples palabras */
    onMineAll?: (words: UnknownWordAnalysis[]) => void;

    /** Callback para saltar a un timestamp */
    onJumpToTime?: (timestamp: number) => void;

    /** Mostrar sección de frases */
    showSentences?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Barra de progreso de comprensión con gradiente de colores
 */
function ComprehensionBar({ value }: { value: number }) {
    // Color basado en nivel de comprensión
    const getColor = (v: number): string => {
        if (v >= 85) return '#4caf50'; // Verde - L+1
        if (v >= 70) return '#ff9800'; // Naranja - L+2
        if (v >= 50) return '#f44336'; // Rojo - Difícil
        return '#9e9e9e'; // Gris - Muy difícil
    };

    const color = getColor(value);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
                <LinearProgress
                    variant="determinate"
                    value={value}
                    sx={{
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': {
                            backgroundColor: color,
                            borderRadius: 5,
                        },
                    }}
                />
            </Box>
            <Typography variant="body2" sx={{ minWidth: 45, fontWeight: 'bold', color }}>
                {value}%
            </Typography>
        </Box>
    );
}

/**
 * Chip de nivel L+N con colores
 */
function LevelChip({ level }: { level: ComprehensionLevel }) {
    const config: Record<ComprehensionLevel, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
        'L+0': { color: 'default', label: 'L+0 (Easy)' },
        'L+1': { color: 'success', label: 'L+1 ✓' },
        'L+2': { color: 'warning', label: 'L+2' },
        'L+3': { color: 'error', label: 'L+3' },
        'L+5': { color: 'error', label: 'L+5 ✗' },
    };

    const { color, label } = config[level];

    return <Chip size="small" color={color} label={label} />;
}

/**
 * Chip de dificultad de palabra
 */
function DifficultyChip({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' | 'rare' }) {
    const colors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
        easy: 'success',
        medium: 'warning',
        hard: 'error',
        rare: 'default',
    };

    return (
        <Chip
            size="small"
            variant="outlined"
            color={colors[difficulty]}
            label={difficulty}
            sx={{ fontSize: '0.7rem' }}
        />
    );
}

/**
 * Item de palabra recomendada
 */
function WordItem({
    word,
    selected,
    onToggle,
    onMine,
    onMarkKnown,
}: {
    word: UnknownWordAnalysis;
    selected: boolean;
    onToggle: () => void;
    onMine: () => void;
    onMarkKnown: () => void;
}) {
    return (
        <ListItem
            sx={{
                pl: 1,
                pr: 1,
                '&:hover': { backgroundColor: 'action.hover' },
                borderRadius: 1,
            }}
        >
            <Checkbox size="small" checked={selected} onChange={onToggle} sx={{ mr: 1 }} />
            <ListItemText
                primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1" fontWeight="medium">
                            {word.word}
                        </Typography>
                        <DifficultyChip difficulty={word.difficulty} />
                    </Box>
                }
                secondary={
                    <Typography variant="caption" color="text.secondary">
                        Freq: {word.frequencyScore}/10 • Seen: {word.occurrences}x
                    </Typography>
                }
            />
            <ListItemSecondaryAction>
                <Tooltip title="Add card">
                    <IconButton size="small" onClick={onMine} color="primary">
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Mark as known">
                    <IconButton size="small" onClick={onMarkKnown} color="success">
                        <CheckIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </ListItemSecondaryAction>
        </ListItem>
    );
}

/**
 * Item de frase L+1
 */
function SentenceItem({
    sentence,
    onJump,
    onMine,
}: {
    sentence: L1SentenceResult;
    onJump?: () => void;
    onMine?: () => void;
}) {
    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <ListItem
            sx={{
                pl: 1,
                pr: 1,
                flexDirection: 'column',
                alignItems: 'flex-start',
                '&:hover': { backgroundColor: 'action.hover' },
                borderRadius: 1,
            }}
        >
            <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1 }}>
                {sentence.timestamp !== undefined && (
                    <Chip
                        size="small"
                        label={formatTime(sentence.timestamp)}
                        onClick={onJump}
                        clickable
                        icon={<PlayArrowIcon fontSize="small" />}
                        sx={{ fontSize: '0.7rem' }}
                    />
                )}
                <LevelChip level={sentence.level} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {sentence.comprehension}%
                </Typography>
            </Box>
            <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.4 }}>
                {sentence.sentence}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                {sentence.unknownWords.slice(0, 3).map((w) => (
                    <Chip
                        key={w.word}
                        size="small"
                        label={w.word}
                        variant="outlined"
                        color={w.isL1Candidate ? 'primary' : 'default'}
                        onClick={onMine}
                        sx={{ fontSize: '0.7rem' }}
                    />
                ))}
            </Box>
        </ListItem>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export default function L1AnalysisPanel({
    analysis,
    isLoading = false,
    onMineWord,
    onMarkKnown,
    onMineAll,
    onJumpToTime,
    showSentences = true,
}: L1AnalysisPanelProps) {
    const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
    const [showAllSentences, setShowAllSentences] = useState(false);
    const [showAllWords, setShowAllWords] = useState(false);

    // Toggle word selection
    const toggleWord = useCallback((word: string) => {
        setSelectedWords((prev) => {
            const next = new Set(prev);
            if (next.has(word)) {
                next.delete(word);
            } else {
                next.add(word);
            }
            return next;
        });
    }, []);

    // Select all L+1 candidate words
    const selectAllL1 = useCallback(() => {
        if (!analysis) return;
        const l1Words = analysis.recommendedWords.filter((w) => w.isL1Candidate).map((w) => w.word);
        setSelectedWords(new Set(l1Words));
    }, [analysis]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedWords(new Set());
    }, []);

    // Handle mine selected
    const handleMineSelected = useCallback(() => {
        if (!analysis || !onMineAll) return;
        const wordsToMine = analysis.recommendedWords.filter((w) => selectedWords.has(w.word));
        onMineAll(wordsToMine);
    }, [analysis, selectedWords, onMineAll]);

    // Memoized sentence lists
    const displaySentences = useMemo(() => {
        if (!analysis) return [];
        const sentences = showAllSentences ? analysis.l1Sentences : analysis.l1Sentences.slice(0, 5);
        return sentences;
    }, [analysis, showAllSentences]);

    // Memoized word lists
    const displayWords = useMemo(() => {
        if (!analysis) return [];
        const words = showAllWords ? analysis.recommendedWords : analysis.recommendedWords.slice(0, 10);
        return words;
    }, [analysis, showAllWords]);

    // Loading state
    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <LinearProgress sx={{ flex: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        Analyzing...
                    </Typography>
                </Box>
            </Paper>
        );
    }

    // No analysis yet
    if (!analysis) {
        return (
            <Paper sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                    Load subtitles to analyze comprehension
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={0} sx={{ p: 2, backgroundColor: 'background.default' }}>
            {/* Header with comprehension */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    📊 Comprehension Analysis
                </Typography>
                <ComprehensionBar value={analysis.averageComprehension} />

                {/* Stats row */}
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label={`${analysis.l1SentenceCount} L+1`} color="success" variant="outlined" />
                    <Chip size="small" label={`${analysis.l2SentenceCount} L+2`} color="warning" variant="outlined" />
                    <Chip
                        size="small"
                        label={`${analysis.recommendedWords.length} words`}
                        color="primary"
                        variant="outlined"
                    />
                </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Recommended Words Section */}
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight="medium">
                        📚 Recommended Words ({analysis.recommendedWords.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" onClick={selectAllL1}>
                            Select All
                        </Button>
                        {selectedWords.size > 0 && (
                            <Button size="small" onClick={clearSelection}>
                                Clear
                            </Button>
                        )}
                    </Box>
                </Box>

                <List dense disablePadding>
                    {displayWords.map((word) => (
                        <WordItem
                            key={word.word}
                            word={word}
                            selected={selectedWords.has(word.word)}
                            onToggle={() => toggleWord(word.word)}
                            onMine={() => {
                                // Find context sentence
                                const context = analysis.l1Sentences.find((s) =>
                                    s.unknownWords.some((w) => w.word === word.word)
                                );
                                if (context && onMineWord) {
                                    onMineWord(word, context);
                                }
                            }}
                            onMarkKnown={() => onMarkKnown?.(word.word)}
                        />
                    ))}
                </List>

                {analysis.recommendedWords.length > 10 && (
                    <Button
                        size="small"
                        onClick={() => setShowAllWords(!showAllWords)}
                        startIcon={showAllWords ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ mt: 1 }}
                    >
                        {showAllWords ? 'Show Less' : `Show All (${analysis.recommendedWords.length})`}
                    </Button>
                )}

                {/* Mine Selected Button */}
                {selectedWords.size > 0 && onMineAll && (
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<DownloadIcon />}
                        onClick={handleMineSelected}
                        fullWidth
                        sx={{ mt: 2 }}
                    >
                        Mine Selected ({selectedWords.size})
                    </Button>
                )}
            </Box>

            {/* L+1 Sentences Section */}
            {showSentences && analysis.l1Sentences.length > 0 && (
                <>
                    <Divider sx={{ my: 2 }} />

                    <Box>
                        <Typography variant="subtitle2" fontWeight="medium" gutterBottom>
                            🎯 L+1 Sentences ({analysis.l1SentenceCount})
                        </Typography>

                        <List dense disablePadding>
                            {displaySentences.map((sentence, index) => (
                                <React.Fragment key={index}>
                                    <SentenceItem
                                        sentence={sentence}
                                        onJump={
                                            sentence.timestamp !== undefined && onJumpToTime
                                                ? () => onJumpToTime(sentence.timestamp!)
                                                : undefined
                                        }
                                        onMine={() => {
                                            const word = sentence.unknownWords.find((w) => w.isL1Candidate);
                                            if (word && onMineWord) {
                                                onMineWord(word, sentence);
                                            }
                                        }}
                                    />
                                    {index < displaySentences.length - 1 && <Divider variant="inset" />}
                                </React.Fragment>
                            ))}
                        </List>

                        {analysis.l1Sentences.length > 5 && (
                            <Button
                                size="small"
                                onClick={() => setShowAllSentences(!showAllSentences)}
                                startIcon={showAllSentences ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                sx={{ mt: 1 }}
                            >
                                {showAllSentences ? 'Show Less' : `Show All (${analysis.l1Sentences.length})`}
                            </Button>
                        )}
                    </Box>
                </>
            )}

            {/* Level Distribution */}
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Level Distribution
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {Object.entries(analysis.levelDistribution).map(([level, count]) => (
                        <Chip
                            key={level}
                            size="small"
                            variant="outlined"
                            label={`${level}: ${count}`}
                            sx={{ fontSize: '0.65rem' }}
                        />
                    ))}
                </Box>
            </Box>
        </Paper>
    );
}
