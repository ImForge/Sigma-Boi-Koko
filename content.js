// content.js
// Audio chain: source → gainNode → bassFilter → voiceFilter → destination
//
// Browser autoplay policy: AudioContext starts suspended until a user gesture.
// We only call resume() from inside actual user-gesture event handlers,
// never from timers/intervals (which would throw the error you saw).

(function () {
  if (window.__sigmaBOIKOKO_injected) return;
  window.__sigmaBOIKOKO_injected = true;

  let audioCtx    = null;
  let gainNode    = null;
  let bassFilter  = null;
  let voiceFilter = null;

  let currentGain  = 1.0;
  let bassBoostOn  = false;
  let voiceBoostOn = false;

  const BASS_FREQ  = 80,   BASS_GAIN  = 10;
  const VOICE_FREQ = 2500, VOICE_GAIN = 8;

  // Track whether we've gotten at least one user gesture on this page.
  // Once true, all future audio contexts can be resumed safely.
  let userGestureSeen = false;

  // ── SAFE RESUME ──
  // Only resumes if we've already seen a user gesture. Silently no-ops otherwise.
  // This prevents the "must be resumed after user gesture" console error.
  function safeResume() {
    if (!userGestureSeen) return;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  // ── USER GESTURE LISTENERS ──
  // First real user interaction unlocks audio for the rest of the page session.
  function onFirstGesture() {
    userGestureSeen = true;
    safeResume();
  }

  const GESTURE_EVENTS = ["click", "keydown", "pointerdown", "touchstart"];
  GESTURE_EVENTS.forEach(evt => {
    document.addEventListener(evt, onFirstGesture, { passive: true, capture: true });
  });

  // ── BUILD AUDIO CHAIN ──
  function buildChain(ctx) {
    audioCtx = ctx;

    gainNode = ctx.createGain();
    gainNode.gain.value = currentGain;

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
  }

  function connectSource(source) {
    if (!gainNode) return;
    source.connect(gainNode);
  }

  // ── HOOK AudioContext CONSTRUCTOR ──
  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
  if (!OriginalAudioContext) return;

  window.AudioContext = window.webkitAudioContext = new Proxy(OriginalAudioContext, {
    construct(Target, args) {
      const ctx = new Target(...args);
      buildChain(ctx);

      const origCMES = ctx.createMediaElementSource.bind(ctx);
      ctx.createMediaElementSource = function (el) {
        const source = origCMES(el);
        connectSource(source);
        return source;
      };

      const origCMSS = ctx.createMediaStreamSource.bind(ctx);
      ctx.createMediaStreamSource = function (stream) {
        const source = origCMSS(stream);
        connectSource(source);
        return source;
      };

      return ctx;
    }
  });

  // ── HOOK MEDIA ELEMENTS DIRECTLY ──
  function hookMediaElement(el) {
    if (el.__sbk_hooked) return;
    el.__sbk_hooked = true;

    if (!audioCtx) {
      try {
        const ctx = new OriginalAudioContext();
        buildChain(ctx);
      } catch (e) {
        return;
      }
    }

    try {
      const source = audioCtx.createMediaElementSource(el);
      connectSource(source);
      safeResume();
    } catch (e) {
      // Cross-origin / already connected — ignore
    }
  }

  document.querySelectorAll("video, audio").forEach(hookMediaElement);

  // Watch for new media elements appearing dynamically
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.("video, audio")) hookMediaElement(node);
        node.querySelectorAll?.("video, audio").forEach(hookMediaElement);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Periodic scan for any unhooked media elements (X/Twitter, embedded players)
  // This only HOOKS — it does NOT call resume() without a gesture.
  setInterval(() => {
    document.querySelectorAll("video, audio").forEach(el => {
      if (!el.__sbk_hooked) hookMediaElement(el);
    });
  }, 2000);

  // ── MESSAGE HANDLER ──
  // Messages from the popup count as a user-initiated event,
  // so we can safely resume here too.
  chrome.runtime.onMessage.addListener((message) => {
    // Treat any popup interaction as a user gesture
    userGestureSeen = true;

    if (message.type === "APPLY_VOLUME") {
      currentGain = message.volume / 100;
      if (gainNode) {
        gainNode.gain.setTargetAtTime(currentGain, audioCtx.currentTime, 0.01);
      }
      safeResume();
    }

    if (message.type === "APPLY_BASS_BOOST") {
      bassBoostOn = message.enabled;
      if (bassFilter) {
        bassFilter.gain.setTargetAtTime(
          bassBoostOn ? BASS_GAIN : 0,
          audioCtx.currentTime, 0.02
        );
      }
      safeResume();
    }

    if (message.type === "APPLY_VOICE_BOOST") {
      voiceBoostOn = message.enabled;
      if (voiceFilter) {
        voiceFilter.gain.setTargetAtTime(
          voiceBoostOn ? VOICE_GAIN : 0,
          audioCtx.currentTime, 0.02
        );
      }
      safeResume();
    }
  });

})();
