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

let currentTabId    = null;
let isMuted         = false;
let volumeBeforeMute = 100;
let bassOn          = false;
let voiceOn         = false;

// ── UI RENDER ──
function updateUI(volume, muted) {
  isMuted = muted;
  volumeNumber.textContent = volume;

  const fillPct = Math.min((volume / 600) * 100, 100);
  trackFill.style.width = muted ? "0%" : fillPct + "%";
  trackFill.classList.toggle("boosted", volume > 100 && !muted);
  trackFill.classList.toggle("muted", muted);

  statusLine.classList.remove("boosted", "muted");
  if (muted) {
    statusLine.textContent = "Muted";
    statusLine.classList.add("muted");
  } else if (volume === 0) {
    statusLine.textContent = "Silent";
  } else if (volume > 100) {
    statusLine.textContent = "Boost \u00d7" + (volume / 100).toFixed(1);
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

// ── SEND MESSAGES ──
function sendVolume(volume, muted) {
  chrome.runtime.sendMessage({ type: "SET_VOLUME", tabId: currentTabId, volume, muted });
}

function sendBass(enabled) {
  chrome.runtime.sendMessage({ type: "SET_BASS_BOOST", tabId: currentTabId, enabled });
}

function sendVoice(enabled) {
  chrome.runtime.sendMessage({ type: "SET_VOICE_BOOST", tabId: currentTabId, enabled });
}

// ── INIT ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) return;
  const tab = tabs[0];
  currentTabId = tab.id;
  tabBadge.textContent = "Tab " + tab.id;

  chrome.runtime.sendMessage({ type: "GET_VOLUME", tabId: currentTabId }, (response) => {
    if (chrome.runtime.lastError) {
      updateUI(100, false);
      volumeSlider.value = 100;
      return;
    }
    const { volume, muted, bassBoost, voiceBoost } = response;
    volumeBeforeMute = volume;
    bassOn   = bassBoost;
    voiceOn  = voiceBoost;
    volumeSlider.value = volume;
    updateUI(volume, muted);
    updateBoostUI();
  });
});

// ── EVENTS ──
volumeSlider.addEventListener("input", () => {
  const v = parseInt(volumeSlider.value, 10);
  if (isMuted) isMuted = false;
  volumeBeforeMute = v;
  updateUI(v, false);
  sendVolume(v, false);
});

muteBtn.addEventListener("click", () => {
  if (isMuted) {
    const restore = volumeBeforeMute || 100;
    volumeSlider.value = restore;
    updateUI(restore, false);
    sendVolume(restore, false);
  } else {
    volumeBeforeMute = parseInt(volumeSlider.value, 10);
    isMuted = true;
    updateUI(volumeBeforeMute, true);
    sendVolume(volumeBeforeMute, true);
  }
});

resetBtn.addEventListener("click", () => {
  isMuted = false;
  volumeBeforeMute = 100;
  volumeSlider.value = 100;
  updateUI(100, false);
  sendVolume(100, false);
});

bassBtn.addEventListener("click", () => {
  bassOn = !bassOn;
  updateBoostUI();
  sendBass(bassOn);
});

voiceBtn.addEventListener("click", () => {
  voiceOn = !voiceOn;
  updateBoostUI();
  sendVoice(voiceOn);
});
