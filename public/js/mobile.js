function isDeviceMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getMobileMode() {
  const override = localStorage.getItem("forceMobile");
  if (override !== null) return override === "true";
  return isDeviceMobile();
}

function setMobileOverride(v) {
  if (v === null) {
    localStorage.removeItem("forceMobile");
  } else {
    localStorage.setItem("forceMobile", v ? "true" : "false");
  }
}

function getDeviceType() {
  return isDeviceMobile() ? "mobile" : "desktop";
}

function updateMobileUI() {
  const toggle = document.getElementById("mobileToggle");
  const deviceInfo = document.getElementById("deviceInfo");

  console.log("Toggle found:", toggle);
  console.log("DeviceInfo found:", deviceInfo);

  if (!toggle) return;

  const override = localStorage.getItem("forceMobile");
  const detectedDevice = getDeviceType();
  const currentMode = getMobileMode() ? "mobile" : "desktop";

  toggle.checked = override === "true";

  if (deviceInfo) {
    if (override === null) {
      deviceInfo.textContent = `device: ${detectedDevice}`;
    } else {
      if (override === "true" && detectedDevice === "mobile") {
        deviceInfo.textContent = `device: mobile`;
      } else if (override === "false" && detectedDevice === "desktop") {
        deviceInfo.textContent = `device: desktop`;
      } else {
        deviceInfo.textContent = `device: ${currentMode} (forced)`;
      }
    }
  } else {
    console.error("deviceInfo element not found!");
  }
}

function transformGameUrl(originalUrl) {
  if (!getMobileMode()) {
    return originalUrl;
  }

  const skipPatterns = [
    '/mobile.html',
    '/gamefile/nowgg/',
    '/extra/',
    'http://',
    'https://'
  ];

  for (const pattern of skipPatterns) {
    if (originalUrl.includes(pattern)) {
      return originalUrl;
    }
  }

  return `/mobile.html?url=${encodeURIComponent(originalUrl)}`;
}

function transformGameData(games) {
  if (!getMobileMode()) {
    return games;
  }

  return games.map(game => ({
    ...game,
    url: transformGameUrl(game.url)
  }));
}

async function loadGames() {
  try {
    const response = await fetch('/path/to/games.json');
    const data = await response.json();
    const transformedGames = transformGameData(data.games);
    return transformedGames;
  } catch (error) {
    console.error('error:', error);
    return [];
  }
}

function getGameUrl(gameUrl) {
  return transformGameUrl(gameUrl);
}

function autoTransformGameLinks() {
  if (!getMobileMode()) return;

  const gameLinks = document.querySelectorAll('[data-game-url]');
  gameLinks.forEach(link => {
    const originalUrl = link.getAttribute('data-game-url');
    const transformedUrl = transformGameUrl(originalUrl);
    link.href = transformedUrl;
  });

  const gameIframes = document.querySelectorAll('iframe[data-game-url]');
  gameIframes.forEach(iframe => {
    const originalUrl = iframe.getAttribute('data-game-url');
    const transformedUrl = transformGameUrl(originalUrl);
    iframe.src = transformedUrl;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoTransformGameLinks);
} else {
  autoTransformGameLinks();
}

const mobileInitInterval = setInterval(() => {
  const toggle = document.getElementById("mobileToggle");

  if (toggle) {
    toggle.addEventListener("change", () => {
      setMobileOverride(toggle.checked);
      updateMobileUI();
      
      setTimeout(() => {
        location.reload();
      }, 500);
    });

    updateMobileUI();
    clearInterval(mobileInitInterval);
  }
}, 100);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getMobileMode,
    transformGameUrl,
    transformGameData,
    loadGames,
    getGameUrl,
    getDeviceType
  };
}