import React from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '../../utils';

interface DictionaryHeaderProps {
    word: string;
    phonetic?: string;
    badges: {
        type: 'pos' | 'level' | 'frequency' | 'other';
        label: string;
        color?: string;
    }[];
    onSpeak: () => void;
    isSpeaking: boolean;
    translation?: string | null;
    themeType?: 'dark' | 'light';
}

export const DictionaryHeader: React.FC<DictionaryHeaderProps> = ({
    word,
    phonetic,
    badges,
    onSpeak,
    isSpeaking,
    translation,
    themeType = 'dark',
}) => {
    const isDark = themeType === 'dark';

    return (
        <div
            className={cn(
                'p-4 sm:p-5 border-b bg-gradient-to-br',
                isDark
                    ? 'border-zinc-800/50 from-zinc-950 to-zinc-900 text-zinc-100'
                    : 'border-zinc-200 from-white to-zinc-50 text-zinc-900'
            )}
        >
            <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Word, Audio & Badges */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h2
                            className={cn(
                                'text-[32px] sm:text-[40px] font-black tracking-tight truncate',
                                isDark ? 'text-[#00F0FF]' : 'text-[#00C6D9]'
                            )}
                        >
                            {word}
                        </h2>

                        <button
                            onClick={onSpeak}
                            className={cn(
                                'flex-shrink-0 flex items-center justify-center p-2.5 sm:p-2 rounded-full transition-all duration-300 touch-manipulation min-w-[48px] min-h-[48px]',
                                isSpeaking
                                    ? 'bg-[#00F0FF] text-zinc-950 shadow-md scale-110'
                                    : isDark
                                      ? 'bg-[#00F0FF]/15 text-[#00F0FF] hover:bg-[#00F0FF]/25'
                                      : 'bg-[#00F0FF]/10 text-[#00C6D9] hover:bg-[#00F0FF]/20'
                            )}
                        >
                            {isSpeaking ? (
                                <span className="animate-pulse">
                                    <Volume2 className="w-10 h-10 fill-current" />
                                </span>
                            ) : (
                                <Volume2 className="w-10 h-10" />
                            )}
                        </button>

                        {/* Badges: CEFR & Frequency ONLY (moved next to audio) */}
                        <div className="flex flex-wrap items-center gap-2 ml-1">
                            {badges
                                .filter((b) => b.type === 'level' || b.type === 'frequency')
                                .map((badge, i) => (
                                    <span
                                        key={`top-${i}`}
                                        className={cn(
                                            'px-1.5 py-0.5 rounded text-[14px] font-bold uppercase tracking-wider',
                                            badge.type === 'level' &&
                                                (isDark
                                                    ? 'bg-indigo-900/30 text-indigo-400'
                                                    : 'bg-indigo-100 text-indigo-600'),
                                            badge.type === 'frequency' &&
                                                (isDark
                                                    ? 'bg-[#39FF14]/20 text-[#39FF14]'
                                                    : 'bg-[#39FF14]/20 text-zinc-900')
                                        )}
                                    >
                                        {badge.label}
                                    </span>
                                ))}
                        </div>
                    </div>

                    {/* Translation - single line with ellipsis */}
                    {translation && (
                        <div
                            className={cn(
                                'text-[15px] sm:text-[16px] font-semibold leading-snug mt-1 whitespace-nowrap overflow-hidden text-ellipsis',
                                isDark ? 'text-[#39FF14]' : 'text-[#1E7A0E]'
                            )}
                            title={translation}
                        >
                            {translation}
                        </div>
                    )}

                    {/* Bottom Row: Phonetic & Part of Speech (POS) - single line with ellipsis */}
                    <div className="flex items-center gap-2 mt-1 overflow-hidden">
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                            {phonetic && (
                                <span
                                    className={cn(
                                        'font-mono text-[18px] px-2 py-0.5 rounded ml-0.5',
                                        isDark ? 'text-zinc-400 bg-zinc-800/50' : 'text-zinc-700 bg-zinc-100'
                                    )}
                                >
                                    /{phonetic}/
                                </span>
                            )}

                            {badges
                                .filter((b) => b.type === 'pos' || b.type === 'other')
                                .map((badge, i) => (
                                    <span
                                        key={`bottom-${i}`}
                                        className={cn(
                                            'px-1.5 py-0.5 rounded text-[14px] font-bold uppercase tracking-wider',
                                            isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-600'
                                        )}
                                    >
                                        {badge.label}
                                    </span>
                                ))}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
