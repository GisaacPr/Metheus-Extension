import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Check, Search, Sparkles, Brain, Loader2 } from 'lucide-react';
import { cn } from '../utils';
import { UnifiedEntry } from '../dictionary-adapter';
import { useTranslation, useTTS, useGoogleTranslation } from '../hooks';
import { DictionaryHeader } from './dictionary/DictionaryHeader';
import { DictionaryMeaning } from './dictionary/DictionaryMeaning';
import { DictionaryExamples } from './dictionary/DictionaryExamples';
import { DictionaryMetadata } from './dictionary/DictionaryMetadata';

// Status Constants
// NOTE: 0=New/Unknown, 1-3=Learning levels, 4-5=Known
const STATUS = {
    NEW: 0,
    SEEN: 1,
    LEARNING_1: 1,
    KNOWN: 5,
};

interface DictionaryPopupProps {
    word: string;
    context?: string; // Sentence
    contextLanguage?: string;
    themeType?: 'dark' | 'light';
    position: {
        x: number;
        y: number;
        anchorRect?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
            width: number;
            height: number;
        };
    };
    isOpen: boolean;
    onClose: () => void;

    // Service Methods (injected)
    onGetDefinition: (word: string) => Promise<UnifiedEntry | null>;
    /**
     * Streaming online enrichment.
     * Fires parallel per-provider requests. Each provider batch is delivered
     * via the onBatch callback as it arrives, giving a progressive loading effect.
     */
    onOnlineEnrich?: (word: string, language: string, onBatch: (batch: UnifiedEntry) => void) => Promise<void>;
    onMarkKnown: (word: string, status: number) => Promise<void>;
    onCreateCard: (
        entry: UnifiedEntry,
        context: string,
        definition: string,
        metadata?: {
            contextTranslation?: string;
            definitionTranslation?: string;
            wordTranslation?: string;
            phonetic?: string;
            phoneticLabel?: string;
            details?: string;
        }
    ) => Promise<{ requestId?: string; cardId?: string } | void>;
    onOpenSavedCard?: (cardId: string) => Promise<void> | void;
    onGetWordStatus: (word: string) => Promise<number>;

    variant?: 'popup' | 'sidebar';
}

export const DictionaryPopup: React.FC<DictionaryPopupProps> = ({
    word,
    context,
    contextLanguage,
    themeType,
    position,
    isOpen,
    onClose,
    onGetDefinition,
    onOnlineEnrich,
    onMarkKnown,
    onCreateCard,
    onOpenSavedCard,
    onGetWordStatus,
    variant = 'popup',
}) => {
    const [entry, setEntry] = useState<UnifiedEntry | null>(null);
    const [requestedWord, setRequestedWord] = useState<string>(word);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'definitions' | 'examples' | 'details'>('definitions');
    const [status, setStatus] = useState<number>(0);
    const [savedCardId, setSavedCardId] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState<number | undefined>(undefined);
    const [showLearningLevels, setShowLearningLevels] = useState(false);
    const [contextTranslation, setContextTranslation] = useState<string | null>(null);

    const popupRef = useRef<HTMLDivElement>(null);
    const { t, locale } = useTranslation();
    const { translateText } = useGoogleTranslation();
    const { speak, state } = useTTS({ language: entry?.language || 'en' });
    const isSpeakingWord = state.isPlaying;

    useEffect(() => {
        setContextTranslation(null);
        setSavedCardId(null);
    }, [word, context]);

    useEffect(() => {
        if (!context?.trim() || !locale) {
            return;
        }

        const sourceLanguage = contextLanguage || entry?.language || 'en';
        if (locale === sourceLanguage) {
            setContextTranslation(context);
            return;
        }

        let cancelled = false;
        translateText(context, locale, sourceLanguage).then((translated) => {
            if (!cancelled && translated) {
                setContextTranslation(translated);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [context, contextLanguage, entry?.language, locale, translateText]);

    // Prefer platform-provided audio when available, else fallback to browser TTS
    const playAudioUrl = (url: string) => {
        try {
            const audio = new Audio(url);
            void audio.play().catch(() => {
                // Fallback to TTS if autoplay blocked or other error
                speak(entry?.word ?? word);
            });
        } catch {
            speak(entry?.word ?? word);
        }
    };

    // Load definition
    useEffect(() => {
        if (isOpen && word) {
            setRequestedWord(word);
            setLoading(true);
            setEntry(null);
            setIsEnriching(false);
            setShowLearningLevels(false);

            // Parallel fetch: definition + status
            Promise.all([onGetDefinition(word), onGetWordStatus(word)])
                .then(([fetchedEntry, fetchedStatus]) => {
                    setEntry(fetchedEntry);
                    setStatus(fetchedStatus || 0);

                    // Fire streaming online enrichment in parallel (non-blocking).
                    // Each provider's results are delivered via onBatch as they arrive.
                    if (onOnlineEnrich) {
                        const entryLang = fetchedEntry?.language || 'en';
                        setIsEnriching(true);

                        const mergeOnlineBatch = (batch: UnifiedEntry) => {
                            setEntry((prev) => {
                                if (!prev) return batch;
                                // Merge: keep existing definitions, add new unique ones
                                const existingMeanings = new Set(
                                    prev.definitions.map((d) => d.meaning.toLowerCase().trim())
                                );
                                const newDefs = batch.definitions.filter(
                                    (d) => d.meaning.trim() && !existingMeanings.has(d.meaning.toLowerCase().trim())
                                );
                                const mergedDefs = [
                                    ...prev.definitions,
                                    ...newDefs.map((d, i) => ({ ...d, index: prev.definitions.length + i + 1 })),
                                ];
                                return {
                                    ...prev,
                                    definitions: mergedDefs,
                                    // Fill gaps: audio, phonetic, translations
                                    audio: prev.audio || batch.audio,
                                    phonetic: prev.phonetic || batch.phonetic,
                                    phoneticLabel: prev.phoneticLabel || batch.phoneticLabel,
                                    translations: prev.translations || batch.translations,
                                    linguisticData: [
                                        ...prev.linguisticData,
                                        ...batch.linguisticData.filter(
                                            (item) => !prev.linguisticData.some((l) => l.key === item.key)
                                        ),
                                    ],
                                    badges: [
                                        ...prev.badges,
                                        ...batch.badges.filter(
                                            (b) => !prev.badges.some((pb) => pb.type === b.type && pb.label === b.label)
                                        ),
                                    ],
                                };
                            });
                        };

                        onOnlineEnrich(word, entryLang, mergeOnlineBatch)
                            .catch(() => {})
                            .finally(() => setIsEnriching(false));
                    }
                })
                .catch((err) => {
                    console.error('Popup Error:', err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [word, isOpen, onGetDefinition, onGetWordStatus, onOnlineEnrich]);

    // Close existing TTS/etc when closing
    const handleClose = () => {
        onClose();
    };

    // Close on outside click
    // NOTE: Use CAPTURE phase so that React event ordering doesn't cause the popup to close
    // before the internal onClick handlers run.
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDownOutsideCapture = (e: PointerEvent) => {
            if (!popupRef.current) {
                return;
            }

            // In Shadow DOM, e.target can be retargeted.
            // Use composedPath to detect whether the click was inside our popup/shadow host.
            const path = e.composedPath?.() ?? [];
            const clickedInsideHost = path.some(
                (node) => node instanceof HTMLElement && node.id === 'metheus-popup-host'
            );
            if (clickedInsideHost) {
                return;
            }

            const target = e.target as HTMLElement | null;
            if (!target) {
                return;
            }

            // Ignore clicks inside popup
            if (popupRef.current.contains(target)) {
                return;
            }

            // Ignore clicks in the learning menu portal
            if (target.closest('.learning-menu')) {
                return;
            }

            // CRITICAL FIX: Ignore clicks on other words (.ln-word).
            // If we close the popup here, the 'close' cleanup logic runs immediately
            // and clears the highlight that the Integration script just added to the NEW word.
            // By returning here, we let the Integration script handle the switch (it calls popup.show -> closes old -> opens new).
            if (target.closest('.ln-word') || target.closest('.ln-word-active')) {
                return;
            }

            // Do not auto-close while actions are running
            if (isCapturing) {
                return;
            }

            onClose();
        };

        document.addEventListener('pointerdown', handlePointerDownOutsideCapture, true);
        return () => document.removeEventListener('pointerdown', handlePointerDownOutsideCapture, true);
    }, [isOpen, onClose, isCapturing]);

    const handleCreateCard = async () => {
        if (savedCardId) {
            try {
                await onOpenSavedCard?.(savedCardId);
            } catch (e) {
                console.error('Failed to open saved card editor', e);
            }
            return;
        }

        if (!entry || !entry.definitions || entry.definitions.length === 0) return;
        setIsCapturing(true);

        try {
            const defIndex = selectedDefinitionIndex ?? 0;
            const def = entry.definitions[defIndex].meaning;
            let inferredDefinitionTranslation =
                entry.definitions[defIndex]?.examples?.find((example) => !!example.translation)?.translation ||
                entry.definitions.flatMap((item) => item.examples || []).find((example) => !!example.translation)
                    ?.translation ||
                undefined;
            let inferredWordTranslation = entry.translations?.[0];
            const sourceLanguage = entry.language || contextLanguage || 'en';

            if (locale && locale !== sourceLanguage) {
                if (!inferredWordTranslation) {
                    inferredWordTranslation = (await translateText(entry.word, locale, sourceLanguage)) || undefined;
                }

                if (!inferredDefinitionTranslation && def?.trim()) {
                    inferredDefinitionTranslation = (await translateText(def, locale, sourceLanguage)) || undefined;
                }
            }
            const detailLines = [
                ...entry.linguisticData
                    .filter(
                        (item) => item.value !== undefined && item.value !== null && `${item.value}`.trim().length > 0
                    )
                    .map((item) => `${item.label}: ${item.value}`),
                ...(entry.definitions[defIndex]?.synonyms?.length
                    ? [`Synonyms: ${entry.definitions[defIndex].synonyms.join(', ')}`]
                    : []),
                ...(entry.definitions[defIndex]?.antonyms?.length
                    ? [`Antonyms: ${entry.definitions[defIndex].antonyms.join(', ')}`]
                    : []),
            ];

            const result = await onCreateCard(entry, context || '', def, {
                contextTranslation: contextTranslation || undefined,
                definitionTranslation: inferredDefinitionTranslation,
                wordTranslation: inferredWordTranslation,
                phonetic: entry.phonetic,
                phoneticLabel: entry.phoneticLabel,
                details: detailLines.join('\n'),
            });
            if (result?.cardId) {
                setSavedCardId(result.cardId);
            }
        } catch (e) {
            console.error('Failed to create card', e);
        } finally {
            setIsCapturing(false);
        }
    };

    const handleStatusChange = async (newStatus: number) => {
        setStatus(newStatus);
        await onMarkKnown(word, newStatus);
    };

    // Responsive sizing + positioning (prefer ABOVE subtitles)
    const margin = 6;

    // Initial coordinates typically come from ClientRect
    let { x: viewportLeft, y: viewportAnchorY, anchorRect } = position;

    // Determine the "avoid" rectangle (subtitle overlay) from the real page DOM.
    // This makes the popup robust across platforms and user-controlled subtitle offsets.
    const avoidRect = useMemo(() => {
        const candidates = [
            ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-subtitles-container-bottom')),
            ...Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-subtitles-container-top')),
        ];

        const visibles = candidates
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);

        if (visibles.length === 0) {
            return anchorRect
                ? {
                      top: anchorRect.top,
                      bottom: anchorRect.bottom,
                      left: anchorRect.left,
                      right: anchorRect.right,
                      width: anchorRect.width,
                      height: anchorRect.height,
                  }
                : undefined;
        }

        const top = Math.min(...visibles.map((r) => r.top));
        const bottom = Math.max(...visibles.map((r) => r.bottom));
        const left = Math.min(...visibles.map((r) => r.left));
        const right = Math.max(...visibles.map((r) => r.right));

        return {
            top,
            bottom,
            left,
            right,
            width: right - left,
            height: bottom - top,
        };
    }, [anchorRect]);

    // Base "subtitle box" to avoid covering.
    const subtitleTop = avoidRect ? avoidRect.top : anchorRect ? anchorRect.top : viewportAnchorY;
    const subtitleBottom = avoidRect ? avoidRect.bottom : anchorRect ? anchorRect.bottom : viewportAnchorY + 24;

    // Calculate available space
    const spaceAbove = subtitleTop;
    const spaceBelow = window.innerHeight - subtitleBottom;

    // INTELLIGENT COMPACT MODE DETECTION
    // Use compact mode when there isn't enough vertical space for full popup
    const FULL_HEIGHT = 620;
    const COMPACT_HEIGHT = 380;
    const useCompactMode = spaceAbove < FULL_HEIGHT && spaceBelow < FULL_HEIGHT;

    // Dynamic dimensions based on mode
    const maxHeight = useCompactMode
        ? Math.min(COMPACT_HEIGHT, window.innerHeight - margin * 2)
        : Math.min(FULL_HEIGHT, window.innerHeight - margin * 2);
    const maxWidth = useCompactMode
        ? Math.min(560, window.innerWidth - margin * 2) // Wider in compact mode
        : Math.min(480, window.innerWidth - margin * 2);
    const popupWidth = Math.max(340, maxWidth);

    // Horizontal center logic
    let left = Math.max(margin, Math.min(viewportLeft - popupWidth / 2, window.innerWidth - popupWidth - margin));

    const preferAbove = spaceAbove >= 120 || spaceAbove >= spaceBelow;

    const [measuredHeight, setMeasuredHeight] = useState<number>(420);

    // Measure after render so we can do hard no-overlap clamping.
    useLayoutEffect(() => {
        if (!isOpen) return;
        const el = popupRef.current;
        if (!el) return;

        const measure = () => {
            const h = el.getBoundingClientRect().height;
            if (h > 0 && Math.abs(h - measuredHeight) > 2) {
                setMeasuredHeight(h);
            }
        };

        measure();

        // Re-measure on next frame as content can load async (definition/status).
        const raf = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, word, loading, entry]);

    // Compute a placement that avoids covering the anchor (selected word / subtitle line).
    // Priority:
    // 1) Above (if no overlap with "avoid" band)
    // 2) Below (if no overlap)
    // 3) Left of anchor (if possible)
    // 4) Right of anchor (if possible)
    // 5) Fallback: clamp to viewport (minimize overlap)
    const {
        top,
        transform,
        transformOrigin,
        left: computedLeft,
    } = useMemo(() => {
        const anchor = anchorRect
            ? {
                  top: anchorRect.top,
                  bottom: anchorRect.bottom,
                  left: anchorRect.left,
                  right: anchorRect.right,
                  width: anchorRect.width,
                  height: anchorRect.height,
              }
            : {
                  top: viewportAnchorY,
                  bottom: viewportAnchorY + 24,
                  left: viewportLeft,
                  right: viewportLeft + 1,
                  width: 1,
                  height: 24,
              };

        // Helper functions defined first to avoid TDZ
        const clampTop = (t: number) => Math.max(margin, Math.min(t, window.innerHeight - margin - measuredHeight));
        const clampLeft = (l: number) => Math.max(margin, Math.min(l, window.innerWidth - margin - popupWidth));

        const intersectsVerticalBand = (candidateTop: number) => {
            const candidateBottom = candidateTop + measuredHeight;
            return candidateBottom > subtitleTop && candidateTop < subtitleBottom;
        };

        // Helper to check if a rect intersects the anchor (subtitle text)
        const intersectsAnchor = (candidateLeft: number, candidateTop: number) => {
            const r = {
                left: candidateLeft,
                right: candidateLeft + popupWidth,
                top: candidateTop,
                bottom: candidateTop + measuredHeight,
            };
            return !(r.right < anchor.left || r.left > anchor.right || r.bottom < anchor.top || r.top > anchor.bottom);
        };

        // Vertical candidates
        const aboveFinalTop = Math.max(margin, subtitleTop - margin) - measuredHeight;
        const belowFinalTop = subtitleBottom + margin;

        // Horizontal candidates (Left/Right of anchor)
        // Center vertically relative to anchor
        const sideCenterY = (anchor.top + anchor.bottom) / 2 - measuredHeight / 2;
        const sideTop = clampTop(sideCenterY);

        const leftOfFinalLeft = anchor.left - margin - popupWidth;
        const rightOfFinalLeft = anchor.right + margin;

        // Strategy:
        // 1. If anchor is in middle vertical third, PREFER SIDE positioning.
        const anchorCenterY = (anchor.top + anchor.bottom) / 2;
        const isInMiddleThird = anchorCenterY > window.innerHeight * 0.33 && anchorCenterY < window.innerHeight * 0.66;

        // Side Candidates
        const canFitLeft = leftOfFinalLeft >= margin;
        const canFitRight = rightOfFinalLeft + popupWidth <= window.innerWidth - margin;

        if (isInMiddleThird) {
            // Try Right first (reading direction usually LTR, so popup on right doesn't block Start of line)
            // unless we are close to right edge.
            if (canFitRight) {
                return {
                    top: sideTop,
                    left: rightOfFinalLeft,
                    transform: undefined,
                    transformOrigin: 'center left',
                };
            }
            if (canFitLeft) {
                return {
                    top: sideTop,
                    left: leftOfFinalLeft,
                    transform: undefined,
                    transformOrigin: 'center right',
                };
            }
        }

        // A) Above (Standard preference)
        const aboveTop = clampTop(aboveFinalTop);
        const aboveLeft = clampLeft(viewportLeft - popupWidth / 2);
        // Strict check: Must not intersect the text line
        if (preferAbove && !intersectsVerticalBand(aboveTop) && !intersectsAnchor(aboveLeft, aboveTop)) {
            return {
                top: aboveTop,
                left: aboveLeft,
                transform: undefined,
                transformOrigin: 'bottom left',
            };
        }

        // B) Below
        const belowTop = clampTop(belowFinalTop);
        const belowLeft = clampLeft(viewportLeft - popupWidth / 2);
        if (!intersectsVerticalBand(belowTop) && !intersectsAnchor(belowLeft, belowTop)) {
            return {
                top: belowTop,
                left: belowLeft,
                transform: undefined,
                transformOrigin: 'top left',
            };
        }

        // C) Fallback: If Above was preferred but blocked/overflowed, forcing overlap?
        // Actually, if we are here, standard Above/Below failed intersection checks.
        // Try sides again as fallback even if not in middle third.
        if (canFitRight) {
            return {
                top: sideTop,
                left: rightOfFinalLeft,
                transform: undefined,
                transformOrigin: 'center left',
            };
        }
        if (canFitLeft) {
            return {
                top: sideTop,
                left: leftOfFinalLeft,
                transform: undefined,
                transformOrigin: 'center right',
            };
        }

        // D) Desperate Fallback: Just put it Above or Below (clamped), even if it overlaps.
        return {
            top: preferAbove ? aboveTop : belowTop,
            left: aboveLeft,
            transform: undefined,
            transformOrigin: preferAbove ? 'bottom left' : 'top left',
        };
    }, [
        anchorRect,
        viewportAnchorY,
        viewportLeft,
        measuredHeight,
        margin,
        popupWidth,
        subtitleTop,
        subtitleBottom,
        preferAbove,
    ]);

    // NOTE: Keep the popup in viewport coordinates.
    const style: React.CSSProperties = {
        position: 'fixed',
        top,
        left: computedLeft ?? left,
        width: popupWidth,
        // Enforce a stable popup size. Content scrolls inside (not the whole popup).
        height: maxHeight,
        maxHeight: maxHeight,
        zIndex: 2147483647,
        transform,
        transformOrigin,
        pointerEvents: 'auto',
    };

    const StatusButton = ({ s, label, activeClass, inactiveClass, icon: Icon, isLearning }: any) => {
        const isActive = isLearning ? status >= 1 && status <= 3 : status === s;
        const isDark = themeType === 'dark';

        // Always use compact style (no icons) - per user request
        const alwaysCompact = true;

        return (
            <div className="flex-1 relative group">
                <button
                    onClick={() => {
                        if (isLearning) {
                            setShowLearningLevels(!showLearningLevels);
                            // If we are not already in a learning level (1-3), default to level 1
                            if (status < 1 || status > 3) handleStatusChange(1);
                        } else {
                            setShowLearningLevels(false);
                            handleStatusChange(s);
                            // Do not close popup on Known anymore, per user request for stability
                        }
                    }}
                    className={cn(
                        'w-full flex items-center justify-center rounded-2xl transition-all duration-200',
                        // Always compact: horizontal, smaller, no icon
                        alwaysCompact
                            ? 'flex-row gap-2 py-2 px-3 min-h-[44px]'
                            : 'flex-col gap-1 py-2 px-2 min-h-[60px]',
                        isActive ? activeClass : inactiveClass
                    )}
                >
                    {/* No icons - always compact */}
                    {isActive && <Check className="w-5 h-5" />}
                    <span
                        className={cn(
                            'font-extrabold uppercase tracking-wider',
                            alwaysCompact ? 'text-[14px]' : 'text-[16px]'
                        )}
                    >
                        {label}
                    </span>
                </button>

                {/* Learning Levels Menu */}
                {isLearning && showLearningLevels && (
                    <div
                        className={cn(
                            'learning-menu absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-xl border p-2 flex flex-col gap-1 z-50',
                            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                        )}
                    >
                        {[1, 2, 3].map((level) => (
                            <button
                                key={level}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(level);
                                    // Don't close menu immediately to allow correction
                                }}
                                className={cn(
                                    'flex items-center justify-between px-3 py-2 rounded-lg text-[0.9em] font-medium transition-colors',
                                    status === level
                                        ? isDark
                                            ? 'bg-[#FCEE0A]/20 text-[#FCEE0A]'
                                            : 'bg-[#FCEE0A]/20 text-zinc-900'
                                        : isDark
                                          ? 'hover:bg-zinc-800 text-zinc-300'
                                          : 'hover:bg-zinc-100 text-zinc-700'
                                )}
                            >
                                <span>Level {level}</span>
                                {status === level && <Check className="w-[1em] h-[1em]" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                ref={popupRef}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                // IMPORTANT:
                // This component relies heavily on Tailwind's `dark:` variants.
                // In Shadow DOM, those variants only work if some ancestor has the `dark` class.
                // The dictionary popup is mounted in its own shadow root, so it does NOT inherit
                // the page/extension `dark` class automatically.
                //
                // Force Tailwind dark-mode activation to follow the actual MUI theme mode.
                className={cn(
                    'shadow-2xl border flex flex-col overflow-hidden rounded-2xl font-sans text-left text-[20px]',
                    // LIGHT: solid surfaces (no alpha) for consistency on top of video pages.
                    // DARK: keep glassmorphism (alpha + blur) handled by inner containers.
                    themeType === 'dark'
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-white border-zinc-200 text-zinc-900',
                    // Toggle Tailwind dark variants based on the extension settings.
                    themeType === 'dark' ? 'dark' : ''
                )}
                style={style}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-3 right-3 z-10 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 dark:text-zinc-400 hover:text-red-500"
                >
                    <X className="w-8 h-8" />
                </button>

                {loading && (
                    <div className="p-12 flex flex-col items-center justify-center h-full gap-4 min-h-[300px]">
                        <Loader2 className="w-[2.5em] h-[2.5em] animate-spin text-[#00F0FF]" />
                        <p className="text-[1em] text-zinc-500">{t('dictionary.popup.searching')}</p>
                    </div>
                )}

                {/* Content: Header stays fixed, only body scrolls */}
                <div
                    className={cn(
                        'flex-1 min-h-0 flex flex-col',
                        // Light: solid background, no blur (prevents picking up dark video behind)
                        themeType === 'dark' ? 'bg-zinc-950/95 backdrop-blur-3xl' : 'bg-white',
                        // Light-mode readability: normalize common Tailwind color tokens used across children.
                        // This is intentionally heavy-handed to avoid chasing individual classes.
                        themeType === 'dark'
                            ? ''
                            : [
                                  // text
                                  '[&_.text-white]:text-zinc-900',
                                  '[&_.text-zinc-100]:text-zinc-900',
                                  '[&_.text-zinc-200]:text-zinc-800',
                                  '[&_.text-zinc-300]:text-zinc-800',
                                  '[&_.text-zinc-400]:text-zinc-700',
                                  '[&_.text-zinc-500]:text-zinc-700',
                                  '[&_.text-zinc-600]:text-zinc-800',
                                  // borders
                                  '[&_.border-zinc-700]:border-zinc-300',
                                  '[&_.border-zinc-800]:border-zinc-300',
                                  '[&_.border-zinc-900]:border-zinc-300',
                                  // backgrounds (if any dark backgrounds leak into light)
                                  '[&_.bg-zinc-800]:bg-zinc-100',
                                  '[&_.bg-zinc-900]:bg-zinc-100',
                                  '[&_.bg-zinc-950]:bg-white',
                              ].join(' ')
                    )}
                >
                    {!loading && entry && (
                        <>
                            <DictionaryHeader
                                word={entry.word || requestedWord}
                                phonetic={entry.phonetic}
                                badges={entry.badges}
                                onSpeak={() =>
                                    entry.audio ? playAudioUrl(entry.audio) : speak(entry.word || requestedWord)
                                }
                                isSpeaking={isSpeakingWord}
                                translation={contextTranslation ?? null}
                                themeType={themeType}
                            />

                            {/* Tabs */}
                            <div
                                className={cn(
                                    'flex items-center px-8 border-b flex-shrink-0',
                                    themeType === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                )}
                            >
                                {['definitions', 'examples', 'details'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab as any)}
                                        className={cn(
                                            'flex-1 py-3 text-[16px] font-bold uppercase tracking-wider relative transition-colors',
                                            activeTab === tab
                                                ? themeType === 'dark'
                                                    ? 'text-[#00F0FF]'
                                                    : 'text-[#00C6D9]'
                                                : themeType === 'dark'
                                                  ? 'text-zinc-500 hover:text-zinc-200'
                                                  : 'text-zinc-700 hover:text-zinc-900'
                                        )}
                                    >
                                        {t(`dictionary.popup.tabs.${tab}`)}
                                        {activeTab === tab && (
                                            <div
                                                className={cn(
                                                    'absolute bottom-0 left-0 right-0 h-0.5',
                                                    themeType === 'dark' ? 'bg-[#00F0FF]' : 'bg-[#00C6D9]'
                                                )}
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Online enrichment indicator */}
                            {isEnriching && (
                                <div className="flex-shrink-0 px-8 py-1">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>{t('dictionary.popup.enriching') || 'Fetching more...'}</span>
                                    </div>
                                </div>
                            )}

                            {/* Body - Tab Content (scrollable; header+tabs remain fixed) */}
                            <div
                                className={cn(
                                    'flex-1 min-h-0 overflow-y-auto p-6 space-y-6 text-[20px]',
                                    // Light-mode readability: enforce stronger defaults for text colors inside content.
                                    // This avoids hunting dozens of `text-zinc-400/500` occurrences.
                                    themeType === 'dark'
                                        ? ''
                                        : 'text-zinc-900 [&_.text-zinc-400]:text-zinc-700 [&_.text-zinc-500]:text-zinc-700 [&_.text-zinc-600]:text-zinc-800'
                                )}
                            >
                                {activeTab === 'definitions' && (
                                    <DictionaryMeaning
                                        definitions={entry.definitions || []}
                                        selectedIndex={selectedDefinitionIndex}
                                        onSelectDefinition={setSelectedDefinitionIndex}
                                        themeType={themeType}
                                    />
                                )}
                                {activeTab === 'examples' && (
                                    <DictionaryExamples
                                        definitions={entry.definitions || []}
                                        onSpeakExample={speak}
                                        sourceLanguage={entry.language || 'en'}
                                        translationTargetLanguage={locale}
                                        themeType={themeType}
                                    />
                                )}
                                {activeTab === 'details' && (
                                    <DictionaryMetadata data={entry.linguisticData || []} themeType={themeType} />
                                )}
                            </div>
                        </>
                    )}

                    {/* Not Found */}
                    {!loading && !entry && (
                        <div className="p-12 text-center space-y-4 min-h-[300px]">
                            <div className="w-20 h-20 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                                <Search className="w-[2.5em] h-[2.5em] text-zinc-300" />
                            </div>
                            <p className="text-[1.125em] font-semibold">{t('dictionary.popup.no_def_title')}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className={cn(
                        'p-4 border-t flex gap-3',
                        // Light: solid footer, no blur
                        themeType === 'dark'
                            ? 'bg-zinc-950/80 border-zinc-800 backdrop-blur-md'
                            : 'bg-white border-zinc-200'
                    )}
                >
                    <StatusButton
                        s={STATUS.NEW}
                        label="New"
                        activeClass="bg-[#00F0FF] text-zinc-950 shadow-lg ring-2 ring-[#00F0FF]/35"
                        inactiveClass={
                            themeType === 'dark'
                                ? 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                : 'text-zinc-700 hover:bg-zinc-100'
                        }
                        icon={Sparkles}
                    />
                    <StatusButton
                        s={STATUS.LEARNING_1}
                        label="Learning"
                        isLearning={true}
                        activeClass="bg-[#FCEE0A] text-zinc-950 shadow-lg ring-2 ring-[#FCEE0A]/35"
                        inactiveClass={
                            themeType === 'dark'
                                ? 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                : 'text-zinc-700 hover:bg-zinc-100'
                        }
                        icon={BookOpen}
                    />
                    <StatusButton
                        s={STATUS.KNOWN}
                        label="Known"
                        activeClass="bg-[#39FF14] text-zinc-950 shadow-lg ring-2 ring-[#39FF14]/35"
                        inactiveClass={
                            themeType === 'dark'
                                ? 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                : 'text-zinc-700 hover:bg-zinc-100'
                        }
                        icon={Check}
                    />
                    <button
                        onClick={handleCreateCard}
                        className={cn(
                            'flex-1 flex items-center justify-center rounded-2xl transition-all',
                            // Always compact: horizontal, no icon
                            'flex-row gap-2 py-2 px-3 min-h-[44px]',
                            savedCardId
                                ? themeType === 'dark'
                                    ? 'bg-[#39FF14]/20 text-[#39FF14]'
                                    : 'bg-[#39FF14]/20 text-zinc-900'
                                : themeType === 'dark'
                                  ? 'text-zinc-500 hover:bg-zinc-900'
                                  : 'text-zinc-700 hover:bg-zinc-100'
                        )}
                    >
                        {/* No icon - always compact */}
                        {savedCardId && <Check className="w-5 h-5" />}
                        <span className={cn('font-extrabold uppercase tracking-wider', 'text-[14px]')}>
                            {savedCardId ? 'See' : 'Save'}
                        </span>
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
