/**
 * usePlaybackEngine Hook
 *
 * Encapsulates the core playback logic:
 * - Clock management (time tracking)
 * - MediaAdapter (communication with video element)
 * - Basic controls: seek, play, pause, playbackRate
 *
 * This hook extracts ~150 lines from Player.tsx without changing behavior.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Clock from '../services/clock';
import MediaAdapter from '../services/media-adapter';
import VideoChannel from '../services/video-channel';
import { AutoPauseContext } from '@metheus/common';

export interface PlaybackEngineConfig {
    channel: VideoChannel | undefined;
    videoFileUrl: string | undefined;
    tabId: number | undefined;
}

export interface PlaybackEngineResult {
    clock: Clock;
    clockRef: React.MutableRefObject<Clock>;
    mediaAdapter: MediaAdapter;
    playbackRate: number;
    setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
    seek: (time: number, forwardToMedia: boolean) => Promise<void>;
    play: (forwardToMedia: boolean) => void;
    pause: (forwardToMedia: boolean) => void;
    updatePlaybackRate: (rate: number, forwardToMedia: boolean) => void;
    autoPauseContextRef: React.MutableRefObject<AutoPauseContext | undefined>;
}

export function usePlaybackEngine(config: PlaybackEngineConfig): PlaybackEngineResult {
    const { channel, videoFileUrl, tabId } = config;

    // Core Clock - singleton for the component lifecycle
    const clock = useMemo<Clock>(() => new Clock(), []);
    const clockRef = useRef<Clock>(clock);
    clockRef.current = clock;

    // MediaAdapter - depends on channel
    const mediaAdapter = useMemo(() => {
        if (videoFileUrl || tabId !== undefined) {
            return new MediaAdapter({ current: channel });
        }
        return new MediaAdapter({ current: undefined });
    }, [channel, videoFileUrl, tabId]);

    // Playback rate state
    const [playbackRate, setPlaybackRate] = useState<number>(1);

    // AutoPauseContext ref (to avoid recreating on every render)
    const autoPauseContextRef = useRef<AutoPauseContext | undefined>(undefined);

    // Seek function
    const seek = useCallback(
        async (time: number, forwardToMedia: boolean) => {
            clock.setTime(time);

            if (forwardToMedia) {
                await mediaAdapter.seek(time / 1000);
            }

            autoPauseContextRef.current?.clear();
        },
        [clock, mediaAdapter]
    );

    // Play function
    const play = useCallback(
        (forwardToMedia: boolean) => {
            clock.start();

            if (forwardToMedia) {
                mediaAdapter.play();
            }
        },
        [clock, mediaAdapter]
    );

    // Pause function
    const pause = useCallback(
        (forwardToMedia: boolean) => {
            clock.stop();

            if (forwardToMedia) {
                mediaAdapter.pause();
            }
        },
        [clock, mediaAdapter]
    );

    // Update playback rate
    const updatePlaybackRate = useCallback(
        (rate: number, forwardToMedia: boolean) => {
            if (clock.rate !== rate) {
                clock.rate = rate;
                setPlaybackRate(rate);

                if (forwardToMedia) {
                    mediaAdapter.playbackRate(rate);
                }
            }
        },
        [clock, mediaAdapter]
    );

    return {
        clock,
        clockRef,
        mediaAdapter,
        playbackRate,
        setPlaybackRate,
        seek,
        play,
        pause,
        updatePlaybackRate,
        autoPauseContextRef,
    };
}
