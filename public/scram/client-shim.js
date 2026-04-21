(function () {
  const scramPrefix = self.__scramjet$config?.prefix || "/scram/service/";
  const scramOriginPrefix = location.origin + scramPrefix;

  function getDecodedBaseUrl() {
    try {
      return new URL(self.__scramjet$bundle.rewriters.url.decodeUrl(location.href));
    } catch {
      return new URL(location.href);
    }
  }

  function isIgnoredScheme(value) {
    return /^(about:|blob:|data:|javascript:|mailto:|tel:|#)/i.test(value);
  }

  function encodeNavigationTarget(value) {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed || isIgnoredScheme(trimmed) || trimmed.startsWith(scramOriginPrefix)) {
      return value;
    }

    const baseUrl = getDecodedBaseUrl();
    let resolvedUrl;

    try {
      const candidateUrl = new URL(trimmed, baseUrl);
      if (candidateUrl.origin === location.origin && !candidateUrl.pathname.startsWith(scramPrefix)) {
        resolvedUrl = new URL(candidateUrl.pathname + candidateUrl.search + candidateUrl.hash, baseUrl);
      } else {
        resolvedUrl = candidateUrl;
      }
    } catch {
      return value;
    }

    return self.__scramjet$bundle.rewriters.url.encodeUrl(resolvedUrl.href, baseUrl);
  }

  function patchLocationMethod(name) {
    const original = Location.prototype[name];
    if (typeof original !== "function") {
      return;
    }

    Location.prototype[name] = function (value) {
      return original.call(this, encodeNavigationTarget(value));
    };
  }

  patchLocationMethod("assign");
  patchLocationMethod("replace");

  function patchLocationProperty(property, transform) {
    const descriptor =
      Object.getOwnPropertyDescriptor(Location.prototype, property) ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), property);

    if (!descriptor?.get) {
      return;
    }

    try {
      Object.defineProperty(Location.prototype, property, {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
          try {
            return transform(getDecodedBaseUrl());
          } catch {
            return descriptor.get.call(this);
          }
        },
        set: descriptor.set
          ? function (value) {
              return descriptor.set.call(this, encodeNavigationTarget(String(value)));
            }
          : undefined,
      });
    } catch {
    }
  }

  [
    ["origin", (url) => url.origin],
    ["protocol", (url) => url.protocol],
    ["host", (url) => url.host],
    ["hostname", (url) => url.hostname],
    ["port", (url) => url.port],
    ["pathname", (url) => url.pathname],
    ["search", (url) => url.search],
    ["hash", (url) => url.hash],
  ].forEach(([property, transform]) => patchLocationProperty(property, transform));

  function patchWindowLocation(targetWindow) {
    if (!targetWindow || targetWindow.__scramjetLocationPatched) {
      return;
    }

    const targetPrototype = Object.getPrototypeOf(targetWindow);
    const descriptor =
      Object.getOwnPropertyDescriptor(targetWindow, "location") ||
      Object.getOwnPropertyDescriptor(targetPrototype, "location");

    if (!descriptor?.get || !descriptor?.set) {
      return;
    }

    try {
      Object.defineProperty(targetWindow, "location", {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
          try {
            return targetWindow.__location || descriptor.get.call(targetWindow);
          } catch {
            return descriptor.get.call(targetWindow);
          }
        },
        set(value) {
          return descriptor.set.call(targetWindow, encodeNavigationTarget(String(value)));
        },
      });

      targetWindow.__scramjetLocationPatched = true;
    } catch {
    }
  }

  function patchDocumentLocation(targetDocument, targetWindow = window) {
    if (!targetDocument || targetDocument.__scramjetDocumentLocationPatched) {
      return;
    }

    const targetPrototype = Object.getPrototypeOf(targetDocument);
    const descriptor =
      Object.getOwnPropertyDescriptor(targetDocument, "location") ||
      Object.getOwnPropertyDescriptor(targetPrototype, "location");

    if (!descriptor?.get) {
      return;
    }

    try {
      Object.defineProperty(targetDocument, "location", {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
          return targetWindow.__location || descriptor.get.call(targetDocument);
        },
        set(value) {
          if (descriptor.set) {
            return descriptor.set.call(targetDocument, encodeNavigationTarget(String(value)));
          }

          return targetWindow.location.assign(encodeNavigationTarget(String(value)));
        },
      });

      targetDocument.__scramjetDocumentLocationPatched = true;
    } catch {
    }
  }

  function patchDocumentUrlProperty(property, valueGetter) {
    const descriptor =
      Object.getOwnPropertyDescriptor(Document.prototype, property) ||
      Object.getOwnPropertyDescriptor(document, property);

    if (!descriptor?.get) {
      return;
    }

    try {
      Object.defineProperty(document, property, {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
          try {
            return valueGetter(window.__location || window.location);
          } catch {
            return descriptor.get.call(document);
          }
        },
      });
    } catch {
    }
  }

  const hrefDescriptor =
    Object.getOwnPropertyDescriptor(Location.prototype, "href") ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), "href");

  if (hrefDescriptor?.get && hrefDescriptor?.set) {
    Object.defineProperty(Location.prototype, "href", {
      configurable: true,
      enumerable: hrefDescriptor.enumerable ?? true,
      get() {
        try {
          return getDecodedBaseUrl().href;
        } catch {
          return hrefDescriptor.get.call(this);
        }
      },
      set(value) {
        return hrefDescriptor.set.call(this, encodeNavigationTarget(value));
      },
    });
  }

  const originalToString = Location.prototype.toString;
  if (typeof originalToString === "function") {
    Location.prototype.toString = function () {
      try {
        return getDecodedBaseUrl().href;
      } catch {
        return originalToString.call(this);
      }
    };
  }

  patchWindowLocation(window);
  patchDocumentLocation(document, window);
  patchDocumentUrlProperty("URL", (loc) => loc.href);
  patchDocumentUrlProperty("documentURI", (loc) => loc.href);
  patchDocumentUrlProperty("baseURI", (loc) => loc.href);

  try {
    if (parent && parent !== window) {
      patchWindowLocation(parent);
    }
  } catch {
  }

  try {
    if (top && top !== window && top !== parent) {
      patchWindowLocation(top);
    }
  } catch {
  }

  const originalOpen = window.open;
  if (typeof originalOpen === "function") {
    window.open = function (url, ...rest) {
      return originalOpen.call(this, encodeNavigationTarget(url), ...rest);
    };
  }

  const originalPushState = history.pushState.bind(history);
  history.pushState = function (state, unused, url) {
    return originalPushState(state, unused, url ? encodeNavigationTarget(String(url)) : url);
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (state, unused, url) {
    return originalReplaceState(state, unused, url ? encodeNavigationTarget(String(url)) : url);
  };
})();
