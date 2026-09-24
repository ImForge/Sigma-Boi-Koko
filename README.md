# Sigma Boi Koko

A premium volume control extension for Chrome and Brave. Boost any tab up to **1000%**. Clean dark UI. Bass and voice boost included.

## Features

- Volume boost up to **1000%** per tab on the slider
- **Custom value input**: type any exact percentage (no upper cap) and hit Set
- **Bass boost**: boosts low frequencies (~80Hz, +10dB)
- **Voice boost**: boosts vocal range (~2.5kHz, +8dB) for clearer speech
- Works on **any** audio a tab plays: direct files, streams, embeds, cross-origin CDNs, sites with their own audio engine
- Per-tab memory: each tab keeps its own settings, and they survive reloads and navigation within that tab
- Hands-off by default: a tab's audio is left completely untouched until you change something for it
- Mute toggle with one click
- Reset to 100% instantly (also releases the tab)
- Works in fullscreen without overlay interference
- Minimal dark UI

## How it works

v2 uses `chrome.tabCapture`. When you change the volume on a tab, the extension captures that tab's audio output and plays it back through a gain + EQ chain in an offscreen document. Chrome routes the tab's sound through the extension for as long as it's boosted, so the tab shows the usual "sharing" indicator. Hit **Reset** to release the tab and go back to native audio.

v1 injected a content script that rewired `<video>`/`<audio>` elements through Web Audio. That silently failed whenever the media was cross-origin without CORS headers (common when a VPN or region change moves you to a different CDN), when the site used Web Audio itself, or when the autoplay policy kept the context suspended. None of that applies to tab capture.

## Install (Developer Mode)

1. Download the zip from Releases (or clone this repo) and **extract** it
2. Go to `chrome://extensions` or `brave://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the extracted `Sigma-Boi-Koko` folder

For the Chrome Web Store, upload the zip as-is.

## Permissions

- `tabCapture`: captures the audio of the tab you're boosting
- `offscreen`: hosts the audio engine (service workers can't run Web Audio)
- `storage`: remembers each tab's settings for the browser session
- `activeTab`: lets the popup act on the tab it was opened on

No content scripts, no host permissions. The extension can't see or touch page content.

## Known limitations

- `chrome://`, `brave://`, the Web Store and other extension pages can't be captured, so the popup shows "Not available on this page" there.
- A boosted tab shows Chrome's "this tab's audio is being shared" indicator. That's the capture; nothing leaves your machine.
- Settings are per tab for the current browser session. They're gone after you close the tab or restart the browser.
- Requires Chrome / Brave 116 or newer.

## Credits

Big thanks to **[@Kokodaki](https://github.com/Kokodaki)** for the idea and the name.

FIRE EMOJI!!!
