import { Message } from '@metheus/common';

export interface VideoProtocol {
    postMessage: (message: Message) => void;
    close: () => void;
    onMessage?: (message: VideoProtocolMessage) => void;
}

export interface VideoProtocolMessage {
    data: Message;
}
