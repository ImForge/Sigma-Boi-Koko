// content.js
// Runs in every frame of every page (extension isolated world).
//
// Audio chain, built lazily — only once this tab is actually boosted, muted
// or EQ'd:
//   <video>/<audio> → MediaElementSource → gainNode → bassFilter → voiceFilter → destination
//
// Why lazy: routing a media element through Web Audio is one-way and has side
// effects — cross-origin media without CORS headers goes silent, pages that
// use Web Audio themselves can no longer connect the element, and a suspended
// AudioContext silences autoplay. So we leave the page's audio path completely
// untouched until the user changes something for this tab.
//
// Note: content scripts run in an isolated world, so patching
// window.AudioContext here is never seen by page scripts. The old Proxy hook
// on the constructor was dead code and has been removed.

(function () {
  if (window.__sigmaBOIKOKO_injected) return;
  window.__sigmaBOIKOKO_injected = true;

  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
  if (!OriginalAudioContext) return;

  const BASS_FREQ  = 80,   BASS_GAIN  = 10;
  const VOICE_FREQ = 2500, VOICE_GAIN = 8;

  // Desired state for this tab — mirrors what background.js has stored.
  let volume       = 100;
  let muted        = false;
  let bassBoostOn  = false;
  let voiceBoostOn = false;

  let audioCtx    = null;
  let gainNode    = null;
  let bassFilter  = null;
  let voiceFilter = null;

  // Media elements already routed (or that we tried to route) through the chain.
  const hooked = new WeakSet();

  // Autoplay policy: an AudioContext created before a user gesture starts
  // suspended. We only call resume() after a gesture on the page or an
  // explicit change from the popup, so we don't spam the console at load.
  let resumeAllowed = false;

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function isDefaultState() {
    return volume === 100 && !muted && !bassBoostOn && !voiceBoostOn;
  }
  function targetGain() {
    return muted ? 0 : Math.max(0, volume) / 100;
  }
  // Once the chain exists we keep routing new media elements through it
  // (gain 1.0 is a transparent passthrough); before that, only when needed.
  function shouldHook() {
    return audioCtx !== null || !isDefaultState();
  }

  function safeResume() {
    if (!resumeAllowed || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function onFirstGesture() {
    resumeAllowed = true;
    safeResume();
  }
  ["click", "keydown", "pointerdown", "touchstart"].forEach((evt) => {
    document.addEventListener(evt, onFirstGesture, { passive: true, capture: true });
  });

  function ensureChain() {
    if (audioCtx) return true;
    let ctx;
    try {
      ctx = new OriginalAudioContext();
    } catch (e) {
      return false;
    }

    gainNode = ctx.createGain();
    gainNode.gain.value = targetGain();

    bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = BASS_FREQ;
    bassFilter.gain.value = bassBoostOn ? BASS_GAIN : 0;

    voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = "peaking";
    voiceFilter.frequency.value = VOICE_FREQ;
    voiceFilter.Q.value = 1.0;
    voiceFilter.gain.value = voiceBoostOn ? VOICE_GAIN : 0;

    gainNode.connect(bassFilter);
    bassFilter.connect(voiceFilter);
    voiceFilter.connect(ctx.destination);

    audioCtx = ctx;
    return true;
  }

  function hookMediaElement(el) {
    if (hooked.has(el)) return;
    if (!ensureChain()) return;
    hooked.add(el); // mark even on failure so we don't retry on every scan
    try {
      audioCtx.createMediaElementSource(el).connect(gainNode);
    } catch (e) {
      // Element already belongs to another AudioContext (the page's own EQ /
      // visualiser). Nothing we can do — leave the page's audio alone.
      return;
    }
    // Playback starting is a good moment to make sure our context is running.
    el.addEventListener("play", safeResume, { passive: true });
    safeResume();
  }

  function forEachMedia(root, fn) {
    root.querySelectorAll?.("video, audio").forEach(fn);
  }

  function hookAll() {
    if (!shouldHook()) return;
    forEachMedia(document, hookMediaElement);
  }

  function applyState() {
    if (!shouldHook()) return; // default state, nothing routed → stay hands-off
    hookAll();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    gainNode.gain.setTargetAtTime(targetGain(), t, 0.01);
    bassFilter.gain.setTargetAtTime(bassBoostOn ? BASS_GAIN : 0, t, 0.02);
    voiceFilter.gain.setTargetAtTime(voiceBoostOn ? VOICE_GAIN : 0, t, 0.02);
    safeResume();
  }

  // Media elements added dynamically (SPAs, embedded players).
  new MutationObserver((mutations) => {
    if (!shouldHook()) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.("video, audio")) hookMediaElement(node);
        forEachMedia(node, hookMediaElement);
      }
    }
  }).observe(document, { childList: true, subtree: true });

  // Belt-and-braces scan for anything the observer missed (X/Twitter
  // re-parents players in ways that don't always surface as addedNodes).
  setInterval(hookAll, 2000);

  // Changes pushed from the popup via background.js.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return;
    switch (message.type) {
      case "APPLY_VOLUME":
        volume = num(message.volume, 100);
        muted  = Boolean(message.muted);
        break;
      case "APPLY_BASS_BOOST":
        bassBoostOn = Boolean(message.enabled);
        break;
      case "APPLY_VOICE_BOOST":
        voiceBoostOn = Boolean(message.enabled);
        break;
      default:
        return;
    }
    // The user just interacted with the popup — worth trying to resume.
    resumeAllowed = true;
    applyState();
  });

  // Restore this tab's saved state after a reload / navigation.
  try {
    chrome.runtime.sendMessage({ type: "GET_VOLUME" }, (state) => {
      if (chrome.runtime.lastError || !state) return;
      volume       = num(state.volume, 100);
      muted        = Boolean(state.muted);
      bassBoostOn  = Boolean(state.bassBoost);
      voiceBoostOn = Boolean(state.voiceBoost);
      applyState();
    });
  } catch (e) {
    // Extension context invalidated (extension was reloaded under this page).
  }
})();
