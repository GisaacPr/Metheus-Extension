/**
 * useVideoChannel Hook
 *
 * Encapsulates the VideoChannel initialization logic:
 * - Creates BroadcastChannelVideoProtocol for local video files
 * - Creates ChromeTabVideoProtocol for extension tab videos
 * - Manages channel lifecycle (init/close)
 *
 * This hook extracts ~40 lines from Player.tsx without changing behavior.
 */

import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';
import VideoChannel from '../services/video-channel';
import BroadcastChannelVideoProtocol from '../services/broadcast-channel-video-protocol';
import ChromeTabVideoProtocol from '../services/chrome-tab-video-protocol';
import ChromeExtension from '../services/chrome-extension';
import Clock from '../services/clock';
import { VideoTabModel } from '@metheus/common';

export interface VideoChannelConfig {
    videoFile: File | undefined;
    tab: VideoTabModel | undefined;
    extension: ChromeExtension;
    videoPopOut: boolean;
    videoChannelRef?: MutableRefObject<VideoChannel | null>;
    onLoaded: (files: File[]) => void;
}

export interface VideoChannelResult {
    channel: VideoChannel | undefined;
    channelId: string | undefined;
    channelRef: React.MutableRefObject<VideoChannel | undefined>;
}

export function useVideoChannel(config: VideoChannelConfig): VideoChannelResult {
    const { videoFile, tab, extension, videoPopOut, videoChannelRef, onLoaded } = config;

    const [channel, setChannel] = useState<VideoChannel>();
    const [channelId, setChannelId] = useState<string>();
    const channelRef = useRef<VideoChannel | undefined>(undefined);
    channelRef.current = channel;

    useEffect(() => {
        if (!videoFile && !tab) {
            return;
        }

        let newChannel: VideoChannel;

        if (videoFile) {
            const newChannelId = uuidv4();
            newChannel = new VideoChannel(new BroadcastChannelVideoProtocol(newChannelId));
            setChannelId(newChannelId);
            onLoaded([videoFile]);
        } else {
            newChannel = new VideoChannel(new ChromeTabVideoProtocol(tab!.id, tab!.src, extension));
            newChannel.init();
        }

        if (videoChannelRef) {
            videoChannelRef.current = newChannel;
        }

        setChannel(newChannel);

        return () => {
            // Note: clock cleanup is handled by usePlaybackEngine or Player component
            newChannel.close();
        };
    }, [videoPopOut, videoFile, tab, extension, videoChannelRef, onLoaded]);

    return {
        channel,
        channelId,
        channelRef,
    };
}
