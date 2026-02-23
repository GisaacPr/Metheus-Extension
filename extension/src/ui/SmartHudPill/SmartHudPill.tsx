import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SmartHudPill.module.css';
import { Flag } from '@metheus/common/components/Flag';

interface Props {
    streak?: number;
    dailyGoalCurrent?: number;
    dailyGoalTotal?: number;
    onOpenSidePanel?: () => void;
    onOpenDashboard?: () => void;
    onOpenSettings?: () => void;
    onHideOverlay?: () => void;
    onToggleOverlay?: () => void;
    onOpenSubtitleTracks?: () => void;
    knownWordsCount?: number;
    languageCode?: string;
    isPlaying?: boolean;
    onDragDelta?: (deltaX: number, deltaY: number) => void;
    onDragDeltaX?: (deltaX: number) => void;
    onDragEnd?: () => void;
}

// Flag emoji helper removed in favor of @metheus/common/components/Flag

const MetheusLogo = ({ className }: { className?: string }) => (
    <svg
        viewBox="300 240 420 540"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse brightness-110`}
    >
        <g className="origin-center">
            <path
                fill="#1CB0F6"
                d="M496 264a156 156 0 0 1 31 30c37 41 70 96 70 153v8l-1 14q22-16 38-39l9-9c8 0 8 0 14 5q18 30 29 63l2 6a205 205 0 0 1-14 173q-17 30-43 50l-6 5c-25 18-58 35-90 35l10-4q42-13 60-54 13-36-4-70-11-17-25-32l-6-6c-8-10-8-10-18-18v-2h-2l-4-7-5-5v-2h-2l-3-11-3-9-1-25c0-6 0-6-6-10-17 0-30 15-42 26l-4 3-26 28-3 4c-26 33-42 72-37 114a106 106 0 0 0 75 79v1a176 176 0 0 1-163-205q11-41 35-76l4-5 23-31 6-7 14-18c52-63 52-63 73-141 2-10 6-11 15-11"
            />
            <path
                fill="#8CE0FF"
                d="M526 502c6 5 6 5 7 11v6q0 17 6 34v5h2c9 11 9 11 9 14h2v2l4 2 8 8 5 5 11 12 4 4c16 19 28 37 27 63v7q-2 32-25 55l-3 4q-20 17-45 24v1l-28 1h-9c-12 0-12 0-16-3l-7-3q-47-20-63-68c-10-39 3-78 26-110l9-12 4-5c47-57 47-57 72-57"
            />
        </g>
    </svg>
);

const SidePanelIcon = ({ className }: { className?: string }) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
    </svg>
);

const DashboardIcon = ({ className }: { className?: string }) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const DiamondIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${className} drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]`}
    >
        <path d="M6 3h12l4 6-10 13L2 9Z" fill="#000" fillOpacity="0.5" />
        <path d="M11 3 8 9l4 13 4-13-3-6" />
        <path d="M2 9h20" />
    </svg>
);

// Flag emoji helper removed in favor of @metheus/common/components/Flag

// ... (Icons remain the same)

const PaletteIcon = ({ className }: { className?: string }) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
);

const SmartHudPill: React.FC<Props> = ({
    streak = 14,
    dailyGoalCurrent = 14,
    dailyGoalTotal = 20,
    onOpenSidePanel,
    onHideOverlay,
    onToggleOverlay,
    onOpenSubtitleTracks,
    languageCode,
    knownWordsCount,
    isPlaying,
    onDragDelta,
    onDragDeltaX,
    onDragEnd,
}) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragFrameRef = useRef<number | null>(null);
    const pendingDragRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const flushDragDeltas = useCallback(() => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }

        const { x } = pendingDragRef.current;
        pendingDragRef.current = { x: 0, y: 0 };

        if (Math.abs(x) > 0) {
            onDragDeltaX?.(x);
        }

        if (Math.abs(x) > 0) {
            onDragDelta?.(x, 0);
        }
    }, [onDragDelta, onDragDeltaX]);

    useEffect(() => {
        return () => {
            if (dragFrameRef.current !== null) {
                cancelAnimationFrame(dragFrameRef.current);
                dragFrameRef.current = null;
            }
        };
    }, []);

    // Invisible Wall Fix
    useEffect(() => {
        document.body.style.pointerEvents = 'none';
        return () => {
            document.body.style.pointerEvents = '';
        };
    }, []);

    // Broadcast size changes
    useEffect(() => {
        window.parent.postMessage(
            {
                sender: 'asbplayer-mobile-overlay',
                message: {
                    command: 'pill-state-changed',
                    isExpanded,
                },
            },
            '*'
        );
    }, [isExpanded]);

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const handlePassivePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('button,a,input,textarea,select')) {
            return;
        }

        const initialClientX = event.clientX;
        let lastClientX = event.clientX;
        let moved = false;
        const dragThresholdPx = 4;
        setIsDragging(true);

        event.currentTarget.setPointerCapture?.(event.pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const deltaX = lastClientX - moveEvent.clientX;
            lastClientX = moveEvent.clientX;

            if (!moved && Math.abs(moveEvent.clientX - initialClientX) >= dragThresholdPx) {
                moved = true;
            }

            if (Math.abs(deltaX) > 0) {
                pendingDragRef.current.x += deltaX;

                if (dragFrameRef.current === null) {
                    dragFrameRef.current = requestAnimationFrame(() => {
                        dragFrameRef.current = null;
                        flushDragDeltas();
                    });
                }
            }
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            flushDragDeltas();
            setIsDragging(false);
            onDragEnd?.();

            if (!moved) {
                if (isExpanded) {
                    setIsExpanded(false);
                } else {
                    toggleExpand();
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    };

    const handleOpenAppearance = () => {
        // Open side panel (only opens, never closes) and switch to appearance tab
        browser.runtime.sendMessage({
            sender: 'asbplayerv2',
            message: { command: 'open-side-panel' },
        });
        setTimeout(() => {
            browser.runtime.sendMessage({ command: 'set-side-panel-tab', tab: 'appearance' });
        }, 200);
        setIsExpanded(false);
    };

    const handleOpenSettings = () => {
        // Open side panel (only opens, never closes) and switch to settings tab
        browser.runtime.sendMessage({
            sender: 'asbplayerv2',
            message: { command: 'open-side-panel' },
        });
        setTimeout(() => {
            browser.runtime.sendMessage({ command: 'set-side-panel-tab', tab: 'settings' });
        }, 200);
        setIsExpanded(false);
    };

    const renderContent = () => {
        return (
            <>
                <button className={styles.actionButton} onClick={onOpenSidePanel}>
                    <SidePanelIcon className={styles.actionIcon} />
                    {t('smartPill.sidePanel')}
                </button>

                <button className={styles.actionButton} onClick={handleOpenAppearance}>
                    <PaletteIcon className={styles.actionIcon} />
                    {t('smartPill.appearance')}
                </button>

                <button className={styles.actionButton} onClick={handleOpenSettings}>
                    <SettingsIcon className={styles.actionIcon} />
                    {t('smartPill.settings')}
                </button>

                <div className={styles.footer}>
                    <div className={styles.hideButtonGroup}>
                        <button
                            className={styles.hideButton}
                            onClick={(e) => {
                                e.stopPropagation();
                                onHideOverlay?.();
                            }}
                        >
                            {t('smartPill.hide')}
                        </button>
                        <span className={styles.hideButtonDivider}>|</span>
                        <button
                            className={styles.hideButton}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleOverlay?.();
                            }}
                        >
                            {t('smartPill.overlay')}
                        </button>
                        <span className={styles.hideButtonDivider}>|</span>
                        <button
                            className={styles.hideButton}
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenSubtitleTracks?.();
                            }}
                        >
                            {t('smartPill.tracks')}
                        </button>
                    </div>
                </div>
            </>
        );
    };

    return (
        <div className={styles.container}>
            <div
                className={`${styles.pill} ${isExpanded ? styles.expanded : ''} ${isPlaying && !isExpanded ? styles.transparent : ''}`}
            >
                {/* Passive Content */}
                <div
                    className={styles.passiveContent}
                    onPointerDown={handlePassivePointerDown}
                    style={{
                        width: '100%',
                        justifyContent: 'center',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                        touchAction: 'none',
                    }}
                >
                    {languageCode && (
                        <>
                            <div className={styles.streakContainer}>
                                <Flag
                                    code={languageCode}
                                    style={{ width: 28, height: 21, borderRadius: 999, objectFit: 'cover' }}
                                />
                                {knownWordsCount !== undefined && <span>{knownWordsCount}</span>}
                            </div>
                            <div className={styles.separator} />
                        </>
                    )}
                    <div className={styles.streakContainer}>
                        <MetheusLogo className={styles.fireIcon} />
                        <span>{streak}</span>
                    </div>

                    <div className={styles.separator} />

                    <div className={styles.streakContainer}>
                        <DiamondIcon className={styles.gemIcon} />
                        <span>
                            {dailyGoalCurrent}/{dailyGoalTotal}
                        </span>
                    </div>
                </div>

                {/* Drawer */}
                <div className={`${styles.drawer} ${isExpanded ? styles.drawerOpen : ''}`}>
                    <div className={styles.activeContent}>{renderContent()}</div>
                </div>
            </div>
        </div>
    );
};

export default SmartHudPill;
