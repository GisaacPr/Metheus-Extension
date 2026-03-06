import React, { useState, useEffect } from 'react';
import { UnifiedEntry } from '../../dictionary-adapter';
import { cn } from '../../utils';
import { useTranslation, useGoogleTranslation } from '../../hooks';

/** Strip CSS leaks (e.g. `.mw-parser-output .defdate{...}`) and dangerous HTML from dictionary meaning text. */
const sanitizeMeaningHtml = (html: string): string =>
    html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/(?:\.[a-zA-Z][\w-]*(?:\s+\.[a-zA-Z][\w-]*)*\s*\{[^}]*\}\s*)+/g, '')
        .replace(/\s*(class|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
        .replace(/<(?!\/?(?:b|i|em|strong|br|sup|sub|span)\b)[^>]+>/gi, '')
        .trim();

interface DictionaryMeaningProps {
    definitions: UnifiedEntry['definitions'];
    selectedIndex?: number;
    onSelectDefinition?: (index: number) => void;
    onHoverDefinition?: (index?: number) => void;
    onDefinitionTranslation?: (index: number, text: string) => void;
    themeType?: 'dark' | 'light';
}

interface MeaningItemProps {
    def: UnifiedEntry['definitions'][0];
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onHoverChange?: (hovered: boolean) => void;
    onTranslationLoaded?: (index: number, text: string) => void;
    themeType?: 'dark' | 'light';
}

const MeaningItem: React.FC<MeaningItemProps> = ({
    def,
    index,
    isSelected,
    onSelect,
    onHoverChange,
    onTranslationLoaded,
    themeType = 'dark',
}) => {
    const { locale } = useTranslation();
    const { translateText } = useGoogleTranslation();
    const [translatedMeaning, setTranslatedMeaning] = useState<string | null>(null);

    // Auto-translate if locale is not English (assuming dictionary is EN or we want to help user)
    // In a real app we might check entry.language vs locale more strictly
    useEffect(() => {
        if (locale && locale !== 'en' && !translatedMeaning) {
            // strip html tags for translation to be safe
            const cleanText = def.meaning.replace(/<[^>]*>/g, '');
            translateText(cleanText, locale).then((res) => {
                if (res) {
                    setTranslatedMeaning(res);
                    onTranslationLoaded?.(index, res);
                }
            });
        }
    }, [locale, def.meaning, translateText, index, onTranslationLoaded, translatedMeaning]);

    return (
        <div
            className={cn(
                'group cursor-pointer rounded-lg transition-all border',
                themeType === 'dark'
                    ? 'border-transparent hover:bg-[#39FF14]/12 hover:border-[#39FF14]/45'
                    : 'border-transparent hover:bg-[#39FF14]/10 hover:border-[#39FF14]/35',
                isSelected &&
                    (themeType === 'dark'
                        ? 'bg-[#39FF14]/16 border-l-2 border-[#39FF14]'
                        : 'bg-[#39FF14]/12 border-l-2 border-[#39FF14]')
            )}
            onClick={onSelect}
            onMouseEnter={() => onHoverChange?.(true)}
            onMouseLeave={() => onHoverChange?.(false)}
        >
            <div className="flex gap-3 p-2">
                {/* Number Badge */}
                <div
                    className={cn(
                        'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[16px] font-black mt-0.5 shadow-sm transition-all',
                        isSelected
                            ? 'bg-gradient-to-br from-[#39FF14] to-[#1FD100] text-zinc-950'
                            : themeType === 'dark'
                              ? 'bg-zinc-800 text-zinc-100 group-hover:bg-gradient-to-br group-hover:from-[#39FF14] group-hover:to-[#1FD100] group-hover:text-zinc-950'
                              : 'bg-zinc-200 text-zinc-700 group-hover:bg-gradient-to-br group-hover:from-[#39FF14] group-hover:to-[#1FD100] group-hover:text-zinc-950'
                    )}
                >
                    {def.index || index + 1}
                </div>

                {/* Definition Content */}
                <div className="flex-1 space-y-2">
                    {/* Meaning - Supports HTML for LN dicts */}
                    <div
                        className={cn(
                            'text-[22px] leading-relaxed font-medium [&>i]:italic [&>b]:font-bold',
                            themeType === 'dark' ? 'text-zinc-100' : 'text-zinc-800'
                        )}
                        dangerouslySetInnerHTML={{ __html: sanitizeMeaningHtml(def.meaning) }}
                    />

                    {/* Translated Meaning */}
                    {translatedMeaning && (
                        <div
                            className={cn(
                                'text-[16px] border-l-2 border-[#00F0FF]/45 pl-2 font-medium',
                                themeType === 'dark' ? 'text-[#00F0FF]' : 'text-[#00C6D9]'
                            )}
                        >
                            {translatedMeaning}
                        </div>
                    )}

                    {/* Usage Context */}
                    {def.context && (
                        <p
                            className={cn(
                                'text-[18px] italic pl-3 border-l-2',
                                themeType === 'dark' ? 'text-zinc-400 border-zinc-700' : 'text-zinc-600 border-zinc-200'
                            )}
                        >
                            💡 {def.context}
                        </p>
                    )}

                    {/* Synonyms */}
                    {def.synonyms && def.synonyms.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[15px]">
                            <span
                                className={cn('font-medium', themeType === 'dark' ? 'text-zinc-400' : 'text-zinc-600')}
                            >
                                Similar:
                            </span>
                            {def.synonyms.slice(0, 4).map((syn, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        'px-2 py-0.5 rounded-md border',
                                        themeType === 'dark'
                                            ? 'bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/40'
                                            : 'bg-[#39FF14]/20 text-zinc-900 border-[#39FF14]/35'
                                    )}
                                >
                                    {syn}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const DictionaryMeaning: React.FC<DictionaryMeaningProps> = ({
    definitions,
    selectedIndex,
    onSelectDefinition,
    onHoverDefinition,
    onDefinitionTranslation,
    themeType = 'dark',
}) => {
    if (!definitions || definitions.length === 0) {
        return (
            <div className="py-4 text-center">
                <p className={cn('text-sm', themeType === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}>
                    No definition available
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {definitions.map((def, idx) => (
                <MeaningItem
                    key={idx}
                    def={def}
                    index={idx}
                    isSelected={selectedIndex === idx}
                    onSelect={() => onSelectDefinition?.(idx)}
                    onHoverChange={(hovered) => onHoverDefinition?.(hovered ? idx : undefined)}
                    themeType={themeType}
                    onTranslationLoaded={onDefinitionTranslation}
                />
            ))}
        </div>
    );
};
