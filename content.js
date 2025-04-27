// Global variables
let currentSpeed = 1.0;
let keyboardShortcutsEnabled = true;
let rememberSpeedEnabled = true;
let siteDisabled = false;
let speedIndicator = null;
let hideTimeout = null;
let videos = [];
let speedSelector = null;
let youtubeControls = null;
let menuPortal = null;

// Function to get speed presets from chrome storage
async function getSpeedPresets() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["speedButtonPresets"], function (data) {
      if (data.speedButtonPresets) {
        resolve(data.speedButtonPresets);
      } else {
        // If not saved yet, get from popup.html and save
        fetch(chrome.runtime.getURL("popup.html"))
          .then((response) => response.text())
          .then((html) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const speedButtons = doc.querySelectorAll(".speed-btn");
            const presets = Array.from(speedButtons)
              .map((btn) => parseFloat(btn.getAttribute("data-speed")))
              .sort((a, b) => a - b);

            // Save for future use
            chrome.storage.sync.set({ speedButtonPresets: presets });
            resolve(presets);
          });
      }
    });
  });
}

// Initialize when the page loads
function initialize() {
  console.log(
    "Content: initialize called. Frame origin:",
    window.location.origin,
    "Is top frame:",
    window.top === window.self
  );
  const hostname = window.location.hostname;

  // Check if site is disabled - only attempt if in the top-level frame
  if (window.top === window.self) {
    try {
      chrome.storage.sync.get(
        ["disabledSites", "siteSettings", "rememberSpeedEnabled"],
        function (data) {
          const disabledSites = data.disabledSites || {};
          siteDisabled = !!disabledSites[hostname];
          console.log(
            "Content: Initial site disabled status for",
            hostname,
            ":",
            siteDisabled
          );

          // Update badge to show current state
          if (window.top === window.self) {
            try {
              if (siteDisabled) {
                chrome.runtime.sendMessage({
                  action: "updateBadge",
                  disabled: true,
                });
              } else {
                // Get the appropriate speed to show
                let speedToShow = 1.0;
                // Only use site-specific speed if remember speed is enabled
                if (
                  data.rememberSpeedEnabled !== false && // Check if remember speed is enabled (default true)
                  data.siteSettings &&
                  data.siteSettings[hostname]
                ) {
                  speedToShow = data.siteSettings[hostname];
                }
                chrome.runtime.sendMessage({
                  action: "updateBadge",
                  speed: speedToShow,
                  disabled: false,
                });
              }
            } catch (e) {
              console.error(
                "Content: Error sending updateBadge message:",
                e,
                "Frame origin:",
                window.location.origin,
                "Is top frame:",
                window.top === window.self
              );
            }
          }

          // Load and apply settings if site is not disabled
          if (!siteDisabled) {
            // Only use site-specific speed if remember speed is enabled
            if (
              data.rememberSpeedEnabled !== false && // Check if remember speed is enabled (default true)
              data.siteSettings &&
              data.siteSettings[hostname]
            ) {
              currentSpeed = data.siteSettings[hostname];
            } else {
              currentSpeed = 1.0; // Default speed
            }
            applySpeedToAllVideos();
          } else {
            resetAllVideosToNormalSpeed();
          }
        }
      );
    } catch (e) {
      console.error(
        "Content: Error accessing chrome.storage.sync in initialize:",
        e
      );
    }
  }

  // Create speed indicator even if disabled (will be shown when enabled)
  createSpeedIndicator();

  // Set up mutation observer to detect new videos
  setupVideoObserver();

  // Set up keyboard shortcuts (will be disabled if site is disabled)
  setupKeyboardShortcuts();

  // Check if we're on YouTube
  if (window.location.hostname === "www.youtube.com") {
    setupYouTubeSpeedSelector();
  }
}

// Reset all videos to normal speed (1.0x)
function resetAllVideosToNormalSpeed() {
  console.log("Content: resetAllVideosToNormalSpeed called"); // Log
  videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    video.playbackRate = 1.0;
  });
}

// Apply speed to all videos on the page
function applySpeedToAllVideos() {
  console.log(
    "Content: applySpeedToAllVideos called. siteDisabled:",
    siteDisabled
  ); // Log
  if (siteDisabled) return;

  videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    console.log("Content: Applying speed", currentSpeed, "to video"); // Log
    video.playbackRate = currentSpeed;

    // Add event listener to maintain speed if the video resets
    if (!video.dataset.speedControlled) {
      video.dataset.speedControlled = "true";
      video.addEventListener("ratechange", function () {
        // Only override if it wasn't changed by our extension and site is not disabled
        if (
          !siteDisabled &&
          video.playbackRate !== currentSpeed &&
          !video.dataset.changingSpeed
        ) {
          video.dataset.changingSpeed = "true";
          video.playbackRate = currentSpeed;
          setTimeout(() => {
            delete video.dataset.changingSpeed;
          }, 50);
        }
      });
    }
  });
}

// Create a visual indicator for speed changes
function createSpeedIndicator() {
  if (!speedIndicator) {
    speedIndicator = document.createElement("div");
    speedIndicator.id = "video-speed-indicator";
    speedIndicator.style.cssText = `
      position: fixed;
      top: 50px;
      right: 50px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      font-family: Arial, sans-serif;
      font-size: 16px;
      z-index: 9999;
      transition: opacity 0.3s;
      opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(speedIndicator);
  }
}

// Show the speed indicator
function showSpeedIndicator() {
  if (siteDisabled) return;

  if (speedIndicator) {
    speedIndicator.textContent = `${currentSpeed
      .toFixed(2)
      .replace(/\.?0+$/, "")}x`;
    speedIndicator.style.opacity = "1";

    // Hide after a delay
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      speedIndicator.style.opacity = "0";
    }, 1500);
  }
}

// Set up mutation observer to detect new videos
function setupVideoObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
      }
    });

    if (shouldCheck && !siteDisabled) {
      applySpeedToAllVideos();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (siteDisabled || !keyboardShortcutsEnabled) return;

    // Shift + Arrow Up: Increase speed
    if (e.shiftKey && e.key === "ArrowUp") {
      e.preventDefault();
      increaseSpeed();
    }
    // Shift + Arrow Down: Decrease speed
    else if (e.shiftKey && e.key === "ArrowDown") {
      e.preventDefault();
      decreaseSpeed();
    }
    // Shift + R: Reset speed to 1.0x
    else if (e.shiftKey && e.key === "r") {
      e.preventDefault();
      resetSpeed();
    }
  });
}

// Increase the playback speed
function increaseSpeed() {
  if (siteDisabled) return;

  if (currentSpeed < 5) {
    if (currentSpeed < 1) {
      currentSpeed = Math.min(Math.round((currentSpeed + 0.1) * 10) / 10, 1);
    } else if (currentSpeed < 2) {
      currentSpeed = Math.min(Math.round((currentSpeed + 0.1) * 10) / 10, 2);
    } else if (currentSpeed < 3) {
      currentSpeed = Math.min(Math.round((currentSpeed + 0.25) * 4) / 4, 3);
    } else {
      currentSpeed = Math.min(Math.round((currentSpeed + 1) * 1) / 1, 5);
    }

    applySpeedToAllVideos();
    showSpeedIndicator();

    // Update badge in extension icon - only send message from top-level frame
    if (window.top === window.self) {
      try {
        chrome.runtime.sendMessage({
          action: "updateBadge",
          speed: currentSpeed,
        });
        console.log(
          "Content: Sent updateBadge message (speed:",
          currentSpeed,
          ")"
        ); // Log
      } catch (e) {
        console.error(
          "Content: Error sending updateBadge message (speed):",
          e,
          "Frame origin:",
          window.location.origin,
          "Is top frame:",
          window.top === window.self
        ); // Log error
      }
    }

    saveSpeed();
  }
}

// Decrease the playback speed
function decreaseSpeed() {
  if (siteDisabled) return;

  if (currentSpeed > 0.1) {
    if (currentSpeed <= 1) {
      currentSpeed = Math.max(Math.round((currentSpeed - 0.1) * 10) / 10, 0.1);
    } else if (currentSpeed <= 2) {
      currentSpeed = Math.max(Math.round((currentSpeed - 0.1) * 10) / 10, 1);
    } else if (currentSpeed <= 3) {
      currentSpeed = Math.max(Math.round((currentSpeed - 0.25) * 4) / 4, 1);
    } else {
      currentSpeed = Math.max(Math.round((currentSpeed - 1) * 1) / 1, 3);
    }

    applySpeedToAllVideos();
    showSpeedIndicator();

    // Update badge in extension icon - only send message from top-level frame
    if (window.top === window.self) {
      try {
        chrome.runtime.sendMessage({
          action: "updateBadge",
          speed: currentSpeed,
        });
        console.log(
          "Content: Sent updateBadge message (speed:",
          currentSpeed,
          ")"
        ); // Log
      } catch (e) {
        console.error(
          "Content: Error sending updateBadge message (speed):",
          e,
          "Frame origin:",
          window.location.origin,
          "Is top frame:",
          window.top === window.self
        ); // Log error
      }
    }

    saveSpeed();
  }
}

// Reset speed to 1.0x
function resetSpeed() {
  if (siteDisabled) return;

  currentSpeed = 1.0;
  applySpeedToAllVideos();
  showSpeedIndicator();

  // Update badge in extension icon - only send message from top-level frame
  if (window.top === window.self) {
    try {
      chrome.runtime.sendMessage({
        action: "updateBadge",
        speed: currentSpeed,
      });
      console.log(
        "Content: Sent updateBadge message (speed:",
        currentSpeed,
        ")"
      ); // Log
    } catch (e) {
      console.error(
        "Content: Error sending updateBadge message (speed):",
        e,
        "Frame origin:",
        window.location.origin,
        "Is top frame:",
        window.top === window.self
      ); // Log error
    }
  }

  saveSpeed();
}

// Save the current speed
function saveSpeed() {
  console.log(
    "Content: saveSpeed called. siteDisabled:",
    siteDisabled,
    "Frame origin:",
    window.location.origin,
    "Is top frame:",
    window.top === window.self
  ); // Log
  if (siteDisabled) return;

  // Only save general speed if in the top-level frame
  if (window.top === window.self) {
    try {
      chrome.storage.sync.set({ speed: currentSpeed });
      console.log("Content: Saved general speed:", currentSpeed); // Log
    } catch (e) {
      console.error(
        "Content: Error saving general speed:",
        e,
        "Frame origin:",
        window.location.origin,
        "Is top frame:",
        window.top === window.self
      ); // Log error
    }
  } else {
    console.log(
      "Content: Not in top-level frame, skipping general speed save."
    ); // Log
  }

  // Save site-specific speed if enabled
  if (rememberSpeedEnabled) {
    console.log(
      "Content: rememberSpeedEnabled is true, attempting to save site-specific speed. Frame origin:",
      window.location.origin,
      "Is top frame:",
      window.top === window.self
    ); // Log
    // Only save site-specific settings if in the top-level frame
    if (window.top === window.self) {
      const hostname = window.location.hostname;
      try {
        chrome.storage.sync.get(["siteSettings"], function (data) {
          const siteSettings = data.siteSettings || {};
          siteSettings[hostname] = currentSpeed;
          try {
            chrome.storage.sync.set({ siteSettings: siteSettings });
            console.log(
              "Content: Saved site-specific speed for",
              hostname,
              ":",
              currentSpeed
            ); // Log
          } catch (e) {
            console.error(
              "Content: Error saving site-specific speed:",
              e,
              "Frame origin:",
              window.location.origin,
              "Is top frame:",
              window.top === window.self
            ); // Log error
          }
        });
      } catch (e) {
        console.error(
          "Content: Error getting siteSettings for saving:",
          e,
          "Frame origin:",
          window.location.origin,
          "Is top frame:",
          window.top === window.self
        ); // Log error
      }
    } else {
      console.log(
        "Content: Not in top-level frame, skipping site-specific speed save."
      ); // Log
    }
  }
}

// Function to set up YouTube speed selector
async function setupYouTubeSpeedSelector() {
  // Check if feature is enabled
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.sync.get(["youtubeSpeedSelectorEnabled"], resolve);
    });

    if (data.youtubeSpeedSelectorEnabled === false) {
      // Remove existing selector if it exists
      const existingSelector = document.querySelector(
        ".extension-speed-selector"
      );
      if (existingSelector) {
        existingSelector.remove();
      }
      if (menuPortal) {
        menuPortal.remove();
        menuPortal = null;
      }
      return;
    }
  } catch (e) {
    console.error("Error checking YouTube speed selector setting:", e);
  }

  // Create speed selector button
  speedSelector = document.createElement("div");
  speedSelector.className = "extension-speed-selector ytp-button";

  const display = document.createElement("div");
  display.className = "extension-speed-display";
  display.textContent = currentSpeed + "x";
  speedSelector.appendChild(display);

  // Create menu portal at document root
  if (!menuPortal) {
    menuPortal = document.createElement("div");
    menuPortal.className = "extension-speed-menu-portal";
    document.body.appendChild(menuPortal);
  }

  // Get speed presets from popup.html
  const speedPresets = await getSpeedPresets();

  // Add speed presets
  speedPresets.forEach((speed) => {
    const item = createSpeedMenuItem(speed);
    menuPortal.appendChild(item);
  });

  // Add separator and custom presets
  const separator = document.createElement("div");
  separator.className = "extension-speed-separator";
  menuPortal.appendChild(separator);

  // Load custom presets
  chrome.storage.sync.get(["presets"], function (data) {
    if (data.presets && Array.isArray(data.presets)) {
      data.presets.forEach((speed) => {
        const item = createSpeedMenuItem(speed);
        menuPortal.appendChild(item);
      });
    }
  });

  // Try to insert button into YouTube controls
  const insertSpeedSelector = () => {
    const rightControls = document.querySelector(".ytp-right-controls");
    if (rightControls && !document.querySelector(".extension-speed-selector")) {
      rightControls.insertBefore(speedSelector, rightControls.firstChild);
      youtubeControls = rightControls;

      // Position menu when button is hovered
      const updateMenuPosition = () => {
        const rect = speedSelector.getBoundingClientRect();
        const menuHeight = menuPortal.offsetHeight;

        // Position above the button
        menuPortal.style.left = rect.left + "px";
        menuPortal.style.top = rect.top - menuHeight - 8 + "px";

        // Adjust horizontal position if menu would go off-screen
        const menuRight = rect.left + menuPortal.offsetWidth;
        if (menuRight > window.innerWidth) {
          menuPortal.style.left =
            window.innerWidth - menuPortal.offsetWidth - 8 + "px";
        }
      };

      // Handle mouse interactions
      let isHovered = false;
      let hoverTimeout;

      const showMenu = () => {
        isHovered = true;
        clearTimeout(hoverTimeout);
        updateMenuPosition();
        menuPortal.classList.add("visible");
      };

      const hideMenu = () => {
        isHovered = false;
        hoverTimeout = setTimeout(() => {
          if (!isHovered) {
            menuPortal.classList.remove("visible");
          }
        }, 150);
      };

      // Add event listeners
      speedSelector.addEventListener("mouseenter", showMenu);
      speedSelector.addEventListener("mouseleave", hideMenu);
      menuPortal.addEventListener("mouseenter", showMenu);
      menuPortal.addEventListener("mouseleave", hideMenu);

      // Update position on window resize and scroll
      window.addEventListener("resize", () => {
        if (menuPortal.classList.contains("visible")) {
          updateMenuPosition();
        }
      });

      window.addEventListener("scroll", () => {
        if (menuPortal.classList.contains("visible")) {
          updateMenuPosition();
        }
      });
    }
  };

  // Initial attempt
  insertSpeedSelector();

  // Watch for player changes
  const observer = new MutationObserver(() => {
    if (!document.querySelector(".extension-speed-selector")) {
      insertSpeedSelector();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Update speed display in YouTube selector
function updateSpeedDisplay() {
  if (speedSelector) {
    const display = speedSelector.querySelector(".extension-speed-display");
    if (display) {
      display.textContent = currentSpeed + "x";
    }

    // Update active state in menu
    if (menuPortal) {
      const items = menuPortal.querySelectorAll(".extension-speed-item");
      items.forEach((item) => {
        const itemSpeed = parseFloat(item.textContent);
        if (Math.abs(itemSpeed - currentSpeed) < 0.01) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    }
  }
}

// Create a speed menu item
function createSpeedMenuItem(speed) {
  const item = document.createElement("div");
  item.className = "extension-speed-item";
  if (Math.abs(speed - currentSpeed) < 0.01) {
    item.classList.add("active");
  }
  item.textContent = speed + "x";

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    currentSpeed = speed;
    updateSpeedDisplay();
    applySpeedToAllVideos();
    showSpeedIndicator();
    saveSpeed();

    // Update extension badge immediately
    if (window.top === window.self) {
      chrome.runtime.sendMessage({
        action: "updateBadge",
        speed: currentSpeed,
      });
    }

    // Hide menu after selection
    if (menuPortal) {
      menuPortal.classList.remove("visible");
    }
  });

  return item;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log(
    "Content: Message received:",
    message,
    "Frame origin:",
    window.location.origin,
    "Is top frame:",
    window.top === window.self
  );

  // Handle messages regardless of frame level for critical functionality
  if (message.action === "disableSite") {
    console.log(
      "Content: Received disableSite action for hostname:",
      message.hostname
    );
    const hostname = window.location.hostname;
    if (!message.hostname || message.hostname === hostname) {
      siteDisabled = true;
      resetAllVideosToNormalSpeed();
    }
  } else if (message.action === "enableSite") {
    console.log(
      "Content: Received enableSite action for hostname:",
      message.hostname
    );
    const hostname = window.location.hostname;
    if (!message.hostname || message.hostname === hostname) {
      siteDisabled = false;
      // Reinitialize the extension for this site
      chrome.storage.sync.get(
        ["speed", "siteSettings", "rememberSpeed"],
        function (data) {
          if (
            data.rememberSpeed &&
            data.siteSettings &&
            data.siteSettings[hostname]
          ) {
            currentSpeed = data.siteSettings[hostname];
          } else if (data.speed) {
            currentSpeed = data.speed;
          } else {
            currentSpeed = 1.0;
          }
          applySpeedToAllVideos();
          showSpeedIndicator();
        }
      );
    }
  } else if (message.action === "setSpeed" && !siteDisabled) {
    console.log(
      "Content: Received setSpeed action with speed:",
      message.speed,
      "rememberSpeed:",
      message.rememberSpeed
    );
    currentSpeed = message.speed;
    applySpeedToAllVideos();
    showSpeedIndicator();

    // Save site-specific speed if enabled
    if (message.rememberSpeed) {
      rememberSpeedEnabled = true;
      saveSpeed();
    }

    // Update YouTube speed selector when speed changes
    updateSpeedDisplay();
  } else if (message.action === "updateSettings") {
    console.log("Content: Received updateSettings action:", message);
    if (message.keyboardShortcuts !== undefined) {
      keyboardShortcutsEnabled = message.keyboardShortcuts;
    }
    if (
      message.youtubeSpeedSelectorEnabled !== undefined &&
      window.location.hostname === "www.youtube.com"
    ) {
      if (message.youtubeSpeedSelectorEnabled) {
        setupYouTubeSpeedSelector();
      } else {
        // Remove existing selector if it exists
        const existingSelector = document.querySelector(
          ".extension-speed-selector"
        );
        if (existingSelector) {
          existingSelector.remove();
        }
        if (menuPortal) {
          menuPortal.remove();
          menuPortal = null;
        }
      }
    }
  }
});

// Add CSS for the extension
const style = document.createElement("style");
style.textContent = `
  #video-speed-indicator {
    position: fixed;
    top: 50px;
    right: 50px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    font-size: 16px;
    z-index: 9999;
    transition: opacity 0.3s;
    opacity: 0;
    pointer-events: none;
  }
  .extension-speed-menu-portal {
    position: absolute;
    background-color: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 9999;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }
  .extension-speed-menu-portal.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .extension-speed-item {
    padding: 5px 10px;
    cursor: pointer;
  }
  .extension-speed-item.active {
    background-color: rgba(255, 255, 255, 0.2);
  }
  .extension-speed-separator {
    height: 1px;
    background-color: rgba(255, 255, 255, 0.3);
    margin: 5px 0;
  }
`;
document.head.appendChild(style);

// Initialize when the page is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
