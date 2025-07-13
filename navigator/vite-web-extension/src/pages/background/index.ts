import Browser from 'webextension-polyfill';

console.log('background script loaded');

Browser.runtime.onInstalled.addListener(async () => {
  // @ts-ignore
  if (Browser.sidePanel) {
    try {
      // @ts-ignore
      await Browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
      console.error('Error setting side panel behavior:', error);
    }
  }
});

Browser.action.onClicked.addListener((tab) => {
  // @ts-ignore
  if (!Browser.sidePanel) {
    Browser.windows.create({
      url: Browser.runtime.getURL('src/pages/popup/index.html'),
      type: 'popup',
      width: 400,
      height: 600
    });
  }
});
