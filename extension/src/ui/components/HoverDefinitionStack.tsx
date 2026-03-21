import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

interface HoverDefinitionStackProps {
    isOpen: boolean;
    anchorRect: DOMRect;
    bestTranslation: string;
    alternatives: string[];
    isLoading: boolean;
}

export const HoverDefinitionStack: React.FC<HoverDefinitionStackProps> = ({
    isOpen,
    anchorRect,
    bestTranslation,
    alternatives,
    isLoading,
}) => {
    const towerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ left: 0, top: 0 });

    const visibleAlternatives = useMemo(() => alternatives.filter(Boolean).slice(0, 3), [alternatives]);
    const stackedTranslations = useMemo(
        () => [...visibleAlternatives, bestTranslation].filter(Boolean),
        [visibleAlternatives, bestTranslation]
    );

    useLayoutEffect(() => {
        if (!isOpen) {
            return;
        }

        const node = towerRef.current;
        const width = node?.offsetWidth || 320;
        const height = node?.offsetHeight || 220;
        const horizontalPadding = 12;
        const topPadding = 10;

        const centerX = anchorRect.left + anchorRect.width / 2;
        const left = Math.min(
            Math.max(centerX, horizontalPadding + width / 2),
            window.innerWidth - horizontalPadding - width / 2
        );

        let top = anchorRect.top - 8;
        if (top - height < topPadding) {
            top = height + topPadding;
        }

        setCoords({ left, top });
    }, [isOpen, anchorRect, stackedTranslations.length, isLoading]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="pointer-events-none fixed z-[2147483646]"
            style={{
                left: coords.left,
                top: coords.top,
                transform: 'translate(-50%, -100%)',
                width: 'max-content',
                maxWidth: 'min(340px, calc(100vw - 20px))',
            }}
        >
            <div
                ref={towerRef}
                className="overflow-hidden rounded-2xl border border-zinc-700 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
            >
                {isLoading ? (
                    <div className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/85 animate-pulse" />
                            <span
                                className="h-1.5 w-1.5 rounded-full bg-cyan-300/65 animate-pulse"
                                style={{ animationDelay: '0.12s' }}
                            />
                            <span
                                className="h-1.5 w-1.5 rounded-full bg-cyan-300/45 animate-pulse"
                                style={{ animationDelay: '0.24s' }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-700">
                        {stackedTranslations.map((translation, index) => {
                            const isBottomMatch = index === stackedTranslations.length - 1;
                            return (
                                <div
                                    key={`${translation}-${index}`}
                                    className={
                                        isBottomMatch
                                            ? 'border-l-2 border-cyan-300 bg-cyan-400/10 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]'
                                            : 'bg-transparent px-3 py-2'
                                    }
                                >
                                    <p
                                        className={
                                            isBottomMatch
                                                ? 'text-center text-[17px] font-extrabold leading-snug text-cyan-50'
                                                : 'text-center text-[13px] font-medium leading-snug text-zinc-200'
                                        }
                                    >
                                        {translation}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
