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
    density?: 'comfortable' | 'compact';
}

interface MeaningItemProps {
    def: UnifiedEntry['definitions'][0];
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onHoverChange?: (hovered: boolean) => void;
    onTranslationLoaded?: (index: number, text: string) => void;
    themeType?: 'dark' | 'light';
    density?: 'comfortable' | 'compact';
}

const MeaningItem: React.FC<MeaningItemProps> = ({
    def,
    index,
    isSelected,
    onSelect,
    onHoverChange,
    onTranslationLoaded,
    themeType = 'dark',
    density = 'comfortable',
}) => {
    const { locale } = useTranslation();
    const { translateText } = useGoogleTranslation();
    const [translatedMeaning, setTranslatedMeaning] = useState<string | null>(null);
    const isCompact = density === 'compact';

    // Auto-translate if locale is not English (assuming dictionary is EN or we want to help user)
    // In a real app we might check entry.language vs locale more strictly
    useEffect(() => {
        if (locale && locale !== 'en' && !translatedMeaning) {
            // strip html tags for translation to be safe
            const cleanText = def.meaning.replace(/<[^>]*>/g, '');
            translateText(cleanText, locale, 'auto', { cacheKind: 'definition' }).then((res) => {
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
            <div className={cn(isCompact ? 'p-2.5' : 'p-3')}>
                <div className="flex-1 space-y-2">
                    {/* Meaning - Supports HTML for LN dicts */}
                    <div
                        className={cn(
                            'leading-relaxed font-medium [&>i]:italic [&>b]:font-bold',
                            isCompact ? 'text-[15px]' : 'text-[19px]',
                            themeType === 'dark' ? 'text-zinc-100' : 'text-zinc-800'
                        )}
                        dangerouslySetInnerHTML={{ __html: sanitizeMeaningHtml(def.meaning) }}
                    />

                    {/* Translated Meaning */}
                    {translatedMeaning && (
                        <div
                            className={cn(
                                'font-medium',
                                isCompact ? 'text-[13px]' : 'text-[15px]',
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
                                'italic',
                                isCompact ? 'text-[13px]' : 'text-[15px]',
                                themeType === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                            )}
                        >
                            {def.context}
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
    density = 'comfortable',
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
        <div className={cn(density === 'compact' ? 'space-y-2' : 'space-y-3')}>
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
                    density={density}
                />
            ))}
        </div>
    );
};
