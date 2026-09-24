# Sigma Boi Koko

A premium volume control extension for Chrome and Brave. Boost any tab up to **1000%**. Clean dark UI. Bass and voice boost included.

## Features

- Volume boost up to **1000%** per tab on the slider
- **Custom value input** — type any exact percentage (no upper cap) and hit Set
- **Bass boost** — boosts low frequencies (~80Hz, +10dB)
- **Voice boost** — boosts vocal range (~2.5kHz, +8dB) for clearer speech
- Per-tab memory — each tab keeps its own settings, and they survive reloads and navigation within that tab
- Works on embedded players (YouTube embeds, X/Twitter cards, other iframes)
- Hands-off by default — a tab's audio is left completely untouched until you change something for it
- Mute toggle with one click
- Reset to 100% instantly
- Works in fullscreen without overlay interference
- Minimal dark UI

## Install (Developer Mode)

1. Download or clone this repo
2. Go to `chrome://extensions` or `brave://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `Sigma-Boi-Koko` folder

## Permissions

- `storage` — remembers each tab's settings for the browser session
- `activeTab` — lets the popup tell whether the current page is one it can control
- Content script on `<all_urls>` — that's how the audio gets boosted on any site

## Known limitations

These come from how the Web Audio API works, not from this extension:

- **Cross-origin media without CORS headers** (a plain `<video src>` pointing at a CDN that doesn't send `Access-Control-Allow-Origin`) goes **silent** once routed through Web Audio. That's why the extension stays hands-off until you actually change something on a tab. If a site goes silent after boosting, hit Reset and reload.
- **Sites that already use Web Audio on their players** (some music sites with visualisers/EQs) can't be boosted — the element can only belong to one audio graph.
- **`chrome://`, `brave://`, the Web Store, the PDF viewer** and other extension pages can't run content scripts, so the popup shows "Not available on this page" there.
- Settings are per tab for the current browser session. They're gone after you close the tab or restart the browser.

## Credits

Big thanks to **[@Kokodaki](https://github.com/Kokodaki)** for the idea and the name.

FIRE EMOJI!!!
