self.importScripts(
  "/scram/scramjet.codecs.js",
  "/scram/scramjet.config.js",
  "/scram/scramjet.bundle.js",
  "/scram/scramjet.worker.js"
);

self.__scramjet$config = {
  ...(self.__scramjet$config || {}),
  prefix: "/scram/service/",
  config: "/scram/scramjet.config.js?v=20260408-3",
  bundle: "/scram/scramjet.bundle.js",
  worker: "/scram/scramjet.worker.js",
  client: "/scram/scramjet.client.js?v=20260408-3",
  codecs: "/scram/scramjet.codecs.js",
};

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeHeaderValue(entry))
      .filter(Boolean)
      .join(", ");
  }

  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "object") {
    if (typeof value.href === "string") {
      return value.href;
    }

    if (typeof value.url === "string") {
      return value.url;
    }
  }

  return String(value);
}

function normalizeHeaders(headers) {
  const normalized = {};

  for (const [key, value] of Object.entries(headers || {})) {
    normalized[key] = normalizeHeaderValue(value);
  }

  return normalized;
}

const originalRewriteHeaders = self.__scramjet$bundle?.rewriters?.rewriteHeaders;
const originalRewriteHtml = self.__scramjet$bundle?.rewriters?.rewriteHtml;

if (typeof originalRewriteHeaders === "function") {
  self.__scramjet$bundle.rewriters.rewriteHeaders = (headers, targetUrl) => {
    const normalizedHeaders = normalizeHeaders(headers);

    try {
      return originalRewriteHeaders(normalizedHeaders, targetUrl);
    } catch (error) {
      // Some redirected responses return non-standard header shapes. Drop the
      // URL-rewritten fields and retry so navigation can continue.
      console.warn("scramjet header rewrite fallback", error);

      delete normalizedHeaders.location;
      delete normalizedHeaders["content-location"];
      delete normalizedHeaders.referer;

      if (typeof normalizedHeaders.link !== "string") {
        delete normalizedHeaders.link;
      }

      return originalRewriteHeaders(normalizedHeaders, targetUrl);
    }
  };
}

if (typeof originalRewriteHtml === "function") {
  self.__scramjet$bundle.rewriters.rewriteHtml = (html, targetUrl) => {
    const rewrittenHtml = originalRewriteHtml(html, targetUrl);
    const shimTag = '<script src="/scram/client-shim.js?v=20260408-3"></script>';

    if (rewrittenHtml.includes(shimTag)) {
      return rewrittenHtml;
    }

    const headMatch = rewrittenHtml.match(/<head(\s[^>]*)?>/i);
    if (headMatch) {
      return rewrittenHtml.replace(headMatch[0], `${headMatch[0]}${shimTag}`);
    }

    if (rewrittenHtml.includes("</head>")) {
      return rewrittenHtml.replace("</head>", `${shimTag}</head>`);
    }

    return `${shimTag}${rewrittenHtml}`;
  };
}

const scramjetServiceWorker = new self.ScramjetServiceWorker(self.__scramjet$config);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (scramjetServiceWorker.route(event)) {
    event.respondWith(scramjetServiceWorker.fetch(event));
    return;
  }

  event.respondWith(fetch(event.request));
});
