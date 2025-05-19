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
              .sort((a, b) => b - a);

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
  const hostname = window.location.hostname;

  // Check if site is disabled - only attempt if in the top-level frame
  if (window.top === window.self) {
    try {
      chrome.storage.sync.get(
        ["disabledSites", "siteSettings", "rememberSpeedEnabled"],
        function (data) {
          const disabledSites = data.disabledSites || {};
          siteDisabled = !!disabledSites[hostname];

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
            } catch (e) {}
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
    } catch (e) {}
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
  videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    video.playbackRate = 1.0;
  });
}

// Apply speed to all videos on the page
function applySpeedToAllVideos() {
  if (siteDisabled) return;

  // Handle videos in the main document
  const videos = document.querySelectorAll("video");
  applySpeedToVideos(videos);

  // Send speed update to iframes
  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentWindow.postMessage(
        {
          type: "VIDEO_SPEED_CONTROL",
          action: "SET_SPEED",
          speed: currentSpeed,
        },
        "*"
      );
    } catch (e) {
      // Handle cross-origin iframe errors silently
    }
  });
}

// Helper function to apply speed to a collection of videos
function applySpeedToVideos(videos) {
  videos.forEach((video) => {
    if (!video.dataset.speedControlled) {
      video.dataset.speedControlled = "true";

      // Add event listeners for better speed control
      video.addEventListener("play", () => {
        if (!siteDisabled && video.playbackRate !== currentSpeed) {
          video.playbackRate = currentSpeed;
        }
      });

      video.addEventListener("ratechange", function () {
        if (
          !siteDisabled &&
          !video.dataset.changingSpeed &&
          video.playbackRate !== currentSpeed
        ) {
          video.dataset.changingSpeed = "true";
          video.playbackRate = currentSpeed;
          setTimeout(() => {
            delete video.dataset.changingSpeed;
          }, 50);
        }
      });

      // Handle dynamic loading
      if (video.readyState >= 1) {
        video.playbackRate = currentSpeed;
      } else {
        video.addEventListener("loadedmetadata", () => {
          if (!siteDisabled) {
            video.playbackRate = currentSpeed;
          }
        });
      }
    }

    // Always try to set the speed
    if (!siteDisabled && video.playbackRate !== currentSpeed) {
      video.playbackRate = currentSpeed;
    }
  });
}

// Use Shadow DOM for speed controls
function createSpeedIndicator() {
  if (!speedIndicator) {
    speedIndicator = document.createElement("div");
    speedIndicator.id = "video-speed-indicator";

    // Create shadow root
    const shadow = speedIndicator.attachShadow({ mode: "open" });

    // Add styles to shadow DOM
    const style = document.createElement("style");
    style.textContent = `
      :host {
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
      :host(.visible) {
        opacity: 1;
      }
    `;

    // Create content
    const content = document.createElement("div");
    content.className = "speed-display";

    shadow.appendChild(style);
    shadow.appendChild(content);
    document.body.appendChild(speedIndicator);
  }
}

// Show speed indicator with Shadow DOM
function showSpeedIndicator() {
  if (siteDisabled || !speedIndicator) return;

  const display = speedIndicator.shadowRoot.querySelector(".speed-display");
  if (display) {
    display.textContent = `${currentSpeed.toFixed(2).replace(/\.?0+$/, "")}x`;
    speedIndicator.classList.add("visible");

    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      speedIndicator.classList.remove("visible");
    }, 1500);
  }
}

// Improved video detection and control
function setupVideoObserver() {
  const observer = new MutationObserver((mutations) => {
    let videoAdded = false;

    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeName === "VIDEO" ||
            (node.getElementsByTagName &&
              node.getElementsByTagName("video").length > 0)
          ) {
            videoAdded = true;
          }
          // Handle iframes
          if (node.nodeName === "IFRAME") {
            try {
              handleIframe(node);
            } catch (e) {
              // Handle cross-origin iframe errors silently
            }
          }
        });
      }
      // Check for video source changes
      if (
        mutation.type === "attributes" &&
        mutation.target.nodeName === "VIDEO" &&
        (mutation.attributeName === "src" ||
          mutation.attributeName === "currentSrc")
      ) {
        videoAdded = true;
      }
    });

    if (videoAdded && !siteDisabled) {
      initializeNewVideos();
    }
  });

  // Observe entire document including attribute changes
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "currentSrc"],
  });

  // Initial check for videos
  initializeNewVideos();
}

function handleIframe(iframe) {
  try {
    // Try to access iframe document
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Setup observer for iframe content
    const iframeObserver = new MutationObserver(() => {
      const videos = iframeDoc.getElementsByTagName("video");
      if (videos.length > 0) {
        Array.from(videos).forEach((video) => {
          if (!video.dataset.speedControlled) {
            initializeVideoElement(video);
          }
        });
      }
    });

    iframeObserver.observe(iframeDoc.documentElement, {
      childList: true,
      subtree: true,
    });

    // Initial check for videos in iframe
    const videos = iframeDoc.getElementsByTagName("video");
    Array.from(videos).forEach((video) => {
      if (!video.dataset.speedControlled) {
        initializeVideoElement(video);
      }
    });
  } catch (e) {
    // Cross-origin iframe - inject script via postMessage
    const script = `
      (function() {
        const videos = document.getElementsByTagName('video');
        Array.from(videos).forEach(video => {
          video.addEventListener('ratechange', () => {
            window.parent.postMessage({
              type: 'VIDEO_SPEED_CONTROL',
              action: 'SPEED_CHANGED',
              speed: video.playbackRate
            }, '*');
          });
        });
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'VIDEO_SPEED_CONTROL') {
            const videos = document.getElementsByTagName('video');
            Array.from(videos).forEach(video => {
              video.playbackRate = event.data.speed;
            });
          }
        });
      })();
    `;

    try {
      iframe.contentWindow.postMessage(
        {
          type: "VIDEO_SPEED_CONTROL",
          action: "INJECT_SCRIPT",
          script: script,
        },
        "*"
      );
    } catch (e) {
      // Handle injection errors silently
    }
  }
}

function initializeNewVideos() {
  // Handle videos in main document
  const videos = document.getElementsByTagName("video");
  Array.from(videos).forEach((video) => {
    if (!video.dataset.speedControlled) {
      initializeVideoElement(video);
    }
  });

  // Handle videos in same-origin iframes
  const iframes = document.getElementsByTagName("iframe");
  Array.from(iframes).forEach(handleIframe);
}

function initializeVideoElement(video) {
  video.dataset.speedControlled = "true";

  // Create a custom event dispatcher
  const dispatchSpeedEvent = (speed) => {
    video.dispatchEvent(
      new CustomEvent("videospeedchange", {
        bubbles: true,
        composed: true,
        detail: { speed },
      })
    );
  };

  // Add event listeners
  video.addEventListener("play", () => {
    if (!siteDisabled && video.playbackRate !== currentSpeed) {
      video.playbackRate = currentSpeed;
      dispatchSpeedEvent(currentSpeed);
    }
  });

  video.addEventListener("ratechange", () => {
    if (
      !siteDisabled &&
      !video.dataset.changingSpeed &&
      video.playbackRate !== currentSpeed
    ) {
      video.dataset.changingSpeed = "true";
      video.playbackRate = currentSpeed;
      dispatchSpeedEvent(currentSpeed);
      setTimeout(() => {
        delete video.dataset.changingSpeed;
      }, 50);
    }
  });

  // Set initial speed
  if (!siteDisabled) {
    video.playbackRate = currentSpeed;
    dispatchSpeedEvent(currentSpeed);
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (siteDisabled || !keyboardShortcutsEnabled) return;

    if (e.shiftKey && e.key === "ArrowUp") {
      e.preventDefault();
      increaseSpeed();
    } else if (e.shiftKey && e.key === "ArrowDown") {
      e.preventDefault();
      decreaseSpeed();
    } else if (e.shiftKey && e.key === "r") {
      e.preventDefault();
      resetSpeed();
    } else if (e.ctrlKey && e.altKey && e.key === "d") {
      e.preventDefault();
      switchToPreviousSpeed();
    } else if (e.ctrlKey && e.altKey && e.key === "s") {
      e.preventDefault();
      switchToNextSpeed();
    }
  });
}

async function switchToPreviousSpeed() {
  if (siteDisabled) return;
  const presets = await getSpeedPresets();
  const index = presets.indexOf(currentSpeed);
  if (index > 0) {
    currentSpeed = presets[index - 1];
    applySpeedToAllVideos();
    showSpeedIndicator();
    updateSpeedDisplay();
    showSpeedUpdateNotification(currentSpeed);
    if (window.top === window.self) {
      chrome.runtime.sendMessage({
        action: "updateBadge",
        speed: currentSpeed,
      });
    }
    saveSpeed();
  }
}

async function switchToNextSpeed() {
  if (siteDisabled) return;
  const presets = await getSpeedPresets();
  const index = presets.indexOf(currentSpeed);
  if (index >= 0 && index < presets.length - 1) {
    currentSpeed = presets[index + 1];
    applySpeedToAllVideos();
    showSpeedIndicator();
    updateSpeedDisplay();
    showSpeedUpdateNotification(currentSpeed);
    if (window.top === window.self) {
      chrome.runtime.sendMessage({
        action: "updateBadge",
        speed: currentSpeed,
      });
    }
    saveSpeed();
  }
}

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
    updateSpeedDisplay();

    // Update badge in extension icon - only send message from top-level frame
    if (window.top === window.self) {
      try {
        chrome.runtime.sendMessage({
          action: "updateBadge",
          speed: currentSpeed,
        });
      } catch (e) {}
    }

    saveSpeed();
  }
}

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
    updateSpeedDisplay();

    // Update badge in extension icon - only send message from top-level frame
    if (window.top === window.self) {
      try {
        chrome.runtime.sendMessage({
          action: "updateBadge",
          speed: currentSpeed,
        });
      } catch (e) {}
    }

    saveSpeed();
  }
}

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
    } catch (e) {}
  }

  saveSpeed();
}

// Save the current speed
function saveSpeed() {
  if (siteDisabled) return;

  // Only save general speed if in the top-level frame
  if (window.top === window.self) {
    try {
      chrome.storage.sync.set({ speed: currentSpeed });
    } catch (e) {}
  } else {
  }

  // Save site-specific speed if enabled
  if (rememberSpeedEnabled) {
    // Only save site-specific settings if in the top-level frame
    if (window.top === window.self) {
      const hostname = window.location.hostname;
      try {
        chrome.storage.sync.get(["siteSettings"], function (data) {
          const siteSettings = data.siteSettings || {};
          siteSettings[hostname] = currentSpeed;
          try {
            chrome.storage.sync.set({ siteSettings: siteSettings });
          } catch (e) {}
        });
      } catch (e) {}
    } else {
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
  } catch (e) {}

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

  const speedPresets = await getSpeedPresets();

  // Add speed presets
  speedPresets.forEach((speed) => {
    const item = createSpeedMenuItem(speed);
    menuPortal.appendChild(item);
  });

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
  // Handle messages regardless of frame level for critical functionality
  if (message.action === "disableSite") {
    const hostname = window.location.hostname;
    if (!message.hostname || message.hostname === hostname) {
      siteDisabled = true;
      resetAllVideosToNormalSpeed();
    }
  } else if (message.action === "enableSite") {
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

// Add message passing for iframes
window.addEventListener("message", function (event) {
  // Verify message origin for security
  if (event.data && event.data.type === "VIDEO_SPEED_CONTROL") {
    switch (event.data.action) {
      case "SET_SPEED":
        if (!siteDisabled && event.data.speed) {
          const videos = document.querySelectorAll("video");
          videos.forEach((video) => {
            video.playbackRate = event.data.speed;
          });
        }
        break;
      case "GET_SPEED":
        const videos = document.querySelectorAll("video");
        if (videos.length > 0) {
          event.source.postMessage(
            {
              type: "VIDEO_SPEED_CONTROL",
              action: "SPEED_UPDATE",
              speed: videos[0].playbackRate,
            },
            "*"
          );
        }
        break;
    }
  }
});

function showSpeedUpdateNotification(speed) {
  const notification = document.createElement("div");
  notification.textContent = `Speed: ${speed.toFixed(2)}x`;
  notification.style.position = "fixed";
  notification.style.top = "10px";
  notification.style.right = "10px";
  notification.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  notification.style.color = "white";
  notification.style.padding = "10px 15px";
  notification.style.borderRadius = "5px";
  notification.style.fontSize = "22px";
  notification.style.zIndex = "9999";
  notification.style.transition = "opacity 0.5s";
  document.body.appendChild(notification);

  // Fade out and remove the notification after 2 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 2000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
