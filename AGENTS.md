# Repository Guidelines

## Project Structure & Module Organization

- `manifest.json` defines the Chrome Extension (Manifest V3) entry points and permissions.
- `background.js` is the service worker for extension lifecycle and background tasks.
- `content.js` and `content.css` implement in-page playback controls, observers, and UI overlays.
- `popup.html`, `popup.js`, and `popup.css` power the extension popup UI.
- `icons/` stores extension artwork used in the toolbar and store listing.

## Build, Test, and Development Commands

This project has no build step or package manager. Development is done by loading the extension directly:

- Load unpacked: open `chrome://extensions/`, enable Developer mode, and click “Load unpacked”. Select the repo folder (the one containing `manifest.json`).
- Reload after changes: use the Reload button on `chrome://extensions/`, then refresh the target page.

## Coding Style & Naming Conventions

- JavaScript uses semicolons and 2-space indentation. Keep functions small and focused.
- Prefer descriptive, camelCase names for variables and functions (e.g., `currentSpeed`, `getSpeedPresets`).
- Keep UI selectors and class names in `content.css`/`popup.css` aligned with markup in `popup.html` and injected UI in `content.js`.

## Testing Guidelines

There is no automated test suite. Validate changes manually:

- Verify playback speed changes on a few sites (e.g., YouTube and a generic HTML5 video site).
- Confirm settings persist across reloads and per-site memory behaves correctly.
- Check keyboard shortcuts and on-screen indicator behavior.

## Commit & Pull Request Guidelines

Recent commits loosely follow Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`) with occasional scopes like `style(ui):`. Please keep messages short and action-oriented, and avoid one-off prefixes.

Pull requests should include:

- A clear description of the behavior change.
- Steps to verify (manual test notes are fine).
- Screenshots or GIFs for popup/UI changes or in-page overlays.

## Security & Configuration Tips

- Be cautious with permissions in `manifest.json`. Only add new permissions when required.
- Store user settings via `chrome.storage` and avoid external network calls unless explicitly needed.
