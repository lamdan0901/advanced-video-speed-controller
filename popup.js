document.addEventListener("DOMContentLoaded", function () {
  // Save speed button presets when popup loads
  const speedButtons = document.querySelectorAll(".speed-btn");
  const presets = Array.from(speedButtons)
    .map((btn) => parseFloat(btn.dataset.speed))
    .sort((a, b) => a - b);
  chrome.storage.sync.set({ speedButtonPresets: presets });

  const speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  const addPresetBtn = document.getElementById("add-preset-btn");
  const newPresetInput = document.getElementById("new-preset");
  const presetsContainer = document.getElementById("presets-container");
  const rememberSpeedCheckbox = document.getElementById("remember-speed");
  const keyboardShortcutsCheckbox =
    document.getElementById("keyboard-shortcuts");
  const disableSiteCheckbox = document.getElementById("disable-site");
  const youtubeSpeedSelectorCheckbox = document.getElementById(
    "youtube-speed-selector"
  );

  let currentSpeed = 1.0;
  let customPresets = [];
  let currentHostname = "";

  // Attach event handler for disable site checkbox early
  disableSiteCheckbox.addEventListener("change", function () {
    if (!currentHostname) {
      console.warn("[DEBUG] Checkbox changed but currentHostname is not set");
      return;
    }

    const isDisabling = disableSiteCheckbox.checked;
    console.log(
      `[DEBUG] Checkbox changed. isDisabling: ${isDisabling}, currentHostname: ${currentHostname}`
    );

    chrome.storage.sync.get(
      ["disabledSites", "speed", "siteSettings"], // Removed rememberSpeed
      function (data) {
        if (chrome.runtime.lastError) {
          console.error("[DEBUG] Storage get error:", chrome.runtime.lastError);
        }
        const disabledSites = data.disabledSites || {};

        if (isDisabling) {
          disabledSites[currentHostname] = true;
          updateUIForDisabledState(true);

          // Send message to content script to disable
          chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: "disableSite",
                  hostname: currentHostname,
                });
              }
            }
          );

          // Update badge
          chrome.runtime.sendMessage({
            action: "updateBadge",
            disabled: true,
          });
        } else {
          delete disabledSites[currentHostname];
          updateUIForDisabledState(false);

          // Load and apply the correct speed for this site
          let speedToApply = 1.0;
          // Always prioritize site-specific setting if it exists
          if (data.siteSettings && data.siteSettings[currentHostname]) {
            speedToApply = data.siteSettings[currentHostname];
          } else if (data.speed) {
            // Fallback to global speed if site-specific doesn't exist
            speedToApply = data.speed;
          }

          // Update UI with the correct speed
          currentSpeed = speedToApply;
          speedSlider.value = currentSpeed;
          speedValue.textContent = currentSpeed
            .toFixed(2)
            .replace(/\.?0+$/, "");
          updateActiveSpeedButton(currentSpeed);

          // First send enable message
          chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: "enableSite",
                  hostname: currentHostname,
                });
              }
            }
          );

          // Then update badge
          chrome.runtime.sendMessage({
            action: "updateBadge",
            speed: currentSpeed,
            disabled: false,
          });
        }

        // Save disabled sites state
        chrome.storage.sync.set({ disabledSites: disabledSites }, function () {
          if (chrome.runtime.lastError) {
            console.error(
              "[DEBUG] Storage set error:",
              chrome.runtime.lastError
            );
          }
          chrome.runtime.sendMessage({ action: "updateSiteStatus" });
        });
      }
    );
  });

  // Get current tab's hostname, then load settings
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        currentHostname = url.hostname;
        console.log(`[DEBUG] Got currentHostname: ${currentHostname}`);

        // Always reset currentSpeed to 1.0 before loading settings for a new site
        currentSpeed = 1.0;

        // Now load all settings after hostname is set
        chrome.storage.sync.get(
          [
            "presets",
            "keyboardShortcuts",
            "siteSettings",
            "disabledSites",
            "rememberSpeedEnabled", // Add this to track remember speed globally
            "youtubeSpeedSelectorEnabled", // Add this to track YouTube speed selector
          ],
          function (data) {
            if (chrome.runtime.lastError) {
              console.error(
                "[DEBUG] Storage get error:",
                chrome.runtime.lastError
              );
            }
            const disabledSites = data.disabledSites || {};
            const isDisabled = !!disabledSites[currentHostname];
            disableSiteCheckbox.checked = isDisabled;
            console.log(
              `[DEBUG] Initial load: isDisabled: ${isDisabled}, currentHostname: ${currentHostname}`
            );

            // Default remember speed to true if not set
            const rememberedGlobally = data.rememberSpeedEnabled !== false;
            rememberSpeedCheckbox.checked = rememberedGlobally;

            // Default YouTube speed selector to true if not set
            youtubeSpeedSelectorCheckbox.checked =
              data.youtubeSpeedSelectorEnabled !== false;

            // Always try to load site-specific speed first if site is not disabled and remember speed is enabled
            let siteSpeedFound = false;
            if (
              rememberedGlobally &&
              data.siteSettings &&
              currentHostname &&
              !isDisabled
            ) {
              if (data.siteSettings[currentHostname]) {
                currentSpeed = parseFloat(data.siteSettings[currentHostname]);
                siteSpeedFound = true;
                console.log(
                  "[DEBUG] Loaded site-specific speed:",
                  currentSpeed
                );
              }
            }

            // If no site-specific speed was found and site is not disabled, keep default 1.0
            if (!siteSpeedFound && !isDisabled) {
              currentSpeed = 1.0;
              console.log("[DEBUG] Using default speed 1.0");
            }

            // Update UI elements
            if (data.keyboardShortcuts !== undefined) {
              keyboardShortcutsCheckbox.checked = data.keyboardShortcuts;
            }

            if (data.presets && Array.isArray(data.presets)) {
              customPresets = data.presets;
              renderPresets();
            }

            // Update speed UI only if site is not disabled
            if (!isDisabled) {
              speedSlider.value = currentSpeed;
              speedValue.textContent = currentSpeed
                .toFixed(2)
                .replace(/\.?0+$/, "");
              updateActiveSpeedButton(currentSpeed);
              // Always send the correct speed to the content script for the new site
              sendSpeedToActiveTab(currentSpeed);
              // Also update the extension badge to reflect the current speed
              chrome.runtime.sendMessage({
                action: "updateBadge",
                speed: currentSpeed,
                disabled: false,
              });
            }

            // Always update UI state for disabled status
            updateUIForDisabledState(isDisabled);
          }
        );
      } catch (e) {
        console.error("[DEBUG] Error parsing URL:", e);
      }
    } else {
      console.warn("[DEBUG] No active tab or URL found.");
    }
  });

  // Speed slider event
  speedSlider.addEventListener("input", function () {
    currentSpeed = parseFloat(this.value);
    speedValue.textContent = currentSpeed.toFixed(2).replace(/\.?0+$/, "");
    updateActiveSpeedButton(currentSpeed);

    // Send message to content script
    sendSpeedToActiveTab(currentSpeed);

    // Update badge in extension icon
    chrome.runtime.sendMessage({
      action: "updateBadge",
      speed: currentSpeed,
    });

    // Save the current speed
    chrome.storage.sync.set({ speed: currentSpeed });
    saveSiteSpeedIfNeeded(currentSpeed);
  });

  // Speed buttons
  speedButtons.forEach((button) => {
    button.addEventListener("click", function () {
      currentSpeed = parseFloat(this.dataset.speed);
      speedSlider.value = currentSpeed;
      speedValue.textContent = currentSpeed.toFixed(2).replace(/\.?0+$/, "");
      updateActiveSpeedButton(currentSpeed);

      // Send message to content script
      sendSpeedToActiveTab(currentSpeed);

      // Update badge in extension icon
      chrome.runtime.sendMessage({
        action: "updateBadge",
        speed: currentSpeed,
      });

      // Save the current speed
      chrome.storage.sync.set({ speed: currentSpeed });
      saveSiteSpeedIfNeeded(currentSpeed);
    });
  });

  // Add preset button
  addPresetBtn.addEventListener("click", function () {
    const presetValue = newPresetInput.value.trim();
    const presetSpeed = parseFloat(presetValue);

    if (isNaN(presetSpeed) || presetSpeed < 0.1 || presetSpeed > 5) {
      alert("Please enter a valid speed between 0.1 and 5");
      return;
    }

    // Check if preset already exists
    if (!customPresets.some((p) => Math.abs(p - presetSpeed) < 0.001)) {
      customPresets.push(presetSpeed);
      customPresets.sort((a, b) => a - b);
      chrome.storage.sync.set({ presets: customPresets });
      renderPresets();
      newPresetInput.value = "";
    } else {
      alert("This preset already exists");
    }
  });

  // Settings checkboxes
  rememberSpeedCheckbox.addEventListener("change", function () {
    const remembering = this.checked;

    // Save the remember speed setting globally
    chrome.storage.sync.set({ rememberSpeedEnabled: remembering });

    // Handle current site
    if (remembering) {
      // If enabling remember speed, save current speed for this site
      saveSiteSpeedIfNeeded(currentSpeed);
    } else {
      // If disabling remember speed, remove saved speed for this site
      if (currentHostname) {
        chrome.storage.sync.get(["siteSettings"], function (data) {
          const siteSettings = data.siteSettings || {};
          if (siteSettings[currentHostname]) {
            delete siteSettings[currentHostname];
            chrome.storage.sync.set({ siteSettings });
            console.log(`[DEBUG] Removed saved speed for ${currentHostname}`);
          }
        });
      }
    }
  });

  keyboardShortcutsCheckbox.addEventListener("change", function () {
    chrome.storage.sync.set({ keyboardShortcuts: this.checked });

    // Send message to content script to update keyboard shortcut setting
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          keyboardShortcuts: keyboardShortcutsCheckbox.checked,
        });
      }
    });
  });

  youtubeSpeedSelectorCheckbox.addEventListener("change", function () {
    chrome.storage.sync.set({ youtubeSpeedSelectorEnabled: this.checked });

    // Show reload message
    const reloadMessage = document.getElementById("youtube-reload-message");
    reloadMessage.classList.add("show");

    // Update content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          youtubeSpeedSelectorEnabled: youtubeSpeedSelectorCheckbox.checked,
        });
      }
    });
  });

  // Hide reload message when popup reopens
  chrome.storage.sync.get(["youtubeSpeedSelectorEnabled"], function (data) {
    const reloadMessage = document.getElementById("youtube-reload-message");
    reloadMessage.classList.remove("show");
  });

  // Helper functions
  function updateActiveSpeedButton(speed) {
    speedButtons.forEach((button) => {
      const buttonSpeed = parseFloat(button.dataset.speed);
      if (Math.abs(buttonSpeed - speed) < 0.01) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });
  }

  function saveSiteSpeedIfNeeded(speed) {
    // Only save if remember speed is checked and we have a hostname
    if (rememberSpeedCheckbox.checked && currentHostname) {
      chrome.storage.sync.get(["siteSettings"], function (data) {
        if (chrome.runtime.lastError) {
          console.error(
            "[DEBUG] Storage get error in saveSiteSpeedIfNeeded:",
            chrome.runtime.lastError
          );
          return;
        }
        const siteSettings = data.siteSettings || {};
        siteSettings[currentHostname] = speed;
        chrome.storage.sync.set({ siteSettings }, function () {
          if (chrome.runtime.lastError) {
            console.error(
              "[DEBUG] Storage set error in saveSiteSpeedIfNeeded:",
              chrome.runtime.lastError
            );
          } else {
            console.log(`[DEBUG] Saved speed ${speed} for ${currentHostname}`);
          }
        });
      });
    }
  }

  function renderPresets() {
    presetsContainer.innerHTML = "";

    customPresets.forEach((preset) => {
      const presetBtn = document.createElement("div");
      presetBtn.className = "preset-btn";

      // Format the preset value to preserve exact decimals
      const formattedValue = preset.toFixed(2).replace(/\.?0+$/, "");
      presetBtn.innerHTML = `${formattedValue}x <span class="remove">×</span>`;

      presetBtn.addEventListener("click", function (e) {
        // Check if the click was on the remove button
        if (e.target.classList.contains("remove")) {
          // Remove preset
          customPresets = customPresets.filter(
            (p) => Math.abs(p - preset) > 0.001
          );
          chrome.storage.sync.set({ presets: customPresets });
          renderPresets();
        } else {
          // Apply preset speed (only if not clicking on remove button)
          currentSpeed = preset;
          speedSlider.value = currentSpeed;
          speedValue.textContent = currentSpeed
            .toFixed(2)
            .replace(/\.?0+$/, "");
          updateActiveSpeedButton(currentSpeed);

          // Send message to content script
          sendSpeedToActiveTab(currentSpeed);

          // Update badge in extension icon
          chrome.runtime.sendMessage({
            action: "updateBadge",
            speed: currentSpeed,
          });

          // Save the current speed
          chrome.storage.sync.set({ speed: currentSpeed });
          saveSiteSpeedIfNeeded(currentSpeed);
        }
      });

      presetsContainer.appendChild(presetBtn);
    });
  }

  function sendSpeedToActiveTab(speed) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "setSpeed",
          speed: speed,
          // rememberSpeed is no longer needed here
        });
      }
    });
  }

  function updateUIForDisabledState(disabled) {
    console.log("[DEBUG] updateUIForDisabledState called with:", disabled);

    // Update the speed value display
    if (disabled) {
      speedValue.textContent = "OFF";
    } else {
      speedValue.textContent = currentSpeed.toFixed(2).replace(/\.?0+$/, "");
    }

    // Do NOT disable or enable UI elements anymore
    // Remove the disabling logic for UI elements and checkboxes

    // Update speed buttons appearance only (not disabled state)
    speedButtons.forEach((btn) => {
      if (disabled) {
        btn.classList.add("disabled");
      } else {
        btn.classList.remove("disabled");
      }
    });

    // Update preset buttons appearance only (not disabled state)
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      if (disabled) {
        btn.classList.add("disabled");
      } else {
        btn.classList.remove("disabled");
      }
    });

    // Update container styling
    const container = document.querySelector(".container");
    if (disabled) {
      container.classList.add("site-disabled");
    } else {
      container.classList.remove("site-disabled");
    }

    // The disable site checkbox should always remain enabled
    disableSiteCheckbox.disabled = false;
    console.log(
      `[DEBUG] disableSiteCheckbox.disabled: ${disableSiteCheckbox.disabled}, checked: ${disableSiteCheckbox.checked}`
    );

    // Update the label for the disable site checkbox
    const disableSiteLabel = document.querySelector(
      'label[for="disable-site"]'
    );
    if (disableSiteLabel) {
      disableSiteLabel.textContent = disabled
        ? "Re-enable on this site"
        : "Disable on this site";
    }
  }
});
