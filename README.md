# Sigma Boi Koko

A premium volume control extension for Chrome and Brave. Boost any tab up to 600%. Clean dark UI. No bloat.

## Features

- Volume boost up to **600%** per tab
- Per-tab memory — each tab keeps its own setting
- Mute toggle with one click
- Reset to 100% instantly
- Works in fullscreen without any overlay interference
- Minimal dark UI

## Install (Developer Mode)

1. Download or clone this repo
2. Go to `chrome://extensions` or `brave://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `sigma-boi-koko` folder

## How it works

The extension hooks into the browser's **Web Audio API** using a `GainNode`. Audio from any tab gets routed through this node, letting us amplify beyond the browser's default 100% cap. Per-tab state is stored in `chrome.storage.local` and cleaned up automatically when tabs close.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config (Manifest V3) |
| `content.js` | Audio engine — runs inside every page |
| `background.js` | Service worker — manages per-tab volume state |
| `popup.html` | UI markup |
| `popup.js` | UI logic |

## Credits

Big thanks to **[@Kokodaki](https://github.com/Kokodaki)** for the idea and the name.

---

Made by [ImForge](https://github.com/ImForge)
