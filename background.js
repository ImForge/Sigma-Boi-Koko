// background.js
// Service worker — stores per-tab state (volume, mute, bass boost, voice boost)
// and relays messages between popup and content scripts.

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tab_${tabId}`);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.storage.local.remove(`tab_${tabId}`);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GET_VOLUME") {
    const tabId = message.tabId;
    chrome.storage.local.get(`tab_${tabId}`, (result) => {
      const data = result[`tab_${tabId}`];
      if (data) {
        sendResponse({
          volume:     data.volume     ?? 100,
          muted:      data.muted      ?? false,
          bassBoost:  data.bassBoost  ?? false,
          voiceBoost: data.voiceBoost ?? false,
        });
      } else {
        sendResponse({ volume: 100, muted: false, bassBoost: false, voiceBoost: false });
      }
    });
    return true;
  }

  if (message.type === "SET_VOLUME") {
    const { tabId, volume, muted } = message;

    // Merge into existing state so boost flags aren't wiped
    chrome.storage.local.get(`tab_${tabId}`, (result) => {
      const existing = result[`tab_${tabId}`] || {};
      chrome.storage.local.set({
        [`tab_${tabId}`]: { ...existing, volume, muted }
      });
    });

    chrome.tabs.sendMessage(tabId, {
      type: "APPLY_VOLUME",
      volume: muted ? 0 : volume,
      muted
    }).catch(() => {});

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SET_BASS_BOOST") {
    const { tabId, enabled } = message;

    chrome.storage.local.get(`tab_${tabId}`, (result) => {
      const existing = result[`tab_${tabId}`] || {};
      chrome.storage.local.set({
        [`tab_${tabId}`]: { ...existing, bassBoost: enabled }
      });
    });

    chrome.tabs.sendMessage(tabId, {
      type: "APPLY_BASS_BOOST",
      enabled
    }).catch(() => {});

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SET_VOICE_BOOST") {
    const { tabId, enabled } = message;

    chrome.storage.local.get(`tab_${tabId}`, (result) => {
      const existing = result[`tab_${tabId}`] || {};
      chrome.storage.local.set({
        [`tab_${tabId}`]: { ...existing, voiceBoost: enabled }
      });
    });

    chrome.tabs.sendMessage(tabId, {
      type: "APPLY_VOICE_BOOST",
      enabled
    }).catch(() => {});

    sendResponse({ ok: true });
    return true;
  }

});
