import React from 'react';
import { cn } from '../../utils';

interface DictionaryMetadataProps {
    data: {
        label: string;
        value: string | number;
        key: string;
    }[];
    themeType?: 'dark' | 'light';
    density?: 'comfortable' | 'compact';
}

export const DictionaryMetadata: React.FC<DictionaryMetadataProps> = ({
    data,
    themeType = 'dark',
    density = 'comfortable',
}) => {
    const isDark = themeType === 'dark';
    const isCompact = density === 'compact';

    if (!data || data.length === 0) {
        return (
            <div
                className={cn(
                    'text-center py-8',
                    isCompact ? 'text-[14px]' : 'text-[18px]',
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                )}
            >
                No detailed metadata available for this word.
            </div>
        );
    }

    return (
        <div className={cn(isCompact ? 'space-y-3' : 'space-y-4')}>
            <div className={cn('grid grid-cols-1', isCompact ? 'gap-y-2' : 'gap-y-3')}>
                {data.map(({ label, value, key }) => (
                    <div
                        key={key}
                        className={cn(
                            'flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 rounded-lg transition-colors',
                            isCompact ? 'p-1.5' : 'p-2',
                            isDark ? 'hover:bg-zinc-900/30' : 'hover:bg-zinc-50'
                        )}
                    >
                        <span
                            className={cn(
                                'font-semibold sm:min-w-[120px]',
                                isCompact ? 'text-[12px]' : 'text-[16px]',
                                isDark ? 'text-zinc-400' : 'text-zinc-600'
                            )}
                        >
                            {label}
                        </span>
                        <span
                            className={cn(
                                'font-medium break-words leading-relaxed whitespace-pre-wrap',
                                isCompact ? 'text-[14px]' : 'text-[18px]',
                                isDark ? 'text-zinc-100' : 'text-zinc-900'
                            )}
                        >
                            {value?.toString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
