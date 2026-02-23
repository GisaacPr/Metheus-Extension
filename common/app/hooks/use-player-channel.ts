/**
 * usePlayerChannel Hook
 *
 * Manages the PlayerChannel lifecycle and event subscriptions for VideoPlayer.tsx.
 * This extracts ~150 lines of communication logic.
 */

import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import PlayerChannel from '../services/player-channel';
import Clock from '../services/clock';
import { PlayMode, RichSubtitleModel } from '@metheus/common';
import { AnkiSettings, MiscSettings, SubtitleSettings } from '@metheus/common/settings';
import { AlertColor } from '@mui/material/Alert';
import { seekWithNudge } from '@metheus/common/util';

export interface UsePlayerChannelProps {
    channelCode: string;
    videoRef: MutableRefObject<HTMLVideoElement | undefined>;
    clock: Clock;
    requestFullscreen: (enable: boolean) => void;
    // Setters
    setLength: (length: number) => void;
    setVideoFileName: (name: string) => void;
    setSubtitles: React.Dispatch<React.SetStateAction<RichSubtitleModel[]>>;
    setTrackCount: (count: number) => void;
    setOffset: (offset: number) => void;
    setShowSubtitles: React.Dispatch<React.SetStateAction<RichSubtitleModel[]>>;
    setPlayMode: (mode: PlayMode) => void;
    setSubtitlePlayerHidden: (hidden: boolean) => void;
    setAppBarHidden: (hidden: boolean) => void;
    setSubtitleSettings: React.Dispatch<React.SetStateAction<SubtitleSettings>>;
    setMiscSettings: React.Dispatch<React.SetStateAction<MiscSettings>>;
    setAnkiSettings: React.Dispatch<React.SetStateAction<AnkiSettings>>;
    setAlertOpen: (open: boolean) => void;
    setAlertMessage: (message: string) => void;
    setAlertSeverity: (severity: AlertColor) => void;

    // Dependencies
    autoPauseContextRef: MutableRefObject<any>; // Weak type to avoid circular dep if needed, or import properly
    domCacheRef: MutableRefObject<any>;
    selectAudioTrack: (id: string) => void;
    setSelectedAudioTrack: (id: string) => void;
    updateSubtitlesWithOffset: (offset: number) => void;
    updatePlaybackRate: (rate: number, forward: boolean) => void;
    poppingInRef: MutableRefObject<boolean | undefined>;
}

export function usePlayerChannel(props: UsePlayerChannelProps) {
    const {
        channelCode,
        videoRef,
        clock,
        requestFullscreen,
        setLength,
        setVideoFileName,
        setSubtitles,
        setTrackCount,
        setOffset,
        setShowSubtitles,
        setPlayMode,
        setSubtitlePlayerHidden,
        setAppBarHidden,
        setSubtitleSettings,
        setMiscSettings,
        setAnkiSettings,
        setAlertOpen,
        setAlertMessage,
        setAlertSeverity,
        autoPauseContextRef,
        domCacheRef,
        selectAudioTrack,
        setSelectedAudioTrack,
        updateSubtitlesWithOffset,
        updatePlaybackRate,
        poppingInRef,
    } = props;

    const playerChannel = useMemo(() => new PlayerChannel(channelCode), [channelCode]);
    const [playerChannelSubscribed, setPlayerChannelSubscribed] = useState<boolean>(false);

    useEffect(() => {
        playerChannel.onReady((duration, videoFileName) => {
            setLength(duration);
            setVideoFileName(videoFileName ?? '');
        });

        playerChannel.onPlay(async () => {
            await videoRef.current?.play();
            clock.start();
        });

        playerChannel.onPause(() => {
            videoRef.current?.pause();
            clock.stop();
        });

        playerChannel.onCurrentTime((currentTime) => {
            let actualCurrentTime = currentTime;

            if (videoRef.current) {
                actualCurrentTime = seekWithNudge(videoRef.current, currentTime);
            }

            if (videoRef.current?.readyState === 4) {
                playerChannel.readyState(4);
            }

            clock.stop();
            clock.setTime(actualCurrentTime * 1000);
            autoPauseContextRef.current?.clear();
        });

        playerChannel.onAudioTrackSelected((id) => {
            selectAudioTrack(id);
            setSelectedAudioTrack(id);
            playerChannel.audioTrackSelected(id);
        });

        playerChannel.onClose(() => {
            playerChannel.close();
            window.close();
        });

        playerChannel.onSubtitles((subtitles) => {
            setSubtitles(subtitles.map((s, i) => ({ ...s, index: i })));
            setTrackCount(Math.max(...subtitles.map((s) => s.track)) + 1);

            if (subtitles && subtitles.length > 0) {
                const s = subtitles[0];
                const offset = s.start - s.originalStart;
                setOffset(offset);
            }

            setShowSubtitles([]);
            autoPauseContextRef.current?.clear();
        });

        playerChannel.onSubtitlesUpdated((updatedSubtitles) => {
            for (const updatedSubtitle of updatedSubtitles) {
                domCacheRef.current?.delete(String(updatedSubtitle.index));
            }
            setSubtitles((prevSubtitles) => {
                const allSubtitles = prevSubtitles.slice();
                for (const s of updatedSubtitles) {
                    allSubtitles[s.index] = { ...allSubtitles[s.index], richText: s.richText };
                }
                return allSubtitles;
            });
        });

        playerChannel.onPlayMode((playMode) => setPlayMode(playMode));
        playerChannel.onHideSubtitlePlayerToggle((hidden) => setSubtitlePlayerHidden(hidden));
        playerChannel.onAppBarToggle((hidden) => setAppBarHidden(hidden));
        playerChannel.onFullscreenToggle((fullscreen) => requestFullscreen(fullscreen));
        playerChannel.onSubtitleSettings(setSubtitleSettings);
        playerChannel.onMiscSettings(setMiscSettings);
        playerChannel.onAnkiSettings(setAnkiSettings);
        playerChannel.onOffset(updateSubtitlesWithOffset);
        playerChannel.onPlaybackRate((playbackRate) => {
            updatePlaybackRate(playbackRate, false);
        });
        playerChannel.onAlert((message, severity) => {
            setAlertOpen(true);
            setAlertMessage(message);
            setAlertSeverity(severity as AlertColor);
        });

        window.onbeforeunload = (e) => {
            if (!poppingInRef.current) {
                playerChannel.close();
            }
        };

        setPlayerChannelSubscribed(true);
        return () => playerChannel.close();
    }, [
        clock,
        playerChannel,
        requestFullscreen,
        updateSubtitlesWithOffset,
        updatePlaybackRate,
        setLength,
        setVideoFileName,
        setSubtitles,
        setTrackCount,
        setOffset,
        setShowSubtitles,
        setPlayMode,
        setSubtitlePlayerHidden,
        setAppBarHidden,
        setSubtitleSettings,
        setMiscSettings,
        setAnkiSettings,
        setAlertOpen,
        setAlertMessage,
        setAlertSeverity,
        autoPauseContextRef,
        domCacheRef,
        selectAudioTrack,
        setSelectedAudioTrack,
        poppingInRef,
        videoRef,
    ]);

    return {
        playerChannel,
        playerChannelSubscribed,
    };
}
