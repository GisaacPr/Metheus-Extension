import {
    MobileOverlayToVideoCommand,
    MobileOverlayModel,
    UpdateMobileOverlayModelMessage,
    VideoToExtensionCommand,
    PlayModeMessage,
} from '@metheus/common';
import Binding from '../services/binding';
import { CachingElementOverlay, OffsetAnchor } from '../services/element-overlay';
import { adjacentSubtitle } from '@metheus/common/key-binder';

const smallScreenVideoHeightThreshold = 300;

interface FrameParams {
    width: number;
    height: number;
    anchor: 'bottom' | 'top';
    src: string;
    tooltips: boolean;
    fullscreen: boolean;
    translateX: number;
    translateY: number;
    dragging: boolean;
}

const videoPillHorizontalOffsetKey = 'ln_video_pill_offset_x';

export class MobileVideoOverlayController {
    private readonly _context: Binding;
    private _overlay: CachingElementOverlay;
    private _pauseListener?: () => void;
    private _playListener?: () => void;
    private _seekedListener?: () => void;
    private _fullscreenListener?: () => void;
    private _forceHiding: boolean = false;
    private _showing: boolean = false;
    private _uiInitialized: boolean = false;
    private _messageListener?: (
        message: any,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ) => void;
    private _windowMessageListener?: (event: MessageEvent) => void;
    private _bound = false;
    private _frameParams?: FrameParams;
    private _isPillExpanded: boolean = false;
    private _userHiddenByPill: boolean = false;
    private _collapseOverlayUntil: number = 0;
    private _horizontalOffsetX: number = 0;
    private _isDraggingPill: boolean = false;

    private _hasEnabledSubtitleTrack(): boolean {
        const subtitles = this._context.subtitleController.subtitles;
        if (subtitles.length === 0) {
            return false;
        }

        const disabledTracks = this._context.subtitleController.disabledSubtitleTracks;
        return subtitles.some((subtitle) => subtitle.track === undefined || !disabledTracks[subtitle.track]);
    }

    private _maxHorizontalOffset(): number {
        const minVisiblePixels = 120;
        return Math.max(0, window.innerWidth - minVisiblePixels);
    }

    private _clampHorizontalOffset(value: number): number {
        return Math.max(0, Math.min(this._maxHorizontalOffset(), value));
    }

    private _applyDragTransformToIframe(dragging: boolean): boolean {
        const container = this._overlay.containerElement;
        const iframe = container?.querySelector('iframe') as HTMLIFrameElement | null;
        if (!iframe) {
            return false;
        }

        const translateX = this._clampHorizontalOffset(this._horizontalOffsetX);
        this._horizontalOffsetX = translateX;

        iframe.style.transition = dragging ? 'none' : 'transform 0.22s ease';
        iframe.style.transform = `translate(${-translateX}px, 0px)`;

        if (this._frameParams) {
            this._frameParams = {
                ...this._frameParams,
                translateX,
                translateY: 0,
                dragging,
            };
        }

        return true;
    }

    constructor(context: Binding, offsetAnchor: OffsetAnchor) {
        this._context = context;
        this._overlay = MobileVideoOverlayController._elementOverlay(context.video, offsetAnchor);
    }

    private static _elementOverlay(video: HTMLMediaElement, offsetAnchor: OffsetAnchor) {
        const containerClassName =
            offsetAnchor === OffsetAnchor.top
                ? 'asbplayer-mobile-video-overlay-container-top'
                : 'asbplayer-mobile-video-overlay-container-bottom';
        return new CachingElementOverlay({
            targetElement: video,
            nonFullscreenContainerClassName: containerClassName,
            fullscreenContainerClassName: containerClassName,
            nonFullscreenContentClassName: 'asbplayer-mobile-video-overlay',
            fullscreenContentClassName: 'asbplayer-mobile-video-overlay',
            offsetAnchor,
            contentPositionOffset: offsetAnchor === OffsetAnchor.bottom ? 48 : 8,
            contentWidthPercentage: -1,
            horizontalAlign: 'right',
            onMouseOver: () => {},
            onMouseOut: () => {},
        });
    }

    set offsetAnchor(value: OffsetAnchor) {
        if (this._overlay.offsetAnchor === value) {
            return;
        }

        this._overlay.dispose();
        this._overlay = MobileVideoOverlayController._elementOverlay(this._context.video, value);

        if (this._showing) {
            this._doShow();
        }
    }

    set forceHide(forceHide: boolean) {
        if (!this._bound) {
            return;
        }

        if (forceHide) {
            if (this._showing) {
                this._doHide();
            }

            this._forceHiding = true;
        } else {
            if (this._forceHiding) {
                this._forceHiding = false;
                this._show();
            }
        }
    }

    bind() {
        void browser.storage.local
            .get(videoPillHorizontalOffsetKey)
            .then((result) => {
                const stored = Number(result?.[videoPillHorizontalOffsetKey] ?? 0);
                if (Number.isFinite(stored)) {
                    this._horizontalOffsetX = this._clampHorizontalOffset(stored);
                    this._show();
                }
            })
            .catch(() => undefined);

        if (this._bound) {
            return;
        }

        this._pauseListener = () => {
            this._show();
            this.updateModel();
        };
        this._playListener = () => {
            this.updateModel();
        };
        this._seekedListener = () => {
            this.updateModel();
        };

        this._context.video.addEventListener('pause', this._pauseListener);
        this._context.video.addEventListener('play', this._playListener);
        this._context.video.addEventListener('seeked', this._seekedListener);
        this._fullscreenListener = () => this._show();
        document.addEventListener('fullscreenchange', this._fullscreenListener);
        this._messageListener = (
            message: any,
            sender: Browser.runtime.MessageSender,
            sendResponse: (response?: any) => void
        ) => {
            if (message.sender !== 'asbplayer-mobile-overlay-to-video' || message.src !== this._context.video.src) {
                return;
            }

            if (message.message.command === 'request-mobile-overlay-model') {
                this._model().then(sendResponse);
                this._uiInitialized = true;
                return true;
            }

            if (message.message.command === 'playMode') {
                const command = message as MobileOverlayToVideoCommand<PlayModeMessage>;
                this._context.playMode = command.message.playMode;
            } else if (message.message.command === 'toggle-subtitles') {
                this._context.settings
                    .getSingle('streamingDisplaySubtitles')
                    .then((current) => {
                        const next = !current;
                        this._context.subtitleController.displaySubtitles = next;
                        this._context.subtitleController.refresh();
                        return this._context.settings.set({ streamingDisplaySubtitles: next });
                    })
                    .then(() =>
                        browser.runtime.sendMessage({
                            sender: 'asbplayerv2',
                            message: { command: 'settings-updated' },
                        })
                    )
                    .then(() => this.updateModel())
                    .catch((e) => console.error('[MobileOverlay] toggle-subtitles failed', e));
            } else if (message.message.command === 'hidden') {
                this._userHiddenByPill = true;
                this._doHide();
            } else if (message.message.command === 'show-mobile-overlay') {
                this._userHiddenByPill = false;
                this._show();
            }
        };
        browser.runtime.onMessage.addListener(this._messageListener);

        this._windowMessageListener = (event: MessageEvent) => {
            if (event.data?.sender !== 'asbplayer-mobile-overlay') {
                return;
            }

            if (event.data.message?.command === 'pill-state-changed') {
                const expanded = event.data.message.isExpanded;
                if (this._isPillExpanded !== expanded) {
                    this._isPillExpanded = expanded;

                    if (expanded) {
                        this._collapseOverlayUntil = 0;
                    } else {
                        this._collapseOverlayUntil = Date.now() + 1000;
                    }

                    this._show();
                }
            } else if (event.data.message?.command === 'pill-drag-delta' && event.data.message?.source === 'video') {
                const deltaX = Number(event.data.message.deltaX ?? 0);
                if (!Number.isFinite(deltaX)) {
                    return;
                }

                this._horizontalOffsetX = this._clampHorizontalOffset(this._horizontalOffsetX + deltaX);
                this._isDraggingPill = true;
                if (!this._applyDragTransformToIframe(true)) {
                    this._doShow();
                }
            } else if (event.data.message?.command === 'pill-drag-end' && event.data.message?.source === 'video') {
                this._isDraggingPill = false;
                if (!this._applyDragTransformToIframe(false)) {
                    this._doShow();
                }
                void browser.storage.local
                    .set({ [videoPillHorizontalOffsetKey]: Math.round(this._horizontalOffsetX) })
                    .catch(() => undefined);
            }
        };
        window.addEventListener('message', this._windowMessageListener);

        this._bound = true;

        // Custom modification: Show immediately instead of waiting for pause
        this._show();
    }

    async updateModel() {
        if (!this._bound || !this._uiInitialized) {
            return;
        }

        if (!this._hasEnabledSubtitleTrack()) {
            if (this._showing) {
                this._doHide();
            }
        } else if (!this._forceHiding && !this._userHiddenByPill) {
            this._show();
        }

        const model = await this._model();
        const command: VideoToExtensionCommand<UpdateMobileOverlayModelMessage> = {
            sender: 'asbplayer-video',
            message: {
                command: 'update-mobile-overlay-model',
                model,
            },
            src: this._context.video.src,
        };
        browser.runtime.sendMessage(command);
    }

    private async _model() {
        const subtitles = this._context.subtitleController.subtitles;
        const hasEnabledTrack = this._hasEnabledSubtitleTrack();
        const subtitleDisplaying = hasEnabledTrack && this._context.subtitleController.currentSubtitle()[0] !== null;
        const timestamp = this._context.video.currentTime * 1000;
        const { language, clickToMineDefaultAction, themeType, streamingDisplaySubtitles } =
            await this._context.settings.get([
                'language',
                'clickToMineDefaultAction',
                'themeType',
                'streamingDisplaySubtitles',
            ]);
        const model: MobileOverlayModel = {
            offset: subtitles.length === 0 ? 0 : subtitles[0].start - subtitles[0].originalStart,
            playbackRate: this._context.video.playbackRate,
            emptySubtitleTrack: !hasEnabledTrack,
            recordingEnabled: this._context.recordMedia,
            recording: this._context.recordingMedia,
            previousSubtitleTimestamp: adjacentSubtitle(false, timestamp, subtitles)?.originalStart ?? undefined,
            nextSubtitleTimestamp: adjacentSubtitle(true, timestamp, subtitles)?.originalStart ?? undefined,
            currentTimestamp: timestamp,
            language,
            postMineAction: clickToMineDefaultAction,
            subtitleDisplaying,
            subtitlesAreVisible: streamingDisplaySubtitles,
            playMode: this._context.playMode,
            themeType,
            isPaused: this._context.video.paused,
        };
        return model;
    }

    show() {
        if (!this._bound) {
            return;
        }

        this._show();
    }

    disposeOverlay() {
        this._overlay.dispose();
        this._overlay = MobileVideoOverlayController._elementOverlay(this._context.video, this._overlay.offsetAnchor);
    }

    private _show() {
        if (!this._context.synced || this._forceHiding || this._userHiddenByPill) {
            return;
        }

        if (!this._hasEnabledSubtitleTrack()) {
            if (this._showing) {
                this._doHide();
            }
            return;
        }

        this._doShow();
    }

    private _doShow() {
        const frameParams = this._getFrameParams();
        const { width, height, anchor, src, tooltips, translateX, translateY, dragging } = frameParams;

        // Optimization: If showing and params match exactly, do nothing (avoids iframe reload)
        if (this._showing && this._frameParams && !this._differentFrameParams(frameParams, this._frameParams)) {
            return;
        }

        if (this._frameParams) {
            const onlySizeChanged =
                this._frameParams.src === src &&
                this._frameParams.anchor === anchor &&
                this._frameParams.tooltips === tooltips &&
                (this._frameParams.width !== width ||
                    this._frameParams.height !== height ||
                    this._frameParams.translateX !== translateX ||
                    this._frameParams.translateY !== translateY ||
                    this._frameParams.dragging !== dragging);

            if (onlySizeChanged) {
                // Soft resize: Don't destroy the iframe, just update its size
                // This ensures the React state (isExpanded) inside the iframe persists
                const container = this._overlay.containerElement; // Access exposed container
                const iframe = container?.querySelector('iframe');
                if (iframe) {
                    iframe.style.transition = dragging
                        ? 'none'
                        : 'width 0.28s ease, height 0.34s ease, transform 0.22s ease';
                    iframe.style.width = width + 'px';
                    iframe.style.height = height + 'px';
                    iframe.style.transform = `translate(${-translateX}px, ${-translateY}px)`;
                    this._frameParams = frameParams;
                    return;
                }
            }
        }

        if (this._frameParams !== undefined && this._differentFrameParams(frameParams, this._frameParams)) {
            this._overlay.uncacheHtml();
        }

        this._overlay.setHtml([
            {
                key: 'ui',
                html: () =>
                    `<iframe style="border: 0; background: transparent; color-scheme: dark; transition: ${dragging ? 'none' : 'width 0.28s ease, height 0.34s ease, transform 0.22s ease'}; width: ${width}px; height: ${height}px; transform: translate(${-translateX}px, ${-translateY}px)" src="${browser.runtime.getURL(
                        '/mobile-video-overlay-ui.html'
                    )}?src=${src}&anchor=${anchor}&tooltips=${tooltips}"/>`,
            },
        ]);

        this._frameParams = frameParams;
        this._showing = true;
    }

    private _getFrameParams(): FrameParams {
        const anchor = this._overlay.offsetAnchor === OffsetAnchor.bottom ? 'bottom' : 'top';
        const videoRect = this._context.video.getBoundingClientRect();
        const smallScreen = videoRect.height < smallScreenVideoHeightThreshold;

        let height = smallScreen ? 64 : 108;
        const collapsedWidth = Math.min(window.innerWidth, 300);
        let width = collapsedWidth;
        const keepExpandedBounds = this._isPillExpanded || Date.now() < this._collapseOverlayUntil;

        if (keepExpandedBounds) {
            // Keep width fixed to collapsed width. Expanded overlay only grows downward.
            height = 300;
        }

        const tooltips = !smallScreen;
        const src = encodeURIComponent(this._context.video.src);
        const fullscreen = document.fullscreenElement !== null;
        const translateX = this._clampHorizontalOffset(this._horizontalOffsetX);
        const translateY = 0;
        this._horizontalOffsetX = translateX;

        return {
            width,
            height,
            anchor,
            src,
            tooltips,
            fullscreen,
            translateX,
            translateY,
            dragging: this._isDraggingPill,
        };
    }

    private _differentFrameParams(a: FrameParams, b: FrameParams) {
        if (a.width !== b.width) {
            return true;
        }

        if (a.height !== b.height) {
            return true;
        }

        if (a.anchor !== b.anchor) {
            return true;
        }

        if (a.src !== b.src) {
            return true;
        }

        if (a.tooltips !== b.tooltips) {
            return true;
        }

        if (a.fullscreen !== b.fullscreen) {
            return true;
        }

        if (a.translateX !== b.translateX) {
            return true;
        }

        if (a.translateY !== b.translateY) {
            return true;
        }

        if (a.dragging !== b.dragging) {
            return true;
        }

        return false;
    }

    hide() {
        if (!this._bound) {
            return;
        }

        this._hide();
    }

    unhideFromPopupAction() {
        if (!this._bound) {
            return;
        }

        this._userHiddenByPill = false;
        this._show();
    }

    private _hide() {
        if (!this._context.synced || this._context.recordingMedia) {
            return;
        }

        this._doHide();
    }

    private _doHide() {
        this._overlay.hide();
        this._showing = false;
    }

    unbind() {
        if (this._pauseListener) {
            this._context.video.removeEventListener('pause', this._pauseListener);
            this._pauseListener = undefined;
        }

        if (this._playListener) {
            this._context.video.removeEventListener('play', this._playListener);
            this._playListener = undefined;
        }

        if (this._seekedListener) {
            this._context.video.removeEventListener('seeked', this._seekedListener);
            this._seekedListener = undefined;
        }

        if (this._fullscreenListener) {
            document.removeEventListener('fullscreenchange', this._fullscreenListener);
            this._fullscreenListener = undefined;
        }

        if (this._messageListener) {
            browser.runtime.onMessage.removeListener(this._messageListener);
            this._messageListener = undefined;
        }

        if (this._windowMessageListener) {
            window.removeEventListener('message', this._windowMessageListener);
            this._windowMessageListener = undefined;
        }

        this._overlay.dispose();
        this._overlay = MobileVideoOverlayController._elementOverlay(this._context.video, this._overlay.offsetAnchor);
        this._showing = false;
        this._userHiddenByPill = false;
        this._bound = false;
    }
}
