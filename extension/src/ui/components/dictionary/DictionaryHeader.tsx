import React from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '../../utils';

interface DictionaryHeaderProps {
    word: string;
    phonetic?: string;
    status?: number;
    badges: {
        type: 'pos' | 'level' | 'frequency' | 'other';
        label: string;
        color?: string;
    }[];
    onSpeak: () => void;
    isSpeaking: boolean;
    translation?: string | null;
    anchoredTranslation?: string | null;
    translationCandidates?: string[];
    themeType?: 'dark' | 'light';
    density?: 'comfortable' | 'compact';
    surfaceKind?: 'video' | 'text';
}

export const DictionaryHeader: React.FC<DictionaryHeaderProps> = ({
    word,
    phonetic,
    status = 0,
    badges,
    onSpeak,
    isSpeaking,
    translation,
    anchoredTranslation,
    translationCandidates = [],
    themeType = 'dark',
    density = 'comfortable',
    surfaceKind = 'video',
}) => {
    const isDark = themeType === 'dark';
    const isCompact = density === 'compact';
    const isTextSurface = surfaceKind === 'text';
    const sanitizeDisplayText = (value: string) => value.replace(/\[\[\[|\]\]\]/g, '').trim();
    const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const buildNormalizedIndexMap = (value: string) => {
        let normalized = '';
        const indexMap: number[] = [];

        Array.from(value).forEach((char, index) => {
            const normalizedChar = stripDiacritics(char).toLowerCase();
            normalized += normalizedChar;
            for (let i = 0; i < normalizedChar.length; i += 1) {
                indexMap.push(index);
            }
        });

        return { normalized, indexMap };
    };
    const renderHighlightedContext = (
        fullText: string,
        candidates: string[] = []
    ) => {
        const rawText = String(fullText || '').trim();
        const markerMatch = rawText.match(/\[\[\[\s*(.*?)\s*\]\]\]/);
        if (markerMatch && markerMatch.index !== undefined) {
            const before = sanitizeDisplayText(rawText.slice(0, markerMatch.index));
            const highlighted = sanitizeDisplayText(markerMatch[1] || '');
            const after = sanitizeDisplayText(rawText.slice(markerMatch.index + markerMatch[0].length));

            return (
                <>
                    {before}
                    <span className={isDark ? 'font-bold text-[#00F0FF]' : 'font-bold text-[#007A8A]'}>
                        {highlighted}
                    </span>
                    {after}
                </>
            );
        }

        const text = sanitizeDisplayText(fullText.trim());
        const stopwords = new Set([
            'de',
            'del',
            'la',
            'las',
            'el',
            'los',
            'un',
            'una',
            'y',
            'o',
            'que',
            'con',
            'por',
            'para',
            'the',
            'and',
            'for',
            'with',
            'from',
            'that',
            'this',
            'those',
            'these',
        ]);
        const candidatePool: string[] = [];
        const seenCandidates = new Set<string>();
        for (const rawValue of candidates) {
            const parts = String(rawValue || '')
                .split(/[;,/]/)
                .map((part) => sanitizeDisplayText(part.trim()))
                .filter(Boolean);

            for (const cleaned of parts) {
                const normalizedCleaned = stripDiacritics(cleaned).toLowerCase();
                if (!seenCandidates.has(normalizedCleaned)) {
                    seenCandidates.add(normalizedCleaned);
                    candidatePool.push(cleaned);
                }

                const tokens = cleaned
                    .split(/\s+/)
                    .map((token) => token.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, '').trim())
                    .filter((token) => token.length >= 4 && !stopwords.has(token.toLowerCase()))
                    .sort((a, b) => b.length - a.length);

                for (const token of tokens) {
                    const normalizedToken = stripDiacritics(token).toLowerCase();
                    if (seenCandidates.has(normalizedToken)) {
                        continue;
                    }
                    seenCandidates.add(normalizedToken);
                    candidatePool.push(token);
                }
            }
        }

        if (!text || candidatePool.length === 0) {
            return <>{sanitizeDisplayText(text)}</>;
        }

        const { normalized: normalizedText, indexMap } = buildNormalizedIndexMap(text);
        let matchStart = -1;
        let matchEnd = -1;

        for (const candidate of candidatePool) {
            const normalizedCandidate = stripDiacritics(candidate).toLowerCase();
            if (!normalizedCandidate) continue;
            const normalizedIndex = normalizedText.indexOf(normalizedCandidate);
            if (normalizedIndex === -1) continue;

            matchStart = indexMap[normalizedIndex] ?? -1;
            const normalizedEndIndex = normalizedIndex + normalizedCandidate.length - 1;
            const originalEndIndex = indexMap[normalizedEndIndex] ?? -1;
            if (matchStart !== -1 && originalEndIndex !== -1) {
                matchEnd = originalEndIndex + 1;
                break;
            }
        }

        if (matchStart === -1 || matchEnd === -1) {
            return <>{sanitizeDisplayText(text)}</>;
        }

        return (
            <>
                {text.slice(0, matchStart)}
                <span className={isDark ? 'font-bold text-[#00F0FF]' : 'font-bold text-[#007A8A]'}>
                    {sanitizeDisplayText(text.slice(matchStart, matchEnd))}
                </span>
                {text.slice(matchEnd)}
            </>
        );
    };
    const headwordColorClass =
        status >= 4
            ? isDark
                ? 'text-[#39FF14]'
                : 'text-[#39FF14] [-webkit-text-stroke:0.35px_rgba(24,24,27,0.26)] [text-shadow:0_1px_0_rgba(24,24,27,0.55),0_0_22px_rgba(57,255,20,0.42)]'
            : status >= 1
              ? isDark
                  ? 'text-[#FCEE0A]'
                  : 'text-[#FCEE0A] [-webkit-text-stroke:0.35px_rgba(24,24,27,0.28)] [text-shadow:0_1px_0_rgba(24,24,27,0.62),0_0_22px_rgba(252,238,10,0.42)]'
              : isDark
                ? 'text-[#00F0FF]'
                : 'text-[#007A8A] [text-shadow:0_0_12px_rgba(0,240,255,0.12)]';

    return (
        <div
            className={cn(
                'border-b bg-gradient-to-br',
                isCompact ? 'p-3.5' : 'p-4 sm:p-5',
                isDark
                    ? 'border-zinc-800/50 from-zinc-950 to-zinc-900 text-zinc-100'
                    : 'border-zinc-200 from-white to-zinc-50 text-zinc-900'
            )}
        >
            <div className={cn('flex items-start justify-between', isCompact ? 'gap-3' : 'gap-3 sm:gap-4')}>
                <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Word & Audio */}
                    <div className={cn('flex flex-wrap items-center', isCompact ? 'gap-2' : 'gap-2 sm:gap-3')}>
                        <h2
                            className={cn(
                                isCompact ? 'text-[24px] font-black tracking-tight truncate' : 'text-[32px] sm:text-[40px] font-black tracking-tight truncate',
                                headwordColorClass
                            )}
                        >
                            {word}
                        </h2>

                        <button
                            onClick={onSpeak}
                            className={cn(
                                'flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 touch-manipulation',
                                isTextSurface
                                    ? isCompact
                                        ? 'p-2 min-w-[38px] min-h-[38px]'
                                        : 'p-2 min-w-[38px] min-h-[38px]'
                                    : isCompact
                                      ? 'p-3.5 min-w-[56px] min-h-[56px]'
                                      : 'p-3.5 min-w-[56px] min-h-[56px]',
                                isSpeaking
                                    ? 'bg-[#00F0FF] text-zinc-950 shadow-md scale-110'
                                    : isDark
                                      ? 'bg-[#00F0FF]/15 text-[#00F0FF] hover:bg-[#00F0FF]/25'
                                      : 'bg-[#00F0FF]/10 text-[#00C6D9] hover:bg-[#00F0FF]/20'
                            )}
                        >
                            {isSpeaking ? (
                                <span className="animate-pulse">
                                    <Volume2
                                        className={cn(
                                            'fill-current',
                                            isTextSurface ? 'w-5 h-5' : 'w-8 h-8'
                                        )}
                                    />
                                </span>
                            ) : (
                                <Volume2 className={isTextSurface ? 'w-5 h-5' : 'w-8 h-8'} />
                            )}
                        </button>
                    </div>

                    {/* Translation - single line with ellipsis */}
                    {(anchoredTranslation || translation) && (
                        <div
                            className={cn(
                                'font-semibold leading-snug mt-1 whitespace-normal break-words',
                                isCompact ? 'text-[13px]' : 'text-[15px] sm:text-[16px]',
                                isDark ? 'text-white' : 'text-zinc-900'
                            )}
                            title={sanitizeDisplayText(anchoredTranslation || translation || '')}
                        >
                            {renderHighlightedContext(anchoredTranslation || translation || '', translationCandidates)}
                        </div>
                    )}

                    {/* Phonetic & Badges */}
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap">
                        {phonetic && (
                            <span
                                className={cn(
                                    'font-mono font-semibold ml-0.5 shrink-0 whitespace-nowrap leading-none',
                                    isCompact
                                        ? 'text-[10px] px-2 py-1 rounded-lg'
                                        : 'text-[11px] px-3 py-1.5 rounded-xl',
                                    isDark ? 'text-zinc-400 bg-zinc-800/50' : 'text-zinc-700 bg-zinc-100'
                                )}
                            >
                                /{phonetic}/
                            </span>
                        )}

                        <div className="flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap">
                            {badges.map((badge, i) => {
                                const badgeClass =
                                    badge.type === 'pos'
                                        ? isDark
                                            ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30'
                                            : 'bg-[#007A8A]/10 text-[#007A8A] border-[#007A8A]/25'
                                        : badge.type === 'level'
                                          ? isDark
                                              ? 'bg-[#FCEE0A]/20 text-[#FCEE0A] border-[#FCEE0A]/30'
                                              : 'bg-[#FCEE0A] text-zinc-950 border-transparent ring-2 ring-[#FCEE0A]/45 shadow-[0_0_18px_rgba(252,238,10,0.24)]'
                                          : badge.type === 'frequency'
                                            ? isDark
                                                ? 'bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/35'
                                                : 'bg-[#39FF14] text-zinc-950 border-transparent ring-2 ring-[#39FF14]/42 shadow-[0_0_18px_rgba(57,255,20,0.22)]'
                                            : isDark
                                              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                              : 'bg-zinc-100 text-zinc-600 border-zinc-200';

                                return (
                                    <span
                                        key={`${badge.type}-${i}`}
                                        className={cn(
                                            'font-bold uppercase tracking-[0.08em] border shrink-0 whitespace-nowrap',
                                            isCompact
                                                ? 'px-2 py-1 rounded-lg text-[10px]'
                                                : 'px-3 py-1.5 rounded-xl text-[11px]',
                                            badgeClass
                                        )}
                                        title={badge.label}
                                    >
                                        {badge.label}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
