import React, { useEffect, useMemo, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { UnifiedEntry } from '../../dictionary-adapter';
import { cn } from '../../utils';
import { useGoogleTranslation } from '../../hooks';

interface DictionaryExamplesProps {
    definitions?: UnifiedEntry['definitions'];
    onSpeakExample?: (text: string) => void;
    speakingExample?: string | null;
    sourceLanguage?: string;
    translationTargetLanguage?: string;
    themeType?: 'dark' | 'light';
}

export const DictionaryExamples: React.FC<DictionaryExamplesProps> = ({
    definitions,
    onSpeakExample,
    speakingExample,
    sourceLanguage = 'en',
    translationTargetLanguage,
    themeType = 'dark',
}) => {
    const isDark = themeType === 'dark';
    const { translateText } = useGoogleTranslation();
    const [translatedExamples, setTranslatedExamples] = useState<Record<string, string>>({});

    const allExamples = useMemo(() => {
        const list: Array<{ defIndex: number; example: UnifiedEntry['definitions'][0]['examples'][0] }> = [];
        definitions?.forEach((def) => {
            if (def.examples && def.examples.length > 0) {
                def.examples.slice(0, 3).forEach((ex) => {
                    list.push({ defIndex: def.index, example: ex });
                });
            }
        });
        return list;
    }, [definitions]);

    useEffect(() => {
        const target = translationTargetLanguage;
        if (!target || !sourceLanguage || target === sourceLanguage || allExamples.length === 0) {
            setTranslatedExamples({});
            return;
        }

        let cancelled = false;

        const run = async () => {
            const pairs = await Promise.all(
                allExamples.map(async ({ example }) => {
                    const sentence = example.sentence;
                    const translated = await translateText(sentence, target, sourceLanguage);
                    return translated ? ([sentence, translated] as const) : null;
                })
            );

            if (cancelled) {
                return;
            }

            const nextMap: Record<string, string> = {};
            for (const pair of pairs) {
                if (pair) {
                    nextMap[pair[0]] = pair[1];
                }
            }
            setTranslatedExamples(nextMap);
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [allExamples, sourceLanguage, translationTargetLanguage, translateText]);

    if (!definitions || definitions.length === 0 || allExamples.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="space-y-2.5">
                {allExamples.map(({ defIndex, example }, idx) => {
                    const exampleText = example.sentence;
                    const isSpeaking = speakingExample === exampleText;
                    const grammar = example.grammarNote;

                    return (
                        <div
                            key={`${defIndex}-${idx}`}
                            className={cn(
                                'group pl-3 border-l-2 transition-colors',
                                isDark
                                    ? 'border-[#00F0FF]/35 hover:border-[#00F0FF]'
                                    : 'border-[#00F0FF]/25 hover:border-[#00C6D9]'
                            )}
                        >
                            {/* Example Sentence + TTS */}
                            <div className="flex items-start gap-2">
                                <p
                                    className={cn(
                                        'flex-1 text-[18px] italic leading-relaxed',
                                        isDark ? 'text-zinc-300' : 'text-zinc-700'
                                    )}
                                >
                                    &quot;{exampleText}&quot;
                                </p>

                                {/* Mini TTS Button */}
                                {onSpeakExample && (
                                    <button
                                        onClick={() => onSpeakExample(exampleText)}
                                        className={cn(
                                            'flex-shrink-0 flex items-center justify-center p-2.5 rounded-full transition-all scale-100 hover:scale-110 active:scale-95',
                                            isSpeaking
                                                ? 'bg-[#00F0FF] text-zinc-950 shadow-md'
                                                : isDark
                                                  ? 'bg-[#00F0FF]/15 text-[#00F0FF] hover:bg-[#00F0FF]/25'
                                                  : 'bg-[#00F0FF]/10 text-[#00C6D9] hover:bg-[#00F0FF]/20'
                                        )}
                                        title="Listen to example"
                                    >
                                        {isSpeaking ? (
                                            <span className="animate-pulse">
                                                <Volume2 className="w-7 h-7 fill-current" />
                                            </span>
                                        ) : (
                                            <Volume2 className="w-7 h-7" />
                                        )}
                                    </button>
                                )}
                            </div>

                            {translatedExamples[exampleText] && (
                                <p
                                    className={cn(
                                        'text-[16px] mt-1 pl-1 italic border-l-2 border-[#00F0FF]/35',
                                        isDark ? 'text-zinc-400' : 'text-zinc-600'
                                    )}
                                >
                                    {translatedExamples[exampleText]}
                                </p>
                            )}

                            {/* Grammatical Note */}
                            {grammar && (
                                <p className={cn('text-[16px] mt-1 pl-1', isDark ? 'text-zinc-400' : 'text-zinc-600')}>
                                    📚 {grammar}
                                </p>
                            )}

                            {/* Collocations */}
                            {example.collocations && example.collocations.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                    <span
                                        className={cn(
                                            'text-[14px] font-medium',
                                            isDark ? 'text-zinc-500' : 'text-zinc-500'
                                        )}
                                    >
                                        Collocations:
                                    </span>
                                    {example.collocations.map((coll, i) => (
                                        <span
                                            key={i}
                                            className={cn(
                                                'text-[14px] px-1.5 py-0.5 rounded',
                                                isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-600'
                                            )}
                                        >
                                            {coll}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
