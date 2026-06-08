# Sigma Boi Koko

A premium volume control extension for Chrome and Brave. Boost any tab up to **1000%**. Clean dark UI. Bass and voice boost included.

## Features

- Volume boost up to **1000%** per tab
- **Bass boost** — boosts low frequencies (~80Hz, +10dB)
- **Voice boost** — boosts vocal range (~2.5kHz, +8dB) for clearer speech
- **Custom value input** — type any exact percentage and hit Set
- Per-tab memory — each tab keeps its own settings
- Mute toggle with one click
- Reset to 100% instantly
- Works in fullscreen without overlay interference
- Minimal dark UI

## Install (Developer Mode)

1. Download or clone this repo
2. Go to `chrome://extensions` or `brave://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `sigma-boi-koko` folder

## How it works

The extension hooks into the browser's **Web Audio API** and inserts a processing chain into every page's audio:

```
source → GainNode → BassFilter → VoiceFilter → speakers
```

- **GainNode** controls overall volume (0–10x amplification)
- **BiquadFilter (lowshelf)** at 80Hz handles bass boost
- **BiquadFilter (peaking)** at 2.5kHz handles voice boost

Per-tab state is stored in `chrome.storage.local` and cleaned up automatically when tabs close. The extension respects browser autoplay policy and only resumes suspended audio contexts after a user gesture.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config (Manifest V3) |
| `content.js` | Audio engine — runs inside every page |
| `background.js` | Service worker — manages per-tab state |
| `popup.html` | UI markup |
| `popup.js` | UI logic |

## Credits

Big thanks to **[@Kokodaki](https://github.com/Kokodaki)** for the idea and the name. 

FIRE EMOJI!!!

