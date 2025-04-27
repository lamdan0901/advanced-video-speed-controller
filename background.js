// Initialize badge when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  updateBadgeForCurrentTab();
});

// Listen for tab changes to update badge accordingly
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateBadgeForCurrentTab();
});

// Listen for tab updates to update badge accordingly
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateBadgeForCurrentTab();
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateBadge") {
    updateBadge(message.speed, message.disabled);
    sendResponse({ success: true });
  } else if (message.action === "updateSiteStatus") {
    // Ensure immediate badge update when site status changes
    updateBadgeForCurrentTab();
    sendResponse({ success: true });
  }
});

// Update badge for the current active tab
function updateBadgeForCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith("chrome://")) {
      const currentUrl = new URL(tabs[0].url);
      const hostname = currentUrl.hostname;

      chrome.storage.sync.get(
        ["disabledSites", "siteSettings", "rememberSpeedEnabled"],
        function (data) {
          const disabledSites = data.disabledSites || {};
          const isDisabled = !!disabledSites[hostname];

          if (isDisabled) {
            chrome.action.setBadgeText({ text: "OFF" });
            chrome.action.setBadgeBackgroundColor({ color: "#888888" });
          } else {
            // Site is enabled, determine speed to show
            let speedToShow = 1.0; // Default speed

            // Use site-specific speed ONLY if remember speed is enabled
            if (
              data.rememberSpeedEnabled !== false && // Check if remember speed is enabled (default true)
              data.siteSettings &&
              data.siteSettings[hostname]
            ) {
              speedToShow = data.siteSettings[hostname];
            } else {
              // For new sites or when remember speed is off, always use 1.0
            }

            updateBadge(speedToShow, false);
          }
        }
      );
    }
  });
}

// Update the badge with the current speed
function updateBadge(speed, disabled) {
  if (disabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#888888" });
    return;
  }

  // Format the speed value (remove trailing zeros)
  const formattedSpeed = speed.toFixed(2).replace(/\.?0+$/, "");

  // Set badge text and color
  chrome.action.setBadgeText({ text: formattedSpeed });

  let color = "#4285F4"; // Default blue
  if (speed < 1.0) {
    color = "#34A853"; // Green for slower speeds
  } else if (speed > 1.0) {
    color = "#EA4335"; // Red for faster speeds
  }

  chrome.action.setBadgeBackgroundColor({ color: color });
}
