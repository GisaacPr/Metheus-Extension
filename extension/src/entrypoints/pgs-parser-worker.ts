import { onMessage } from '@metheus/common/subtitle-reader/pgs-parser-worker';

export default defineUnlistedScript(() => {
    onMessage();
});
