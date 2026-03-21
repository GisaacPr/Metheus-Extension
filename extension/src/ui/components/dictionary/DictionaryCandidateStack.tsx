import React, { useMemo } from 'react';
import { cn } from '../../utils';

interface DictionaryCandidateStackProps {
    candidates: string[];
    themeType?: 'dark' | 'light';
    density?: 'comfortable' | 'compact';
}

const sanitizeText = (value?: string | null) =>
    (value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const DictionaryCandidateStack: React.FC<DictionaryCandidateStackProps> = ({
    candidates,
    themeType = 'dark',
    density = 'comfortable',
}) => {
    const visibleCandidates = useMemo(
        () => Array.from(new Set((candidates || []).map((candidate) => sanitizeText(candidate)).filter(Boolean))).slice(0, 4),
        [candidates]
    );

    if (visibleCandidates.length <= 1) {
        return null;
    }

    const isDark = themeType === 'dark';
    const isCompact = density === 'compact';

    return (
        <div className="px-3 sm:px-4 pb-2">
            <div
                className={cn(
                    'overflow-hidden rounded-2xl border',
                    isDark ? 'border-zinc-800 bg-black/45' : 'border-zinc-200 bg-zinc-50'
                )}
            >
                <div className={cn('divide-y', isDark ? 'divide-zinc-800' : 'divide-zinc-200')}>
                    {visibleCandidates.map((candidate, index) => {
                        const isBestCandidate = index === 0;
                        return (
                            <div
                                key={`${candidate}-${index}`}
                                className={cn(
                                    'px-3 py-2',
                                    isBestCandidate
                                        ? isDark
                                            ? 'border-l-2 border-[#00F0FF] bg-[#00F0FF]/10'
                                            : 'border-l-2 border-[#007A8A] bg-[#00F0FF]/8'
                                        : ''
                                )}
                            >
                                <p
                                    className={cn(
                                        'text-center leading-snug',
                                        isBestCandidate
                                            ? isCompact
                                                ? isDark
                                                    ? 'text-[15px] font-bold text-[#E8FDFF]'
                                                    : 'text-[15px] font-bold text-[#007A8A]'
                                                : isDark
                                                  ? 'text-[16px] font-extrabold text-[#E8FDFF]'
                                                  : 'text-[16px] font-extrabold text-[#007A8A]'
                                            : isCompact
                                              ? isDark
                                                  ? 'text-[12px] font-medium text-zinc-300'
                                                  : 'text-[12px] font-medium text-zinc-600'
                                              : isDark
                                                ? 'text-[13px] font-medium text-zinc-300'
                                                : 'text-[13px] font-medium text-zinc-600'
                                    )}
                                >
                                    {candidate}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
