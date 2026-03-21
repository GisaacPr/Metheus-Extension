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
    density?: 'comfortable' | 'compact';
    surfaceKind?: 'video' | 'text';
}

export const DictionaryExamples: React.FC<DictionaryExamplesProps> = ({
    definitions,
    onSpeakExample,
    speakingExample,
    sourceLanguage = 'en',
    translationTargetLanguage,
    themeType = 'dark',
    density = 'comfortable',
    surfaceKind = 'video',
}) => {
    const isDark = themeType === 'dark';
    const isCompact = density === 'compact';
    const isTextSurface = surfaceKind === 'text';
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
                    const translated = await translateText(sentence, target, sourceLanguage, {
                        cacheKind: 'phrase',
                        sourceScope: 'private-local',
                    });
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
        <div className={cn(isCompact ? 'space-y-1.5' : 'space-y-2')}>
            <div className={cn(isCompact ? 'space-y-2' : 'space-y-2.5')}>
                {allExamples.map(({ defIndex, example }, idx) => {
                    const exampleText = example.sentence;
                    const isSpeaking = speakingExample === exampleText;
                    const grammar = example.grammarNote;
                    const exampleTranslation = example.translation || translatedExamples[exampleText];

                    return (
                        <div
                            key={`${defIndex}-${idx}`}
                            className="group rounded-lg transition-colors"
                        >
                            {/* Example Sentence + TTS */}
                            <div className="flex items-start gap-2">
                                <p
                                    className={cn(
                                        'flex-1 italic leading-relaxed',
                                        isCompact ? 'text-[14px]' : 'text-[17px]',
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
                                            'flex-shrink-0 flex items-center justify-center rounded-full transition-all scale-100 hover:scale-110 active:scale-95',
                                            isCompact ? 'p-1.5' : isTextSurface ? 'p-1.5' : 'p-2',
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
                                                <Volume2
                                                    className={cn(
                                                        'fill-current',
                                                        isCompact ? 'w-4 h-4' : isTextSurface ? 'w-4 h-4' : 'w-5 h-5'
                                                    )}
                                                />
                                            </span>
                                        ) : (
                                            <Volume2
                                                className={isCompact ? 'w-4 h-4' : isTextSurface ? 'w-4 h-4' : 'w-5 h-5'}
                                            />
                                        )}
                                    </button>
                                )}
                            </div>

                            {exampleTranslation && (
                                <p
                                    className={cn(
                                        'mt-1 font-medium',
                                        isCompact ? 'text-[13px]' : 'text-[15px]',
                                        isDark ? 'text-[#00F0FF]' : 'text-[#00C6D9]'
                                    )}
                                >
                                    {exampleTranslation}
                                </p>
                            )}

                            {/* Grammatical Note */}
                            {grammar && (
                                <p
                                    className={cn(
                                        'mt-1',
                                        isCompact ? 'text-[12px]' : 'text-[14px]',
                                        isDark ? 'text-zinc-400' : 'text-zinc-600'
                                    )}
                                >
                                    {grammar}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
