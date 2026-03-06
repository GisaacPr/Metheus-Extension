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
    themeType?: 'dark' | 'light';
}

export const DictionaryHeader: React.FC<DictionaryHeaderProps> = ({
    word,
    phonetic,
    status = 0,
    badges,
    onSpeak,
    isSpeaking,
    translation,
    themeType = 'dark',
}) => {
    const isDark = themeType === 'dark';
    const headwordColorClass =
        status >= 4
            ? isDark
                ? 'text-[#39FF14]'
                : 'text-[#19A800] [text-shadow:0_0_16px_rgba(57,255,20,0.24)]'
            : status >= 1
              ? isDark
                  ? 'text-[#FCEE0A]'
                  : 'text-[#C99400] [text-shadow:0_0_16px_rgba(252,238,10,0.22)]'
              : isDark
                ? 'text-[#00F0FF]'
                : 'text-[#007A8A] [text-shadow:0_0_12px_rgba(0,240,255,0.12)]';

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
                    {/* Word & Audio */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h2
                            className={cn(
                                'text-[32px] sm:text-[40px] font-black tracking-tight truncate',
                                headwordColorClass
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
                    </div>

                    {/* Translation - single line with ellipsis */}
                    {translation && (
                        <div
                            className={cn(
                                'text-[15px] sm:text-[16px] font-semibold leading-snug mt-1 whitespace-nowrap overflow-hidden text-ellipsis',
                                isDark ? 'text-[#00F0FF]' : 'text-[#00C6D9]'
                            )}
                            title={translation}
                        >
                            {translation}
                        </div>
                    )}

                    {/* Phonetic & Badges */}
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap">
                        {phonetic && (
                            <span
                                className={cn(
                                    'font-mono text-[15px] sm:text-base px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl ml-0.5 shrink-0 max-w-[50%] truncate',
                                    isDark ? 'text-zinc-400 bg-zinc-800/50' : 'text-zinc-700 bg-zinc-100'
                                )}
                            >
                                /{phonetic}/
                            </span>
                        )}

                        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                            {badges.map((badge, i) => {
                                const badgeClass =
                                    badge.type === 'pos'
                                        ? isDark
                                            ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30'
                                            : 'bg-[#007A8A]/10 text-[#007A8A] border-[#007A8A]/25'
                                        : badge.type === 'level'
                                          ? isDark
                                              ? 'bg-[#FCEE0A]/20 text-[#FCEE0A] border-[#FCEE0A]/30'
                                              : 'bg-[#FCEE0A]/16 text-[#C99400] border-[#D8AC00]/35'
                                          : badge.type === 'frequency'
                                            ? isDark
                                                ? 'bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/35'
                                                : 'bg-[#39FF14]/12 text-[#19A800] border-[#19A800]/28'
                                            : isDark
                                              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                              : 'bg-zinc-100 text-zinc-600 border-zinc-200';

                                return (
                                    <span
                                        key={`${badge.type}-${i}`}
                                        className={cn(
                                            'px-3.5 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-bold uppercase tracking-[0.08em] border shrink-0 max-w-[11rem] truncate',
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
