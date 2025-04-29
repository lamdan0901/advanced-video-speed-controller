# Advanced Video Speed Controller

A Chrome extension that gives you precise control over video playback speed on any website.

## Features

- **Precise Speed Control**: Adjust video playback speed from 0.1x to 5.0x with a slider or preset buttons
- **Site-Specific Speed Memory**: Automatically remembers your preferred playback speed for each website
- **Custom Presets**: Create and save your own speed presets for quick access
- **Keyboard Shortcuts**: Control playback speed with keyboard shortcuts
- **Visual Feedback**: On-screen indicator shows current speed when changed
- **YouTube Integration**: Optional speed selector directly in the YouTube player controls
- **Badge Indicator**: Extension icon shows current speed with color coding (red for slower, blue for normal, green for faster)

## Installation

### Chrome Web Store (Coming Soon)

1. Download the extension from the [Chrome Web Store](#) (link to be added)
2. Click "Add to Chrome" to install the extension
3. The extension icon will appear in your browser toolbar

### Developer Mode (Load Unpacked)

If you want to install the extension in developer mode:

1. Download or clone this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click the "Load unpacked" button
5. Select the folder containing the extension files (the folder with manifest.json)
6. The extension will be installed and the icon will appear in your browser toolbar

Note: When using developer mode, you may see a notification about using developer mode extensions when you start Chrome. This is normal.

## Usage

### Basic Controls

- Click the extension icon to open the control panel
- Use the slider to adjust the playback speed
- Click preset buttons for quick speed changes
- Speed changes apply to all videos on the current page

### Custom Presets

1. Open the "Custom Presets" section
2. Enter a speed value between 0.1 and 5.0
3. Click "Add Preset"
4. Click on a custom preset to apply that speed
5. Click the "×" on a preset to remove it

### Settings

- **Remember speed for this site**: Automatically applies your last used speed when you return to a website
- **Enable keyboard shortcuts**: Allows control of playback speed with keyboard shortcuts
- **Show speed selector in YouTube player**: Adds a speed control directly in the YouTube player interface

### Keyboard Shortcuts

- **Shift + ↑**: Increase speed by 0.1
- **Shift + ↓**: Decrease speed by 0.1
- **Shift + R**: Reset to 1.0x speed

### Visual Indicators

- **On-screen indicator**: Briefly appears when speed changes
- **Extension badge**: Shows current speed with color coding:
  - Red: Slower than normal (< 1.0x)
  - Blue: Normal speed (1.0x)
  - Green: Faster than normal (> 1.0x)

## Technical Details

This extension works by modifying the playback rate property of HTML5 video elements. It uses:

- Chrome Extension Manifest V3
- Content scripts to modify video playback
- Chrome Storage API to save settings and presets
- MutationObserver to detect new videos added to the page

## Privacy

This extension:

- Does not collect any user data
- Does not communicate with external servers
- Only stores your settings locally in your browser

## License

[MIT License](LICENSE)

## Support

If you encounter any issues or have suggestions for improvements, please [open an issue](#) on our GitHub repository.

---

Made with ❤️ for video enthusiasts
