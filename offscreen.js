// offscreen.js
// Runs in the (invisible) offscreen document. Holds one tab-capture stream and
// one Web Audio chain per boosted tab:
//
//   tab audio → MediaStreamSource → gainNode → bassFilter → voiceFilter → speakers
//
// Chrome mutes a tab's native output while it is captured, so what you hear is
// exactly this chain. Stopping the tracks hands the audio back to the tab.

const BASS_FREQ  = 80,   BASS_GAIN  = 10;
const VOICE_FREQ = 2500, VOICE_GAIN = 8;

// tabId → { stream, ctx, gain, bass, voice }
const captures = new Map();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function targetGain(state) {
  return state.muted ? 0 : Math.max(0, num(state.volume, 100)) / 100;
}

function apply(tabId, state, immediate = false) {
  const c = captures.get(tabId);
  if (!c) return;
  const g = targetGain(state);
  const b = state.bassBoost ? BASS_GAIN : 0;
  const v = state.voiceBoost ? VOICE_GAIN : 0;
  if (immediate) {
    c.gain.gain.value = g;
    c.bass.gain.value = b;
    c.voice.gain.value = v;
    return;
  }
  const t = c.ctx.currentTime;
  c.gain.gain.setTargetAtTime(g, t, 0.01);
  c.bass.gain.setTargetAtTime(b, t, 0.02);
  c.voice.gain.setTargetAtTime(v, t, 0.02);
}

function cleanup(c) {
  try { c.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { c.ctx.close(); } catch (e) {}
}

function stop(tabId) {
  const c = captures.get(tabId);
  if (!c) return;
  captures.delete(tabId);
  cleanup(c);
}

async function start(tabId, streamId, state) {
  if (captures.has(tabId)) {
    apply(tabId, state);
    return;
  }

  // Non-standard but documented Chrome constraints for consuming a
  // chrome.tabCapture stream id from an extension page.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);

  const gain = ctx.createGain();

  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = BASS_FREQ;

  const voice = ctx.createBiquadFilter();
  voice.type = "peaking";
  voice.frequency.value = VOICE_FREQ;
  voice.Q.value = 1.0;

  source.connect(gain);
  gain.connect(bass);
  bass.connect(voice);
  voice.connect(ctx.destination);

  const entry = { stream, ctx, gain, bass, voice };
  captures.set(tabId, entry);
  apply(tabId, state, true);
  ctx.resume().catch(() => {});

  // Chrome ends the track when the tab closes or capture is revoked.
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (captures.get(tabId) !== entry) return;
      captures.delete(tabId);
      cleanup(entry);
      chrome.runtime.sendMessage({ type: "CAPTURE_ENDED", tabId }).catch(() => {});
    });
  });
}

async function handle(m) {
  switch (m.type) {
    case "QUERY":
      return { captured: captures.has(m.tabId) };
    case "COUNT":
      return { count: captures.size };
    case "START_CAPTURE":
      await start(m.tabId, m.streamId, m.state || {});
      return { ok: true };
    case "APPLY_STATE":
      apply(m.tabId, m.state || {});
      return { ok: true };
    case "STOP_CAPTURE":
      stop(m.tabId);
      return { ok: true };
    default:
      return { ok: false, error: "Unknown message " + m.type };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return false;
  handle(message).then(sendResponse, (e) =>
    sendResponse({ ok: false, error: String((e && e.message) || e) })
  );
  return true; // async response
});
