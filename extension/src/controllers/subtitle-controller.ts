import {
    AutoPauseContext,
    CopyToClipboardMessage,
    OffsetFromVideoMessage,
    SubtitlesUpdatedFromVideoMessage,
    SubtitleModel,
    SubtitleHtml,
    VideoToExtensionCommand,
    Fetcher,
    HttpPostMessage,
    IndexedSubtitleModel,
    RichSubtitleModel,
} from '@metheus/common';
import {
    SettingsProvider,
    SubtitleAlignment,
    SubtitleSettings,
    TextSubtitleSettings,
    allTextSubtitleSettings,
} from '@metheus/common/settings';
import { SubtitleSlice } from '@metheus/common/subtitle-collection';
import { SubtitleCollection } from '@metheus/common/subtitle-collection';
import { arrayEquals, computeStyleString, surroundingSubtitles } from '@metheus/common/util';
import i18n from 'i18next';

import {
    CachingElementOverlay,
    ElementOverlay,
    ElementOverlayParams,
    KeyedHtml,
    OffsetAnchor,
} from '../services/element-overlay';
import { v4 as uuidv4 } from 'uuid';

const BOUNDING_BOX_PADDING = 25;

const _intersects = (clientX: number, clientY: number, element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    return (
        clientX >= rect.x - BOUNDING_BOX_PADDING &&
        clientX <= rect.x + rect.width + BOUNDING_BOX_PADDING &&
        clientY >= rect.y - BOUNDING_BOX_PADDING &&
        clientY <= rect.y + rect.height + BOUNDING_BOX_PADDING
    );
};

export default class SubtitleController {
    private readonly video: HTMLMediaElement;
    private readonly settings: SettingsProvider;

    private showingSubtitles?: IndexedSubtitleModel[];
    private lastLoadedMessageTimestamp: number;
    private lastOffsetChangeTimestamp: number;
    private showingOffset?: number;
    private subtitlesInterval?: NodeJS.Timeout;
    private showingLoadedMessage: boolean;
    private subtitleSettings?: SubtitleSettings;
    private subtitleStyles?: string[];
    private subtitleClasses?: string[];
    private notificationElementOverlayHideTimeout?: NodeJS.Timeout;
    subtitleCollection: SubtitleCollection<RichSubtitleModel>;

    get videoElement(): HTMLMediaElement {
        return this.video;
    }

    private bottomSubtitlesElementOverlay: ElementOverlay;
    private topSubtitlesElementOverlay: ElementOverlay;
    private notificationElementOverlay: ElementOverlay;
    private shouldRenderBottomOverlay: boolean;
    private shouldRenderTopOverlay: boolean;
    private subtitleTrackAlignments: { [key: number]: SubtitleAlignment | undefined };
    private unblurredSubtitleTracks: { [key: number]: boolean | undefined };
    disabledSubtitleTracks: { [key: number]: boolean | undefined };
    subtitleFileNames?: string[];
    _forceHideSubtitles: boolean;
    _displaySubtitles: boolean;
    surroundingSubtitlesCountRadius: number;
    surroundingSubtitlesTimeRadius: number;
    autoCopyCurrentSubtitle: boolean;
    convertNetflixRuby: boolean;
    subtitleHtml: SubtitleHtml;
    refreshCurrentSubtitle: boolean;
    _preCacheDom;
    private _subtitles: RichSubtitleModel[] = [];
    private secondarySubtitleVisible: boolean = true;

    readonly autoPauseContext: AutoPauseContext = new AutoPauseContext();

    onNextToShow?: (subtitle: SubtitleModel) => void;
    onSlice?: (subtitle: SubtitleSlice<IndexedSubtitleModel>) => void;
    onOffsetChange?: () => void;
    onMouseOver?: (event: MouseEvent) => void;
    onMouseOut?: (event: MouseEvent) => void;

    constructor(video: HTMLMediaElement, settings: SettingsProvider) {
        this.video = video;
        this.settings = settings;
        this._preCacheDom = false;
        this.showingSubtitles = [];
        this.shouldRenderBottomOverlay = true;
        this.shouldRenderTopOverlay = false;
        this.unblurredSubtitleTracks = {};
        this.disabledSubtitleTracks = {};
        this.subtitleTrackAlignments = { 0: 'bottom' };
        this._forceHideSubtitles = false;
        this._displaySubtitles = true;
        this.lastLoadedMessageTimestamp = 0;
        this.lastOffsetChangeTimestamp = 0;
        this.showingOffset = undefined;
        this.surroundingSubtitlesCountRadius = 1;
        this.surroundingSubtitlesTimeRadius = 5000;
        this.showingLoadedMessage = false;
        this.autoCopyCurrentSubtitle = false;
        this.convertNetflixRuby = false;
        this.subtitleHtml = SubtitleHtml.remove;
        this.refreshCurrentSubtitle = false;
        const { subtitlesElementOverlay, topSubtitlesElementOverlay, notificationElementOverlay } = this._overlays();
        this.bottomSubtitlesElementOverlay = subtitlesElementOverlay;
        this.topSubtitlesElementOverlay = topSubtitlesElementOverlay;
        this.notificationElementOverlay = notificationElementOverlay;
        this.subtitleCollection = new SubtitleCollection({ showingCheckRadiusMs: 150, returnNextToShow: true });
    }

    private resizeObserver?: ResizeObserver;

    htmlProcessor?: (text: string, track?: number) => Promise<string>;

    get subtitles() {
        return this._subtitles;
    }

    set subtitles(subtitles) {
        this._subtitles = subtitles;
        this.subtitleCollection.setSubtitles(subtitles);
        this.autoPauseContext.clear();
    }

    reset() {
        this.subtitles = [];
        this.subtitleFileNames = undefined;
        this.cacheHtml();
        // this.subtitleCollection.reset(); // SubtitleCollection might not have reset(), setSubtitles([]) is enough
    }

    async cacheHtml() {
        const htmls = await this._buildSubtitlesHtml(this.subtitles);

        if (this.shouldRenderBottomOverlay && this.bottomSubtitlesElementOverlay instanceof CachingElementOverlay) {
            this.bottomSubtitlesElementOverlay.uncacheHtml();
            for (const html of htmls) {
                this.bottomSubtitlesElementOverlay.cacheHtml(html.key, html.html());
            }
        }
        if (this.shouldRenderTopOverlay && this.topSubtitlesElementOverlay instanceof CachingElementOverlay) {
            this.topSubtitlesElementOverlay.uncacheHtml();
            for (const html of htmls) {
                this.topSubtitlesElementOverlay.cacheHtml(html.key, html.html());
            }
        }
    }

    get bottomSubtitlePositionOffset(): number {
        return this.bottomSubtitlesElementOverlay.contentPositionOffset;
    }

    set bottomSubtitlePositionOffset(value: number) {
        this.bottomSubtitlesElementOverlay.contentPositionOffset = value;
    }

    get topSubtitlePositionOffset(): number {
        return this.topSubtitlesElementOverlay.contentPositionOffset;
    }

    set topSubtitlePositionOffset(value: number) {
        this.topSubtitlesElementOverlay.contentPositionOffset = value;
    }

    set subtitlesWidth(value: number) {
        this.bottomSubtitlesElementOverlay.contentWidthPercentage = value;
        this.topSubtitlesElementOverlay.contentWidthPercentage = value;
    }

    setSubtitleSettings(newSubtitleSettings: SubtitleSettings) {
        const styles = this._computeStyles(newSubtitleSettings);
        const classes = this._computeClasses(newSubtitleSettings);
        if (
            this.subtitleStyles === undefined ||
            !arrayEquals(styles, this.subtitleStyles, (a, b) => a === b) ||
            this.subtitleClasses === undefined ||
            !arrayEquals(classes, this.subtitleClasses, (a, b) => a === b)
        ) {
            this.subtitleStyles = styles;
            this.subtitleClasses = classes;
            this.cacheHtml(); // Not awaiting here as it might be fine, or should we? usage seems valid as void
        }

        const newAlignments = allTextSubtitleSettings(newSubtitleSettings).map((s) => s.subtitleAlignment);
        if (!arrayEquals(newAlignments, Object.values(this.subtitleTrackAlignments), (a, b) => a === b)) {
            this.subtitleTrackAlignments = newAlignments;
            this.shouldRenderBottomOverlay = Object.values(this.subtitleTrackAlignments).includes(
                'bottom' as SubtitleAlignment
            );
            this.shouldRenderTopOverlay = Object.values(this.subtitleTrackAlignments).includes(
                'top' as SubtitleAlignment
            );
            const { subtitleOverlayParams, topSubtitleOverlayParams, notificationOverlayParams } =
                this._elementOverlayParams();
            this._applyElementOverlayParams(this.bottomSubtitlesElementOverlay, subtitleOverlayParams);
            this._applyElementOverlayParams(this.topSubtitlesElementOverlay, topSubtitleOverlayParams);
            this._applyElementOverlayParams(this.notificationElementOverlay, notificationOverlayParams);
            this.bottomSubtitlesElementOverlay.hide();
            this.topSubtitlesElementOverlay.hide();
            this.notificationElementOverlay.hide();
        }

        this.unblurredSubtitleTracks = {};

        this.subtitleSettings = newSubtitleSettings;
    }

    private _computeStyles(settings: SubtitleSettings) {
        return allTextSubtitleSettings(settings).map((s) => computeStyleString(s));
    }

    private _computeClasses(settings: SubtitleSettings) {
        return allTextSubtitleSettings(settings).map((s) => this._computeClassesForTrack(s));
    }

    private _computeClassesForTrack(settings: TextSubtitleSettings) {
        return settings.subtitleBlur ? 'asbplayer-subtitles-blurred' : '';
    }

    private _getSubtitleTrackAlignment(trackIndex: number) {
        return this.subtitleTrackAlignments[trackIndex] || this.subtitleTrackAlignments[0];
    }

    private _applyElementOverlayParams(overlay: ElementOverlay, params: ElementOverlayParams) {
        overlay.offsetAnchor = params.offsetAnchor;
        overlay.fullscreenContainerClassName = params.fullscreenContainerClassName;
        overlay.fullscreenContentClassName = params.fullscreenContentClassName;
        overlay.nonFullscreenContainerClassName = params.nonFullscreenContainerClassName;
        overlay.nonFullscreenContentClassName = params.nonFullscreenContentClassName;
    }

    set displaySubtitles(displaySubtitles: boolean) {
        this._displaySubtitles = displaySubtitles;
        this.showingSubtitles = undefined;
    }

    set forceHideSubtitles(forceHideSubtitles: boolean) {
        this._forceHideSubtitles = forceHideSubtitles;
        this.showingSubtitles = undefined;
    }

    private _overlays() {
        const { subtitleOverlayParams, topSubtitleOverlayParams, notificationOverlayParams } =
            this._elementOverlayParams();

        return {
            subtitlesElementOverlay: new CachingElementOverlay(subtitleOverlayParams),
            topSubtitlesElementOverlay: new CachingElementOverlay(topSubtitleOverlayParams),
            notificationElementOverlay: new CachingElementOverlay(notificationOverlayParams),
        };
    }

    private _elementOverlayParams() {
        const subtitleOverlayParams: ElementOverlayParams = {
            targetElement: this.video,
            nonFullscreenContainerClassName: 'asbplayer-subtitles-container-bottom',
            nonFullscreenContentClassName: 'asbplayer-subtitles',
            fullscreenContainerClassName: 'asbplayer-subtitles-container-bottom',
            fullscreenContentClassName: 'asbplayer-fullscreen-subtitles',
            offsetAnchor: OffsetAnchor.bottom,
            contentWidthPercentage: -1,
            onMouseOver: (event: MouseEvent) => this.onMouseOver?.(event),
            onMouseOut: (event: MouseEvent) => this.onMouseOut?.(event),
        };
        const topSubtitleOverlayParams: ElementOverlayParams = {
            targetElement: this.video,
            nonFullscreenContainerClassName: 'asbplayer-subtitles-container-top',
            nonFullscreenContentClassName: 'asbplayer-subtitles',
            fullscreenContainerClassName: 'asbplayer-subtitles-container-top',
            fullscreenContentClassName: 'asbplayer-fullscreen-subtitles',
            offsetAnchor: OffsetAnchor.top,
            contentWidthPercentage: -1,
            onMouseOver: (event: MouseEvent) => this.onMouseOver?.(event),
            onMouseOut: (event: MouseEvent) => this.onMouseOut?.(event),
        };
        const notificationOverlayParams: ElementOverlayParams =
            this._getSubtitleTrackAlignment(0) === 'bottom'
                ? {
                      targetElement: this.video,
                      nonFullscreenContainerClassName: 'asbplayer-notification-container-top',
                      nonFullscreenContentClassName: 'asbplayer-notification',
                      fullscreenContainerClassName: 'asbplayer-notification-container-top',
                      fullscreenContentClassName: 'asbplayer-notification',
                      offsetAnchor: OffsetAnchor.top,
                      contentWidthPercentage: -1,
                      onMouseOver: (event: MouseEvent) => this.onMouseOver?.(event),
                      onMouseOut: (event: MouseEvent) => this.onMouseOut?.(event),
                  }
                : {
                      targetElement: this.video,
                      nonFullscreenContainerClassName: 'asbplayer-notification-container-bottom',
                      nonFullscreenContentClassName: 'asbplayer-notification',
                      fullscreenContainerClassName: 'asbplayer-notification-container-bottom',
                      fullscreenContentClassName: 'asbplayer-notification',
                      offsetAnchor: OffsetAnchor.bottom,
                      contentWidthPercentage: -1,
                      onMouseOver: (event: MouseEvent) => this.onMouseOver?.(event),
                      onMouseOut: (event: MouseEvent) => this.onMouseOut?.(event),
                  };

        return { subtitleOverlayParams, topSubtitleOverlayParams, notificationOverlayParams };
    }

    /*
    private _subtitleColorsUpdated(updatedSubtitles: RichSubtitleModel[]): void {
        for (const updatedSubtitle of updatedSubtitles) {
            if (this._getSubtitleTrackAlignment(updatedSubtitle.track) === 'bottom') {
                if (
                    this.shouldRenderBottomOverlay &&
                    this.bottomSubtitlesElementOverlay instanceof CachingElementOverlay
                ) {
                    this.bottomSubtitlesElementOverlay.uncacheHtmlKey(String(updatedSubtitle.index));
                }
            } else {
                if (this.shouldRenderTopOverlay && this.topSubtitlesElementOverlay instanceof CachingElementOverlay) {
                    this.topSubtitlesElementOverlay.uncacheHtmlKey(String(updatedSubtitle.index));
                }
            }
            if (this.showingSubtitles?.some((s) => s.index === updatedSubtitle.index)) {
                this.refreshCurrentSubtitle = true;
            }
        }
        const command: VideoToExtensionCommand<SubtitlesUpdatedFromVideoMessage> = {
            sender: 'asbplayer-video',
            message: {
                command: 'subtitlesUpdated',
                updatedSubtitles,
            },
            src: this.video.src,
        };
        browser.runtime.sendMessage(command);
    }
    */

    bind() {
        this.resizeObserver = new ResizeObserver(() => {
            this.refreshCurrentSubtitle = true;
        });
        this.resizeObserver.observe(this.video);

        document.addEventListener('click', this.handleDocumentClick);

        // this.subtitleColoring.bind();

        this.subtitlesInterval = setInterval(async () => {
            if (this.lastLoadedMessageTimestamp > 0 && Date.now() - this.lastLoadedMessageTimestamp < 1000) {
                return;
            }

            if (this.showingLoadedMessage) {
                this._setSubtitlesHtml(this.bottomSubtitlesElementOverlay, [{ html: () => '' }]);
                this._setSubtitlesHtml(this.topSubtitlesElementOverlay, [{ html: () => '' }]);
                this.showingLoadedMessage = false;
            }

            if (this.subtitles.length === 0) {
                return;
            }

            const showOffset = this.lastOffsetChangeTimestamp > 0 && Date.now() - this.lastOffsetChangeTimestamp < 1000;
            const offset = showOffset ? this._computeOffset() : 0;
            const slice = this.subtitleCollection.subtitlesAt(this.video.currentTime * 1000);
            const showingSubtitles = this._findShowingSubtitles(slice);

            // Master-Slave Synchronization Logic (Dual Subtitles)
            // Master: Track 0 (Interactive/Learning Language)
            // Slave: Track 1 (Native/Platform Language)
            const masterTrack = 0;
            const slaveTrack = 1;
            const hasMasterTrack = this.subtitles.some((s) => s.track === masterTrack);
            const hasSlaveTrack = this.subtitles.some((s) => s.track === slaveTrack);

            if (hasMasterTrack && hasSlaveTrack && this.disabledSubtitleTracks[slaveTrack] !== true) {
                const masterSub = showingSubtitles.find((s) => s.track === masterTrack);

                // Remove standard slave subtitles from showing list
                // We will replace them with a synchronized version if master is present
                // OR hide them if master is absent (Master decides timing)
                const filteredShowing = showingSubtitles.filter((s) => s.track !== slaveTrack);

                if (masterSub) {
                    // Find all slave subtitles that overlap with the master subtitle's time window
                    const overlappingSlaveSubs = this.subtitles.filter(
                        (s) => s.track === slaveTrack && s.start < masterSub.end && s.end > masterSub.start
                    );

                    if (overlappingSlaveSubs.length > 0) {
                        // Concatenate text
                        const mergedText = overlappingSlaveSubs
                            .map((s) => s.text)
                            .join(' ')
                            .replace(/\s+/g, ' ')
                            .replace(/ - /g, ' ') // Clean up floating dashes from concatenation
                            .trim();

                        if (mergedText) {
                            // Create synthetic slave subtitle synced to master
                            const syntheticSlave: IndexedSubtitleModel = {
                                ...overlappingSlaveSubs[0],
                                text: mergedText,
                                start: masterSub.start,
                                end: masterSub.end,
                                track: slaveTrack,
                                index: overlappingSlaveSubs[0].index, // Use index of first match
                            };
                            filteredShowing.push(syntheticSlave);
                        }
                    }
                }

                // Update showingSubtitles reference with our modified list
                // If masterSub was undefined, filteredShowing has no slave subs (correct: silence)
                // If masterSub defined, filteredShowing has synthetic slave (if overlap found)
                showingSubtitles.splice(0, showingSubtitles.length, ...filteredShowing);
            }

            this.onSlice?.(slice);

            if (slice.willStopShowing && this._trackEnabled(slice.willStopShowing)) {
                this.autoPauseContext.willStopShowing(slice.willStopShowing);
            }

            if (slice.startedShowing && this._trackEnabled(slice.startedShowing)) {
                this.autoPauseContext.startedShowing(slice.startedShowing);
            }

            if (slice.nextToShow && slice.nextToShow.length > 0) {
                this.onNextToShow?.(slice.nextToShow[0]);
            }

            const subtitlesAreNew =
                this.showingSubtitles === undefined ||
                !arrayEquals(showingSubtitles, this.showingSubtitles, (a, b) => a.index === b.index);

            if (subtitlesAreNew) {
                this.showingSubtitles = showingSubtitles;
                this._autoCopyToClipboard(showingSubtitles);
            }

            const shouldRenderOffset =
                (showOffset && offset !== this.showingOffset) || (!showOffset && this.showingOffset !== undefined);

            if ((!showOffset && !this._displaySubtitles) || this._forceHideSubtitles) {
                this.bottomSubtitlesElementOverlay.hide();
                this.topSubtitlesElementOverlay.hide();
            } else if (subtitlesAreNew || shouldRenderOffset || this.refreshCurrentSubtitle) {
                if (this.refreshCurrentSubtitle) {
                    this.refreshCurrentSubtitle = false;
                    if (this.bottomSubtitlesElementOverlay instanceof CachingElementOverlay) {
                        this.bottomSubtitlesElementOverlay.uncacheHtml();
                    }
                    if (this.topSubtitlesElementOverlay instanceof CachingElementOverlay) {
                        this.topSubtitlesElementOverlay.uncacheHtml();
                    }
                }
                this._resetUnblurState();
                if (this.shouldRenderBottomOverlay) {
                    const showingSubtitlesBottom = showingSubtitles.filter(
                        (s) => this._getSubtitleTrackAlignment(s.track) === 'bottom'
                    );
                    this._renderSubtitles(showingSubtitlesBottom, OffsetAnchor.bottom);
                }
                if (this.shouldRenderTopOverlay) {
                    const showingSubtitlesTop = showingSubtitles.filter(
                        (s) => this._getSubtitleTrackAlignment(s.track) === 'top'
                    );
                    this._renderSubtitles(showingSubtitlesTop, OffsetAnchor.top);
                }

                if (showOffset) {
                    this._appendSubtitlesHtml(await this._buildTextHtml(this._formatOffset(offset)));
                    this.showingOffset = offset;
                } else {
                    this.showingOffset = undefined;
                }
            }
        }, 100);
    }

    private async _renderSubtitles(subtitles: IndexedSubtitleModel[], offset: OffsetAnchor) {
        if (offset == OffsetAnchor.top) {
            this._setSubtitlesHtml(this.topSubtitlesElementOverlay, await this._buildSubtitlesHtml(subtitles));
        } else {
            this._setSubtitlesHtml(this.bottomSubtitlesElementOverlay, await this._buildSubtitlesHtml(subtitles));
        }
    }

    private _resetUnblurState() {
        if (Object.keys(this.unblurredSubtitleTracks).length === 0) {
            return;
        }

        for (const element of [
            ...this.bottomSubtitlesElementOverlay.displayingElements(),
            ...this.topSubtitlesElementOverlay.displayingElements(),
        ]) {
            const track = Number(element.dataset.track);

            if (this.unblurredSubtitleTracks[track] === true) {
                element.classList.add('asbplayer-subtitles-blurred');
            }
        }

        this.unblurredSubtitleTracks = {};
    }

    private _autoCopyToClipboard(subtitles: SubtitleModel[]) {
        if (this.autoCopyCurrentSubtitle && subtitles.length > 0 && document.hasFocus()) {
            const text = subtitles
                .map((s) => s.text)
                .filter((text) => text !== '')
                .join('\n');

            if (text !== '') {
                const command: VideoToExtensionCommand<CopyToClipboardMessage> = {
                    sender: 'asbplayer-video',
                    message: {
                        command: 'copy-to-clipboard',
                        dataUrl: `data:,${encodeURIComponent(text)}`,
                    },
                    src: this.video.src,
                };

                browser.runtime.sendMessage(command);
            }
        }
    }

    private _findShowingSubtitles(slice: SubtitleSlice<IndexedSubtitleModel>): IndexedSubtitleModel[] {
        return slice.showing.filter((s) => this._trackEnabled(s)).sort((s1, s2) => s1.track - s2.track);
    }

    private _trackEnabled(subtitle: SubtitleModel) {
        return subtitle.track === undefined || !this.disabledSubtitleTracks[subtitle.track];
    }

    private async _buildSubtitlesHtml(subtitles: IndexedSubtitleModel[]) {
        const promises = subtitles.map(async (subtitle) => {
            if (subtitle.textImage) {
                const className = this.subtitleClasses?.[subtitle.track] ?? '';
                const imageScale =
                    ((this.subtitleSettings?.imageBasedSubtitleScaleFactor ?? 1) *
                        this.video.getBoundingClientRect().width) /
                    subtitle.textImage.screen.width;
                const width = imageScale * subtitle.textImage.image.width;

                const htmlString = `
                    <div data-track="${subtitle.track ?? 0}" style="max-width:${width}px;margin:auto;" class="${className}">
                        <img
                            style="width:100%;"
                            alt="subtitle"
                            src="${subtitle.textImage.dataUrl}"
                        />
                    </div>
                `;
                return {
                    html: () => htmlString,
                    key: String(subtitle.index),
                };
            } else {
                const htmlString = await this._buildTextHtml(subtitle.text, subtitle.track, subtitle.richText);
                return {
                    html: () => htmlString,
                    key: String(subtitle.index),
                };
            }
        });

        const result = await Promise.all(promises);

        // Inject toggle button independently if secondary track exists (Track 1) and video is paused
        const hasSecondaryTrack = subtitles.some((s) => s.track === 1);
        if (hasSecondaryTrack && this.video.paused) {
            const toggleButtonHtml = `<div class="asbplayer-toggle-container"><span class="asbplayer-secondary-track-toggle" role="button" title="Toggle secondary subtitle">${this.secondarySubtitleVisible ? '▼' : '▲'}</span></div>`;
            result.unshift({
                html: () => toggleButtonHtml,
                key: 'secondary-toggle-btn',
            });
        }

        return result;
    }

    private async _buildTextHtml(text: string, track?: number, richText?: string) {
        let processedText = richText ?? text;

        if (this.htmlProcessor && !richText && (track === 0 || track === undefined)) {
            processedText = await this.htmlProcessor(text, track);
        } else if (richText && this.htmlProcessor) {
            // If we have rich text, we might still want to process it but for now let's stick to plain text
            // or strip tags? For now, if rich text exists (like ruby), we might skip or process carefully.
            // Given the requirements, let's process the plain text part if possible or just the content.
            // But usually richText overrides text.
            // Let's assume for now we only process plain text or we'd need a more complex parser.
            // The user mainly wants "words" painted.
            // If richText is present, it's usually styles/ruby.
            // Let's prioritize the processor for plain text for now as it replaces the content.
            // But we should probably not touch rich text for now.
        }

        const isSecondaryTrack = track === 1;

        if (isSecondaryTrack && !this.secondarySubtitleVisible) {
            return '';
        }
        const className = `${this._subtitleClasses(track)} ${isSecondaryTrack ? 'asbplayer-secondary-track' : ''}`;
        const style = this._subtitleStyles(track);
        const toggleButton = isSecondaryTrack
            ? `<span class="asbplayer-secondary-track-toggle" role="button" title="Toggle secondary subtitle">${this.secondarySubtitleVisible ? '▼' : '▲'}</span>`
            : '';

        const contentVal = isSecondaryTrack && !this.secondarySubtitleVisible ? '' : processedText;
        const contentStyle = isSecondaryTrack ? 'font-weight: normal !important;' : '';

        return `<div style="display:inline-block; position:relative;"><span data-track="${track ?? 0}" class="${className}" style="${style};${contentStyle}">${contentVal}</span></div>`;
    }

    private handleDocumentClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.classList.contains('asbplayer-secondary-track-toggle')) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleSecondarySubtitle();
        }
    };

    toggleSecondarySubtitle() {
        this.secondarySubtitleVisible = !this.secondarySubtitleVisible;
        this.refreshCurrentSubtitle = true;
    }

    unbind() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }

        document.removeEventListener('click', this.handleDocumentClick);

        // this.subtitleColoring.unbind();

        if (this.subtitlesInterval) {
            clearInterval(this.subtitlesInterval);
            this.subtitlesInterval = undefined;
        }

        if (this.notificationElementOverlayHideTimeout) {
            clearTimeout(this.notificationElementOverlayHideTimeout);
            this.notificationElementOverlayHideTimeout = undefined;
        }

        this.bottomSubtitlesElementOverlay.dispose();
        this.topSubtitlesElementOverlay.dispose();
        this.notificationElementOverlay.dispose();
        this.onNextToShow = undefined;
        this.onSlice = undefined;
        this.onOffsetChange = undefined;
        this.onMouseOver = undefined;
    }

    refresh() {
        if (this.shouldRenderBottomOverlay) this.bottomSubtitlesElementOverlay.refresh();
        if (this.shouldRenderTopOverlay) this.topSubtitlesElementOverlay.refresh();
        this.notificationElementOverlay.refresh();
    }

    currentSubtitle(): [IndexedSubtitleModel | null, SubtitleModel[] | null] {
        const now = 1000 * this.video.currentTime;
        let subtitle = null;
        let index = null;

        for (let i = 0; i < this.subtitles.length; ++i) {
            const s = this.subtitles[i];

            if (
                now >= s.start &&
                now < s.end &&
                (typeof s.track === 'undefined' || !this.disabledSubtitleTracks[s.track])
            ) {
                subtitle = s;
                index = i;
                break;
            }
        }

        if (subtitle === null || index === null) {
            return [null, null];
        }

        return [
            subtitle,
            surroundingSubtitles(
                this.subtitles,
                index,
                this.surroundingSubtitlesCountRadius,
                this.surroundingSubtitlesTimeRadius
            ),
        ];
    }

    unblur(track: number) {
        for (const element of [
            ...this.bottomSubtitlesElementOverlay.displayingElements(),
            ...this.topSubtitlesElementOverlay.displayingElements(),
        ]) {
            const elementTrack = Number(element.dataset.track);

            if (track === elementTrack && element.classList.contains('asbplayer-subtitles-blurred')) {
                this.unblurredSubtitleTracks[track] = true;
                element.classList.remove('asbplayer-subtitles-blurred');
            }
        }
    }

    offset(offset: number, skipNotifyPlayer = false) {
        if (!this.subtitles || this.subtitles.length === 0) {
            return;
        }

        this.subtitles = this.subtitles.map((s) => ({
            text: s.text,
            textImage: s.textImage,
            start: s.originalStart + offset,
            originalStart: s.originalStart,
            end: s.originalEnd + offset,
            originalEnd: s.originalEnd,
            track: s.track,
            index: s.index,
        }));

        this.lastOffsetChangeTimestamp = Date.now();

        if (!skipNotifyPlayer) {
            const command: VideoToExtensionCommand<OffsetFromVideoMessage> = {
                sender: 'asbplayer-video',
                message: {
                    command: 'offset',
                    value: offset,
                },
                src: this.video.src,
            };

            browser.runtime.sendMessage(command);
        }

        this.onOffsetChange?.();

        this.settings.getSingle('rememberSubtitleOffset').then((rememberSubtitleOffset) => {
            if (rememberSubtitleOffset) {
                this.settings.set({ lastSubtitleOffset: offset });
            }
        });
    }

    private _computeOffset(): number {
        if (!this.subtitles || this.subtitles.length === 0) {
            return 0;
        }

        const s = this.subtitles[0];
        return s.start - s.originalStart;
    }

    private _formatOffset(offset: number): string {
        const roundedOffset = Math.floor(offset);
        return roundedOffset >= 0 ? '+' + roundedOffset + ' ms' : roundedOffset + ' ms';
    }

    async notification(locKey: string, replacements?: { [key: string]: string }) {
        const text = i18n.t(locKey, replacements ?? {});
        this.notificationElementOverlay.setHtml([{ html: () => text }]); // Simplified, or use _buildTextHtml
        // Actually, notification probably doesn't need external processing, it's UI text.
        // But if we want consistent styling...
        // The original code was: { html: () => this._buildTextHtml(text) } which means it used the styling.
        // Let's assume notifications don't need the Metheus colorizer (it's not subtitle text).
        // But _buildTextHtml applies style settings (size, color).
        // So we might want to keep it.
        const html = await this._buildTextHtml(text);
        this.notificationElementOverlay.setHtml([{ html: () => html }]);

        if (this.notificationElementOverlayHideTimeout) {
            clearTimeout(this.notificationElementOverlayHideTimeout);
        }

        this.notificationElementOverlayHideTimeout = setTimeout(() => {
            this.notificationElementOverlay.hide();
            this.notificationElementOverlayHideTimeout = undefined;
        }, 3000);
    }

    async showLoadedMessage(nonEmptyTrackIndex: number[]) {
        if (!this.subtitleFileNames) {
            return;
        }

        let loadedMessage: string;

        const nonEmptySubtitleFileNames: string[] = this._nonEmptySubtitleNames(nonEmptyTrackIndex);

        if (nonEmptySubtitleFileNames.length === 0) {
            loadedMessage = this.subtitleFileNames[0];
        } else {
            loadedMessage = nonEmptySubtitleFileNames.join('<br>');
        }

        if (this.subtitles.length > 0) {
            const offset = this.subtitles[0].start - this.subtitles[0].originalStart;

            if (offset !== 0) {
                loadedMessage += `<br>${this._formatOffset(offset)}`;
            }
        }

        const overlay =
            this._getSubtitleTrackAlignment(0) === 'bottom'
                ? this.bottomSubtitlesElementOverlay
                : this.topSubtitlesElementOverlay;

        const html = await this._buildTextHtml(loadedMessage);

        this._setSubtitlesHtml(overlay, [
            {
                html: () => html,
            },
        ]);
        this.showingLoadedMessage = true;
        this.lastLoadedMessageTimestamp = Date.now();
    }

    private _nonEmptySubtitleNames(nonEmptyTrackIndex: number[]) {
        if (nonEmptyTrackIndex.length === 0) return [];

        const nonEmptySubtitleFileNames = [];
        for (let i = 0; i < nonEmptyTrackIndex.length; i++) {
            nonEmptySubtitleFileNames.push(this.subtitleFileNames![nonEmptyTrackIndex[i]]);
        }

        return nonEmptySubtitleFileNames;
    }

    private _setSubtitlesHtml(subtitlestOverlay: ElementOverlay, htmls: KeyedHtml[]) {
        subtitlestOverlay.setHtml(htmls);
    }

    private _appendSubtitlesHtml(html: string) {
        if (this.shouldRenderBottomOverlay) this.bottomSubtitlesElementOverlay.appendHtml(html);
        if (this.shouldRenderTopOverlay) this.topSubtitlesElementOverlay.appendHtml(html);
    }

    private _subtitleClasses(track?: number) {
        if (track === undefined || this.subtitleClasses === undefined) {
            return '';
        }

        return this.subtitleClasses[track] ?? this.subtitleClasses;
    }

    private _subtitleStyles(track?: number) {
        if (this.subtitleStyles === undefined) {
            return '';
        }

        let style =
            (track === undefined ? this.subtitleStyles[0] : (this.subtitleStyles[track] ?? this.subtitleStyles[0])) ??
            '';

        // Force Slave Track (Track 1) to be 6px smaller than Master Track (Track 0)
        if (track === 1) {
            const masterStyle = this.subtitleStyles[0] || '';
            const masterSizeMatch = masterStyle.match(/font-size:\s*(\d+)px/);

            if (masterSizeMatch && masterSizeMatch[1]) {
                const masterSize = parseInt(masterSizeMatch[1], 10);
                const slaveSize = Math.max(10, masterSize - 6); // Ensure doesn't go too small
                style += `; font-size: ${slaveSize}px !important;`;
            }
        }

        return (
            style +
            '; padding: 0.35em 0.6em; border-radius: 8px; line-height: 1.85 !important; -webkit-box-decoration-break: clone; box-decoration-break: clone;'
        );
    }

    intersects(clientX: number, clientY: number): boolean {
        const bottomContainer = this.bottomSubtitlesElementOverlay.containerElement;

        if (bottomContainer !== undefined && _intersects(clientX, clientY, bottomContainer)) {
            return true;
        }

        const topContainer = this.topSubtitlesElementOverlay.containerElement;

        if (topContainer !== undefined && _intersects(clientX, clientY, topContainer)) {
            return true;
        }

        return false;
    }
}
