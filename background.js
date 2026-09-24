// background.js
// Service worker. Owns per-tab state and the tab-capture lifecycle.
//
// How boosting works (v2):
// Instead of injecting a content script and rewiring <video>/<audio> elements
// through Web Audio (which silently fails when the media is cross-origin
// without CORS headers, when the site uses Web Audio itself, or when the
// autoplay policy keeps our AudioContext suspended), we capture the tab's
// audio output with chrome.tabCapture and re-play it through a gain/EQ chain
// in an offscreen document. Anything the tab plays gets boosted, no matter
// where it's served from or how the page is built.
//
// While a tab is captured, Chrome routes its audio through us (the tab shows
// the "sharing" indicator). Reset releases the tab and restores native audio.

const DEFAULTS = { volume: 100, muted: false, bassBoost: false, voiceBoost: false };
const OFFSCREEN_URL = "offscreen.html";
const store = chrome.storage.session; // tab ids don't outlive the browser session
const key = (tabId) => `tab_${tabId}`;

// ── STATE ──
async function getState(tabId) {
  const result = await store.get(key(tabId));
  return { ...DEFAULTS, ...(result[key(tabId)] || {}) };
}

// Per-tab write queue so rapid updates (slider drag + boost toggle) can't
// interleave their get/merge/set and clobber each other.
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

function isDefault(s) {
  return s.volume === 100 && !s.muted && !s.bassBoost && !s.voiceBoost;
}

// ── OFFSCREEN DOCUMENT ──
async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}

let creating = null;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ["USER_MEDIA"],
        justification: "Capture the tab's audio and re-play it through a volume/EQ chain",
      })
      .catch((e) => {
        // Raced with another create. Fine, it exists now.
        if (!/single offscreen|already exists/i.test(String(e && e.message))) throw e;
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

function toOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

async function isCaptured(tabId) {
  if (!(await hasOffscreen())) return false;
  try {
    const r = await toOffscreen({ type: "QUERY", tabId });
    return Boolean(r && r.captured);
  } catch (e) {
    return false;
  }
}

// ── CAPTURE ──
// Serialize starts per tab so a slider drag doesn't request ten stream ids.
const starting = new Map();

async function applyToTab(tabId, state) {
  if (await isCaptured(tabId)) {
    await toOffscreen({ type: "APPLY_STATE", tabId, state });
    return;
  }
  if (starting.has(tabId)) {
    await starting.get(tabId);
    await toOffscreen({ type: "APPLY_STATE", tabId, state });
    return;
  }
  // Nothing to do for a tab we haven't touched and that is at defaults.
  if (isDefault(state)) return;

  const p = (async () => {
    await ensureOffscreen();
    // Requires the extension to have been invoked on this tab (opening the
    // popup does that via activeTab). Throws on chrome://, the Web Store, etc.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const r = await toOffscreen({ type: "START_CAPTURE", tabId, streamId, state });
    if (!r || !r.ok) throw new Error((r && r.error) || "Capture failed");
  })().finally(() => starting.delete(tabId));
  starting.set(tabId, p);
  await p;
}

async function stopCapture(tabId) {
  if (!(await hasOffscreen())) return;
  try {
    await toOffscreen({ type: "STOP_CAPTURE", tabId });
    const r = await toOffscreen({ type: "COUNT" });
    // Tear the document down when nothing is captured and nothing is starting.
    if (r && r.count === 0 && starting.size === 0) await chrome.offscreen.closeDocument();
  } catch (e) {
    // offscreen doc already gone
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  store.remove(key(tabId));
  queues.delete(tabId);
  stopCapture(tabId);
});

// ── MESSAGES (from the popup and the offscreen document) ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  if (message.target === "offscreen") return false; // not for us
  handle(message, sender).then(sendResponse, (e) =>
    sendResponse({ ok: false, error: friendlyError(e) })
  );
  return true; // async response
});

function friendlyError(e) {
  const msg = String((e && e.message) || e);
  if (/not been invoked|activeTab/i.test(msg)) return "Open the popup on the tab you want to boost";
  if (/cannot be captured|chrome:\/\/|not supported/i.test(msg)) return "This page can't be captured";
  return msg;
}

async function handle(message, sender) {
  switch (message.type) {
    case "GET_VOLUME": {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId == null) return { ...DEFAULTS, capturing: false };
      const state = await getState(tabId);
      return { ...state, capturing: await isCaptured(tabId) };
    }

    case "SET_VOLUME": {
      const { tabId, volume, muted } = message;
      const state = await updateState(tabId, { volume, muted });
      await applyToTab(tabId, state);
      return { ok: true };
    }

    case "SET_BASS_BOOST": {
      const { tabId, enabled } = message;
      const state = await updateState(tabId, { bassBoost: enabled });
      await applyToTab(tabId, state);
      return { ok: true };
    }

    case "SET_VOICE_BOOST": {
      const { tabId, enabled } = message;
      const state = await updateState(tabId, { voiceBoost: enabled });
      await applyToTab(tabId, state);
      return { ok: true };
    }

    case "RESET": {
      // Back to defaults AND release the tab so native audio resumes.
      const { tabId } = message;
      await store.remove(key(tabId));
      await stopCapture(tabId);
      return { ok: true };
    }

    case "CAPTURE_ENDED": {
      // Offscreen doc tells us Chrome ended a stream (tab closed, etc.).
      // State is kept; the next change from the popup re-captures.
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unknown message " + message.type };
  }
}
