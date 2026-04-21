const BRIDGE_READY_MESSAGE = "scramjet-bridge-ready";
const BRIDGE_ERROR_MESSAGE = "scramjet-bridge-error";
const HOST_URL_MESSAGE = "scramjet-host-url";
const HOST_FRAME_LOADED_MESSAGE = "scramjet-host-frame-loaded";
const HOST_LOAD_MESSAGE = "scramjet-load";
const HOST_BACK_MESSAGE = "scramjet-back";
const HOST_FORWARD_MESSAGE = "scramjet-forward";
const HOST_RELOAD_MESSAGE = "scramjet-reload";
const SCRAMJET_SW_URL = "/scram/sw.js?v=20260408-6";
const SCRAMJET_PREFIX = "/scram/service/";
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
const bareClient = new BareMux.BareClient("/baremux/worker.js");
const bareMuxChannel = new BroadcastChannel("bare-mux");
const searchParams = new URLSearchParams(location.search);
const isHostMode = searchParams.get("mode") === "host";
const proxyFrame = document.getElementById("proxy-frame");
let initPromise = null;
let lastProxyUrl = "";
let lastProxyFrameLocation = "";
let pendingLoadUrl = searchParams.get("url") || "";
let lastRecoveredEscapedPath = "";
let lastRecoveredProxy404Url = "";

window.__scramjet$config = {
  ...(window.__scramjet$config || {}),
  prefix: SCRAMJET_PREFIX,
  config: "/scram/scramjet.config.js?v=20260408-3",
  bundle: "/scram/scramjet.bundle.js",
  worker: "/scram/scramjet.worker.js",
  client: "/scram/scramjet.client.js?v=20260408-3",
  codecs: "/scram/scramjet.codecs.js",
};

if (isHostMode) {
  document.body.classList.add("host-mode");
}

function getWispUrl() {
  return (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
}

function postToParent(type, extra = {}) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type, ...extra }, location.origin);
  }
}

function encodeScramjetUrl(url) {
  return window.__scramjet$bundle.rewriters.url.encodeUrl(url, new URL(url));
}

function decodeScramjetUrl(url) {
  return window.__scramjet$bundle.rewriters.url.decodeUrl(url);
}

function getRecoveredProxy404Url(decodedUrl) {
  if (!decodedUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(decodedUrl);
    const fromUrl = parsedUrl.searchParams.get("fromUrl");
    if (parsedUrl.pathname !== "/404" || !fromUrl) {
      return "";
    }

    const normalizedFromUrl = fromUrl.startsWith(location.origin)
      ? fromUrl.slice(location.origin.length)
      : fromUrl;

    if (!normalizedFromUrl.startsWith(SCRAMJET_PREFIX)) {
      return "";
    }

    const recoveredUrl = decodeScramjetUrl(location.origin + normalizedFromUrl);
    if (!recoveredUrl || recoveredUrl === lastRecoveredProxy404Url || recoveredUrl === decodedUrl) {
      return "";
    }

    lastRecoveredProxy404Url = recoveredUrl;
    return recoveredUrl;
  } catch {
    return "";
  }
}

async function waitForRegistrationActivation(registration) {
  if (registration.active || registration.waiting) {
    return registration;
  }

  const worker = registration.installing;
  if (!worker) {
    return registration;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, 10000);

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        clearTimeout(timeoutId);
        resolve();
      } else if (worker.state === "redundant") {
        clearTimeout(timeoutId);
        reject(new Error("Scramjet service worker became redundant during activation."));
      }
    });
  });

  return registration;
}

async function waitForScramjetController() {
  if (navigator.serviceWorker.controller?.scriptURL.includes("/scram/sw.js")) {
    return;
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, 10000);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (navigator.serviceWorker.controller?.scriptURL.includes("/scram/sw.js")) {
        clearTimeout(timeoutId);
        resolve();
      }
    }, { once: true });
  });
}

function announceRemoteClient() {
  bareMuxChannel.postMessage({ type: "setremote" });
}

function setupBareMuxBridgeBroadcast() {
  bareMuxChannel.addEventListener("message", (event) => {
    if (event.data?.type === "find") {
      announceRemoteClient();
    }
  });
}

async function readResponseBody(response) {
  if ([101, 204, 205, 304].includes(response.status)) {
    return null;
  }

  try {
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function normalizeResponseHeaders(response) {
  const source = response.rawHeaders || Object.fromEntries(response.headers);
  const normalized = {};

  for (const [key, value] of Object.entries(source || {})) {
    normalized[key] = normalizeHeaderValue(value);
  }

  return normalized;
}

async function handleScramjetRemoteRequest(data) {
  const response = await bareClient.fetch(data.remote, {
    method: data.method,
    headers: data.headers,
    body: data.body ?? undefined,
    redirect: "manual",
  });

  const body = await readResponseBody(response);
  const payload = {
    type: "response",
    id: data.id,
    status: response.status,
    statusText: response.statusText,
    headers: normalizeResponseHeaders(response),
    body,
  };

  if (!navigator.serviceWorker.controller) {
    throw new Error("Scramjet bridge has no controlling service worker.");
  }

  if (body) {
    navigator.serviceWorker.controller.postMessage(payload, [body]);
  } else {
    navigator.serviceWorker.controller.postMessage(payload);
  }
}

function setupScramjetRemoteClient() {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "request") {
      return;
    }

    handleScramjetRemoteRequest(event.data).catch((error) => {
      console.error("scramjet remote request error", error);
      navigator.serviceWorker.controller?.postMessage({
        type: "error",
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

function getRecoveredEscapedUrl(currentUrl) {
  if (!lastProxyUrl || !currentUrl.startsWith(location.origin + "/")) {
    return "";
  }

  const escapedPath = currentUrl.slice(location.origin.length);
  if (!escapedPath || escapedPath.startsWith("/scram/")) {
    return "";
  }

  if (escapedPath === lastRecoveredEscapedPath) {
    return "";
  }

  try {
    lastRecoveredEscapedPath = escapedPath;
    return new URL(escapedPath, new URL(lastProxyUrl)).href;
  } catch {
    return "";
  }
}

function loadProxyUrl(url) {
  if (!isHostMode || !proxyFrame || !url) {
    return;
  }

  lastProxyUrl = url;
  lastProxyFrameLocation = "";
  lastRecoveredEscapedPath = "";
  proxyFrame.src = encodeScramjetUrl(url);
}

function syncProxyFrameUrl() {
  if (!isHostMode || !proxyFrame) {
    return;
  }

  try {
    const currentUrl = proxyFrame.contentWindow.location.href;
    if (!currentUrl || currentUrl === "about:blank" || currentUrl === lastProxyFrameLocation) {
      return;
    }

    lastProxyFrameLocation = currentUrl;

    if (currentUrl.startsWith(location.origin + SCRAMJET_PREFIX)) {
      const decodedUrl = decodeScramjetUrl(currentUrl);
      if (decodedUrl) {
        const recoveredProxy404Url = getRecoveredProxy404Url(decodedUrl);
        if (recoveredProxy404Url) {
          loadProxyUrl(recoveredProxy404Url);
          return;
        }

        lastProxyUrl = decodedUrl;
        postToParent(HOST_URL_MESSAGE, { url: decodedUrl });
      }
      return;
    }

    const recoveredUrl = getRecoveredEscapedUrl(currentUrl);
    if (recoveredUrl) {
      loadProxyUrl(recoveredUrl);
      return;
    }

    postToParent(HOST_URL_MESSAGE, { url: currentUrl });
  } catch {
  }
}

function setupHostBridge() {
  if (!isHostMode || !proxyFrame) {
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) {
      return;
    }

    switch (event.data?.type) {
      case HOST_LOAD_MESSAGE:
        loadProxyUrl(event.data.url);
        break;
      case HOST_BACK_MESSAGE:
        try {
          proxyFrame.contentWindow.history.back();
        } catch {
        }
        break;
      case HOST_FORWARD_MESSAGE:
        try {
          proxyFrame.contentWindow.history.forward();
        } catch {
        }
        break;
      case HOST_RELOAD_MESSAGE:
        try {
          proxyFrame.contentWindow.location.reload();
        } catch {
        }
        break;
      default:
        break;
    }
  });

  proxyFrame.addEventListener("load", () => {
    syncProxyFrameUrl();
    postToParent(HOST_FRAME_LOADED_MESSAGE);
  });

  setInterval(syncProxyFrameUrl, 250);
}

async function initializeBridge() {
  if (!initPromise) {
    initPromise = (async () => {
      await connection.setTransport("/libcurl/index.mjs", [
        { websocket: getWispUrl() }
      ]);

      const registration = await navigator.serviceWorker.register(SCRAMJET_SW_URL, {
        scope: "/scram/",
        updateViaCache: "none",
      });

      await registration.update();
      await waitForRegistrationActivation(registration);
      await waitForScramjetController();
      setupScramjetRemoteClient();
      setupBareMuxBridgeBroadcast();
      setupHostBridge();
      announceRemoteClient();

      postToParent(BRIDGE_READY_MESSAGE);

      if (pendingLoadUrl) {
        loadProxyUrl(pendingLoadUrl);
        pendingLoadUrl = "";
      }
    })().catch((error) => {
      initPromise = null;
      console.error("scramjet bridge init error", error);
      postToParent(BRIDGE_ERROR_MESSAGE, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }

  return initPromise;
}

window.addEventListener("load", () => {
  initializeBridge().catch(() => {});
});
