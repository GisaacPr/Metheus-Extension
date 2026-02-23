import { onMessage } from '@metheus/common/audio-clip/mp3-encoder-worker';

export default defineUnlistedScript(() => {
    onMessage();
});
