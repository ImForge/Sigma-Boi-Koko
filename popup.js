// popup.js

const volumeSlider  = document.getElementById("volumeSlider");
const volumeNumber  = document.getElementById("volumeNumber");
const trackFill     = document.getElementById("trackFill");
const statusLine    = document.getElementById("statusLine");
const muteBtn       = document.getElementById("muteBtn");
const muteLabel     = document.getElementById("muteLabel");
const speakerIcon   = document.getElementById("speakerIcon");
const resetBtn      = document.getElementById("resetBtn");
const tabBadge      = document.getElementById("tabBadge");
const bassBtn       = document.getElementById("bassBtn");
const voiceBtn      = document.getElementById("voiceBtn");
const volInput      = document.getElementById("volInput");
const setBtn        = document.getElementById("setBtn");

const CONTROLS = [volumeSlider, volInput, setBtn, muteBtn, resetBtn, bassBtn, voiceBtn];

// Slider range. The custom input deliberately has no upper cap.
const MAX_VOL = 1000;

let currentTabId     = null;
let currentVolume    = 100;
let isMuted          = false;
let volumeBeforeMute = 100;
let bassOn           = false;
let voiceOn          = false;
let lastError        = "";

// ── UI RENDER ──
function updateUI(volume, muted) {
  currentVolume = volume;
  isMuted = muted;
  volumeNumber.textContent = volume;
  volInput.value = volume;

  // Slider: clamp to max for visual. Values above max just pin to the end.
  volumeSlider.value = Math.min(volume, MAX_VOL);

  const fillPct = Math.min((volume / MAX_VOL) * 100, 100);
  trackFill.style.width = muted ? "0%" : fillPct + "%";
  trackFill.classList.toggle("boosted", volume > 100 && !muted);
  trackFill.classList.toggle("muted", muted);

  statusLine.classList.remove("boosted", "muted");
  if (lastError) {
    statusLine.textContent = lastError;
    statusLine.classList.add("muted");
  } else if (muted) {
    statusLine.textContent = "Muted";
    statusLine.classList.add("muted");
  } else if (volume === 0) {
    statusLine.textContent = "Silent";
  } else if (volume > 100) {
    statusLine.textContent = "Boost ×" + (volume / 100).toFixed(1);
    statusLine.classList.add("boosted");
  } else {
    statusLine.textContent = "Active";
  }

  muteBtn.classList.toggle("mute-active", muted);
  muteLabel.textContent = muted ? "Unmute" : "Mute";
  speakerIcon.innerHTML = muted
    ? `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
       <line x1="23" y1="9" x2="17" y2="15"></line>
       <line x1="17" y1="9" x2="23" y2="15"></line>`
    : `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
       <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
       <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
}

function updateBoostUI() {
  bassBtn.classList.toggle("bass-active", bassOn);
  voiceBtn.classList.toggle("voice-active", voiceOn);
}

// Pages that can't be captured (chrome://, brave://, the Web Store, other
// extensions' pages). Show that instead of dead controls.
function setUnavailable(text) {
  updateUI(100, false);
  statusLine.textContent = text || "Not available on this page";
  tabBadge.textContent = "Tab —";
  CONTROLS.forEach((el) => { el.disabled = true; });
}

function isControllable(tab) {
  const url = tab.url || tab.pendingUrl || "";
  if (!url) return true; // no URL access: assume a normal page
  return /^(https?|file|ftp):/i.test(url);
}

// ── SEND MESSAGES ──
// Every change goes to background.js, which stores it and pushes it to the
// audio engine. The response tells us if the tab couldn't be captured.
async function send(msg) {
  try {
    const r = await chrome.runtime.sendMessage({ ...msg, tabId: currentTabId });
    lastError = r && r.ok === false ? (r.error || "Something went wrong") : "";
  } catch (e) {
    lastError = "Extension not responding. Reload it.";
  }
  updateUI(currentVolume, isMuted);
}
function sendVolume(volume, muted) { return send({ type: "SET_VOLUME", volume, muted }); }
function sendBass(enabled)         { return send({ type: "SET_BASS_BOOST", enabled }); }
function sendVoice(enabled)        { return send({ type: "SET_VOICE_BOOST", enabled }); }

function setVolume(v) {
  volumeBeforeMute = v;
  updateUI(v, false);
  sendVolume(v, false);
}

// Apply a typed value (Set button and Enter key)
function applyCustomVolume() {
  const raw = volInput.value.trim();
  let v = Math.floor(Number(raw));
  if (raw === "" || !Number.isFinite(v)) {
    // Empty / garbage input: don't silently set 0, just re-sync the field
    volInput.value = currentVolume;
    return;
  }
  if (v < 0) v = 0;
  setVolume(v);
}

// ── INIT ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  if (!tab || tab.id == null) {
    setUnavailable();
    return;
  }
  currentTabId = tab.id;
  tabBadge.textContent = "Tab " + tab.id;

  if (!isControllable(tab)) {
    setUnavailable();
    return;
  }

  chrome.runtime.sendMessage({ type: "GET_VOLUME", tabId: currentTabId }, (response) => {
    if (chrome.runtime.lastError || !response) {
      updateUI(100, false);
      return;
    }
    const { volume, muted, bassBoost, voiceBoost, capturing } = response;
    volumeBeforeMute = volume;
    bassOn  = Boolean(bassBoost);
    voiceOn = Boolean(voiceBoost);
    updateUI(volume, Boolean(muted));
    updateBoostUI();
    if (capturing) tabBadge.textContent = "Tab " + tab.id + " · live";
  });
});

// ── EVENTS ──

// Slider drag
volumeSlider.addEventListener("input", () => {
  setVolume(parseInt(volumeSlider.value, 10));
});

// Set button click
setBtn.addEventListener("click", applyCustomVolume);

// Enter key in the number input
volInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyCustomVolume();
});

// Mute toggle
muteBtn.addEventListener("click", () => {
  if (isMuted) {
    const restore = volumeBeforeMute || 100;
    updateUI(restore, false);
    sendVolume(restore, false);
  } else {
    // Use the real value, not the slider: the slider is clamped to MAX_VOL,
    // so a typed 1500% used to come back as 1000% after unmuting.
    volumeBeforeMute = currentVolume;
    updateUI(currentVolume, true);
    sendVolume(currentVolume, true);
  }
});

// Reset: back to 100% and release the tab (native audio resumes)
resetBtn.addEventListener("click", () => {
  isMuted = false;
  volumeBeforeMute = 100;
  bassOn = false;
  voiceOn = false;
  updateBoostUI();
  updateUI(100, false);
  send({ type: "RESET" }).then(() => {
    tabBadge.textContent = "Tab " + currentTabId;
  });
});

// Bass boost
bassBtn.addEventListener("click", () => {
  bassOn = !bassOn;
  updateBoostUI();
  sendBass(bassOn);
});

// Voice boost
voiceBtn.addEventListener("click", () => {
  voiceOn = !voiceOn;
  updateBoostUI();
  sendVoice(voiceOn);
});
