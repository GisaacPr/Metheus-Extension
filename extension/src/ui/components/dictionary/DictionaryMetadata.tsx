import React from 'react';
import { cn } from '../../utils';

interface DictionaryMetadataProps {
    data: {
        label: string;
        value: string | number;
        key: string;
    }[];
    themeType?: 'dark' | 'light';
}

export const DictionaryMetadata: React.FC<DictionaryMetadataProps> = ({ data, themeType = 'dark' }) => {
    const isDark = themeType === 'dark';

    if (!data || data.length === 0) {
        return (
            <div className={cn('text-center py-8 text-[18px]', isDark ? 'text-zinc-400' : 'text-zinc-600')}>
                No detailed metadata available for this word.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-y-3">
                {data.map(({ label, value, key }) => (
                    <div
                        key={key}
                        className={cn(
                            'flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 p-2 rounded-lg transition-colors',
                            isDark ? 'hover:bg-zinc-900/30' : 'hover:bg-zinc-50'
                        )}
                    >
                        <span
                            className={cn(
                                'font-semibold text-[16px] sm:min-w-[120px]',
                                isDark ? 'text-zinc-400' : 'text-zinc-600'
                            )}
                        >
                            {label}
                        </span>
                        <span
                            className={cn(
                                'text-[18px] font-medium break-words leading-relaxed',
                                isDark ? 'text-zinc-100' : 'text-zinc-900'
                            )}
                        >
                            {typeof value === 'string' && value.length > 200
                                ? `${value.substring(0, 200)}...`
                                : value?.toString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
