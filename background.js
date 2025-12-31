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
    if (tabs[0] && tabs[0].id) {
      // Check for chrome:// URLs first
      if (tabs[0].url && tabs[0].url.startsWith("chrome://")) {
        chrome.action.setBadgeText({ text: "" });
        return;
      }

      // Try to get real status from content script
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "getSpeed" },
        (response) => {
          if (!chrome.runtime.lastError && response) {
            updateBadge(response.speed, response.disabled);
          } else {
            // Fallback to storage if content script not ready or error
            updateBadgeFromStorage(tabs[0]);
          }
        }
      );
    }
  });
}

function updateBadgeFromStorage(tab) {
  if (!tab || !tab.url) return;
  try {
    const currentUrl = new URL(tab.url);
    const hostname = currentUrl.hostname;

    chrome.storage.sync.get(
      ["disabledSites", "siteSettings", "rememberSpeedEnabled"],
      function (data) {
        const disabledSites = data.disabledSites || {};
        const isDisabled = !!disabledSites[hostname];

        if (isDisabled) {
          updateBadge(1.0, true); // function updateBadge handles the "OFF" text based on disabled param? No, wait.
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
          }

          updateBadge(speedToShow, false);
        }
      }
    );
  } catch (e) {}
}

// Update the badge with the current speed
function updateBadge(speed, disabled) {
  if (disabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#888888" });
    return;
  }

  // Format the speed value (remove trailing zeros)
  const formattedSpeed = parseFloat(speed)
    .toFixed(2)
    .replace(/\.?0+$/, "");

  let bgColor = "#4285F4";
  if (speed < 1.0) {
    bgColor = "#EA4335";
  } else if (speed > 1.0) {
    bgColor = "#34A853";
  }

  chrome.action.setBadgeText({ text: formattedSpeed });
  chrome.action.setBadgeBackgroundColor({ color: bgColor });
}
