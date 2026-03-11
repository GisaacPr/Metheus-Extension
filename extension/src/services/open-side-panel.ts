export const openChromeSidePanel = () => {
    // Keep the sidePanel.open call synchronous with the user gesture.
    return browser.sidePanel.open({ windowId: browser.windows.WINDOW_ID_CURRENT });
};
