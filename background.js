// background.js
// Service worker — the single source of truth for per-tab state
// (volume, mute, bass boost, voice boost). Relays popup changes to the
// content script(s) in that tab and hands saved state back to a tab
// after it reloads, so settings survive navigation within a tab.

const DEFAULTS = { volume: 100, muted: false, bassBoost: false, voiceBoost: false };
const key = (tabId) => `tab_${tabId}`;

// storage.session: lives for the browser session only, which is exactly the
// lifetime of a tab id. No stale tab_* keys pile up across restarts.
const store = chrome.storage.session;

async function getState(tabId) {
  const result = await store.get(key(tabId));
  return { ...DEFAULTS, ...(result[key(tabId)] || {}) };
}

// Per-tab write queue. A storage get→merge→set is async, so two rapid
// updates (slider drag + bass toggle) could otherwise interleave and one
// would overwrite the other's fields with stale data.
const queues = new Map();
function updateState(tabId, patch) {
  const prev = queues.get(tabId) || Promise.resolve();
  const next = prev
    .then(async () => {
      const state = { ...(await getState(tabId)), ...patch };
      await store.set({ [key(tabId)]: state });
      return state;
    })
    .catch(() => ({ ...DEFAULTS, ...patch }));
  queues.set(tabId, next);
  next.finally(() => {
    if (queues.get(tabId) === next) queues.delete(tabId);
  });
  return next;
}

// No frameId → delivered to every frame in the tab, so embedded players
// (YouTube embeds, X/Twitter cards, etc.) get the change too.
function pushToTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
  store.remove(key(tabId));
  queues.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  switch (message.type) {
    case "GET_VOLUME": {
      // From the popup (tabId in the message), or from a content script
      // asking for its own tab's saved state after a (re)load.
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId == null) {
        sendResponse({ ...DEFAULTS });
        return false;
      }
      getState(tabId).then(sendResponse, () => sendResponse({ ...DEFAULTS }));
      return true; // async response
    }

    case "SET_VOLUME": {
      const { tabId, volume, muted } = message;
      if (tabId == null) return false;
      updateState(tabId, { volume, muted });
      pushToTab(tabId, { type: "APPLY_VOLUME", volume, muted });
      sendResponse({ ok: true });
      return false;
    }

    case "SET_BASS_BOOST": {
      const { tabId, enabled } = message;
      if (tabId == null) return false;
      updateState(tabId, { bassBoost: enabled });
      pushToTab(tabId, { type: "APPLY_BASS_BOOST", enabled });
      sendResponse({ ok: true });
      return false;
    }

    case "SET_VOICE_BOOST": {
      const { tabId, enabled } = message;
      if (tabId == null) return false;
      updateState(tabId, { voiceBoost: enabled });
      pushToTab(tabId, { type: "APPLY_VOICE_BOOST", enabled });
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});
