// content.js
// Audio engine. Runs inside every webpage.
// Chain: source → gainNode → bassFilter → voiceFilter → destination
//
// GainNode        — controls overall volume (0–6x)
// bassFilter      — BiquadFilter lowshelf  @ 80Hz,  boosts bass frequencies
// voiceFilter     — BiquadFilter peaking   @ 2.5kHz, boosts vocal clarity

(function () {
  if (window.__sigmaBOIKOKO_injected) return;
  window.__sigmaBOIKOKO_injected = true;

  let audioCtx    = null;
  let gainNode    = null;
  let bassFilter  = null;
  let voiceFilter = null;

  // Current state — stored so late-arriving audio elements get the right settings
  let currentGain       = 1.0;
  let bassBoostOn       = false;
  let voiceBoostOn      = false;

  // Bass boost settings: lowshelf filter at 80Hz, +10dB gain when on
  const BASS_FREQ  = 80;
  const BASS_GAIN  = 10;

  // Voice boost settings: peaking filter at 2500Hz, +8dB gain when on
  const VOICE_FREQ = 2500;
  const VOICE_GAIN = 8;

  // Build the full audio node chain on a given AudioContext
  function buildChain(ctx) {
    audioCtx = ctx;

    // 1. Gain node — volume control
    gainNode = ctx.createGain();
    gainNode.gain.value = currentGain;

    // 2. Bass filter — lowshelf boosts everything below BASS_FREQ
    bassFilter = ctx.createBiquadFilter();
    bassFilter.type      = "lowshelf";
    bassFilter.frequency.value = BASS_FREQ;
    bassFilter.gain.value = bassBoostOn ? BASS_GAIN : 0;

    // 3. Voice filter — peaking EQ centered at VOICE_FREQ
    voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type      = "peaking";
    voiceFilter.frequency.value = VOICE_FREQ;
    voiceFilter.Q.value   = 1.0; // Width of the boost band
    voiceFilter.gain.value = voiceBoostOn ? VOICE_GAIN : 0;

    // Wire them together: gain → bass → voice → speakers
    gainNode.connect(bassFilter);
    bassFilter.connect(voiceFilter);
    voiceFilter.connect(ctx.destination);
  }

  // Connect a source node into the start of our chain
  function connectSource(source) {
    if (!gainNode) return;
    source.connect(gainNode);
  }

  // Hook AudioContext constructor so we catch pages that create their own
  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
  if (!OriginalAudioContext) return;

  window.AudioContext = window.webkitAudioContext = new Proxy(OriginalAudioContext, {
    construct(Target, args) {
      const ctx = new Target(...args);
      buildChain(ctx);

      // Hook createMediaElementSource (<video>, <audio> tags)
      const origCMES = ctx.createMediaElementSource.bind(ctx);
      ctx.createMediaElementSource = function (el) {
        const source = origCMES(el);
        connectSource(source);
        return source;
      };

      // Hook createMediaStreamSource (WebRTC, mic)
      const origCMSS = ctx.createMediaStreamSource.bind(ctx);
      ctx.createMediaStreamSource = function (stream) {
        const source = origCMSS(stream);
        connectSource(source);
        return source;
      };

      return ctx;
    }
  });

  // Hook media elements that already exist or appear later in the DOM
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
    } catch (e) {
      // Cross-origin or already-connected element — ignore
    }
  }

  document.querySelectorAll("video, audio").forEach(hookMediaElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("video, audio")) hookMediaElement(node);
        node.querySelectorAll?.("video, audio").forEach(hookMediaElement);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen for messages from background.js
  chrome.runtime.onMessage.addListener((message) => {

    if (message.type === "APPLY_VOLUME") {
      currentGain = message.volume / 100;
      if (gainNode) {
        gainNode.gain.setTargetAtTime(currentGain, audioCtx.currentTime, 0.01);
      }
      if (audioCtx?.state === "suspended") audioCtx.resume();
    }

    if (message.type === "APPLY_BASS_BOOST") {
      bassBoostOn = message.enabled;
      if (bassFilter) {
        // Smooth ramp to avoid clicks
        bassFilter.gain.setTargetAtTime(
          bassBoostOn ? BASS_GAIN : 0,
          audioCtx.currentTime,
          0.02
        );
      }
      if (audioCtx?.state === "suspended") audioCtx.resume();
    }

    if (message.type === "APPLY_VOICE_BOOST") {
      voiceBoostOn = message.enabled;
      if (voiceFilter) {
        voiceFilter.gain.setTargetAtTime(
          voiceBoostOn ? VOICE_GAIN : 0,
          audioCtx.currentTime,
          0.02
        );
      }
      if (audioCtx?.state === "suspended") audioCtx.resume();
    }

  });

})();
