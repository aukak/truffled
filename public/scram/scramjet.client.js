(function () {
  const originalFetch = window.fetch.bind(window);
  const originalWindowLocation = window.location;
  const ignoredUrlPattern = /^(#|about:|blob:|data:|javascript:|mailto:|tel:)/i;
  const storageKey = "__scramjet_last_url";
  const scramPrefix = self.__scramjet$config.prefix;
  const scramOriginPrefix = location.origin + scramPrefix;

  function rememberDecodedUrl(url) {
    try {
      sessionStorage.setItem(storageKey, url);
    } catch {
    }
  }

  function getFallbackDecodedUrl() {
    try {
      const storedUrl = sessionStorage.getItem(storageKey);
      if (storedUrl) {
        return new URL(storedUrl);
      }
    } catch {
    }

    try {
      return new URL(document.baseURI || location.origin + "/");
    } catch {
      return new URL(location.origin + "/");
    }
  }

  function getDecodedBaseUrl() {
    try {
      const href = String(originalWindowLocation.href || "");
      if (href.startsWith(scramOriginPrefix)) {
        const decodedUrl = new URL(self.__scramjet$bundle.rewriters.url.decodeUrl(href));
        rememberDecodedUrl(decodedUrl.href);
        return decodedUrl;
      }
    } catch {
    }

    return getFallbackDecodedUrl();
  }

  function normalizeInputUrl(value) {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed || ignoredUrlPattern.test(trimmed)) {
      return value;
    }

    if (trimmed.startsWith(scramOriginPrefix) || trimmed.startsWith(scramPrefix)) {
      return value;
    }

    return trimmed;
  }

  function encodeWithBase(value, explicitBase) {
    const normalizedValue = normalizeInputUrl(value);
    if (typeof normalizedValue !== "string") {
      return normalizedValue;
    }

    if (normalizedValue !== value && ignoredUrlPattern.test(normalizedValue)) {
      return normalizedValue;
    }

    const baseUrl = explicitBase || getDecodedBaseUrl();

    try {
      const resolvedUrl = new URL(normalizedValue, baseUrl);
      rememberDecodedUrl(resolvedUrl.href);
      return self.__scramjet$bundle.rewriters.url.encodeUrl(resolvedUrl.href, baseUrl);
    } catch {
      try {
        return self.__scramjet$bundle.rewriters.url.encodeUrl(normalizedValue, baseUrl);
      } catch {
        return value;
      }
    }
  }

  function createDecodedLocation() {
    const decodedUrl = getDecodedBaseUrl();
    decodedUrl.assign = (value) => location.assign(encodeWithBase(value, decodedUrl));
    decodedUrl.reload = () => location.reload();
    decodedUrl.replace = (value) => location.replace(encodeWithBase(value, decodedUrl));
    decodedUrl.toString = () => decodedUrl.href;
    return decodedUrl;
  }

  function createLocationProxy() {
    let decodedUrl = createDecodedLocation();

    return new Proxy(originalWindowLocation, {
      get(_, property) {
        decodedUrl = createDecodedLocation();
        return decodedUrl[property];
      },
      set(_, property, value) {
        if (property === "href") {
          location.href = encodeWithBase(String(value), decodedUrl);
          return true;
        }

        decodedUrl[property] = value;
        return true;
      },
    });
  }

  window.__location = createLocationProxy();

  function exposeDecodedLocationProperty(property, transform) {
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
              return descriptor.set.call(this, encodeWithBase(String(value)));
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
  ].forEach(([property, transform]) => exposeDecodedLocationProperty(property, transform));

  function exposeDecodedLocation(targetWindow) {
    if (!targetWindow || targetWindow.__scramjetDecodedLocationExposed) {
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
          return targetWindow.__location || descriptor.get.call(targetWindow);
        },
        set(value) {
          return descriptor.set.call(targetWindow, encodeWithBase(String(value)));
        },
      });

      targetWindow.__scramjetDecodedLocationExposed = true;
    } catch {
    }
  }

  function exposeDecodedDocumentLocation(targetDocument, targetWindow = window) {
    if (!targetDocument || targetDocument.__scramjetDecodedDocumentLocationExposed) {
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
            return descriptor.set.call(targetDocument, encodeWithBase(String(value)));
          }

          return targetWindow.location.assign(encodeWithBase(String(value)));
        },
      });

      targetDocument.__scramjetDecodedDocumentLocationExposed = true;
    } catch {
    }
  }

  function exposeDecodedDocumentUrlProperty(property) {
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
            return window.__location?.href || descriptor.get.call(document);
          } catch {
            return descriptor.get.call(document);
          }
        },
      });
    } catch {
    }
  }

  exposeDecodedLocation(window);
  exposeDecodedDocumentLocation(document, window);
  exposeDecodedDocumentUrlProperty("URL");
  exposeDecodedDocumentUrlProperty("documentURI");
  exposeDecodedDocumentUrlProperty("baseURI");

  if (window.trustedTypes?.createPolicy) {
    trustedTypes.createPolicy = new Proxy(trustedTypes.createPolicy, {
      apply(target, thisArg, args) {
        const [, policy] = args;

        if (policy?.createHTML) {
          policy.createHTML = new Proxy(policy.createHTML, {
            apply(innerTarget, innerThis, innerArgs) {
              return self.__scramjet$bundle.rewriters.rewriteHtml(
                Reflect.apply(innerTarget, innerThis, innerArgs)
              );
            },
          });
        }

        if (policy?.createScript) {
          policy.createScript = new Proxy(policy.createScript, {
            apply(innerTarget, innerThis, innerArgs) {
              return self.__scramjet$bundle.rewriters.rewriteJs(
                Reflect.apply(innerTarget, innerThis, innerArgs)
              );
            },
          });
        }

        if (policy?.createScriptURL) {
          policy.createScriptURL = new Proxy(policy.createScriptURL, {
            apply(innerTarget, innerThis, innerArgs) {
              return encodeWithBase(Reflect.apply(innerTarget, innerThis, innerArgs));
            },
          });
        }

        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  const wrappedFunction = new Proxy(Function, {
    construct(target, args) {
      if (args.length === 1) {
        return Reflect.construct(target, [self.__scramjet$bundle.rewriters.rewriteJs(args[0])]);
      }

      const rewrittenArgs = [...args];
      rewrittenArgs[rewrittenArgs.length - 1] = self.__scramjet$bundle.rewriters.rewriteJs(
        rewrittenArgs[rewrittenArgs.length - 1]
      );

      return Reflect.construct(target, rewrittenArgs);
    },
    apply(target, thisArg, args) {
      if (args.length === 1) {
        return Reflect.apply(target, undefined, [self.__scramjet$bundle.rewriters.rewriteJs(args[0])]);
      }

      const rewrittenArgs = [...args];
      rewrittenArgs[rewrittenArgs.length - 1] = self.__scramjet$bundle.rewriters.rewriteJs(
        rewrittenArgs[rewrittenArgs.length - 1]
      );

      return Reflect.apply(target, undefined, rewrittenArgs);
    },
  });

  delete window.Function;
  window.Function = wrappedFunction;
  delete window.eval;
  window.eval = (source) => window.Function(source);

  function scopedStorageKeys(storage) {
    return Object.keys(storage).filter((key) => key.startsWith(window.__location.host));
  }

  function createScopedStorage(storage) {
    return new Proxy(storage, {
      get(target, property) {
        switch (property) {
          case "getItem":
            return (key) => target.getItem(window.__location.host + "@" + key);
          case "setItem":
            return (key, value) => {
              target.setItem(window.__location.host + "@" + key, value);
            };
          case "removeItem":
            return (key) => {
              target.removeItem(window.__location.host + "@" + key);
            };
          case "clear":
            return () => {
              scopedStorageKeys(target).forEach((key) => target.removeItem(key));
            };
          case "key":
            return (index) => target[scopedStorageKeys(target)[index]];
          case "length":
            return scopedStorageKeys(target).length;
          default:
            return target[property];
        }
      },
      defineProperty(target, property, descriptor) {
        target.setItem(property, descriptor.value);
        return true;
      },
    });
  }

  const scopedLocalStorage = createScopedStorage(window.localStorage);
  const scopedSessionStorage = createScopedStorage(window.sessionStorage);
  delete window.localStorage;
  delete window.sessionStorage;
  window.localStorage = scopedLocalStorage;
  window.sessionStorage = scopedSessionStorage;

  const attributeTargets = {
    nonce: [HTMLElement],
    integrity: [HTMLScriptElement, HTMLLinkElement],
    csp: [HTMLIFrameElement],
    src: [HTMLImageElement, HTMLMediaElement, HTMLIFrameElement, HTMLEmbedElement, HTMLScriptElement],
    href: [HTMLAnchorElement, HTMLLinkElement],
    data: [HTMLObjectElement],
    action: [HTMLFormElement],
    formaction: [HTMLButtonElement, HTMLInputElement],
    srcdoc: [HTMLIFrameElement],
    srcset: [HTMLImageElement, HTMLSourceElement],
    imagesrcset: [HTMLLinkElement],
    style: [HTMLElement],
  };

  Object.keys(attributeTargets).forEach((attribute) => {
    attributeTargets[attribute].forEach((ElementType) => {
      const descriptor = Object.getOwnPropertyDescriptor(ElementType.prototype, attribute);
      if (!descriptor?.get || !descriptor?.set) {
        return;
      }

      Object.defineProperty(ElementType.prototype, attribute, {
        get() {
          return descriptor.get.call(this, [this.dataset["_" + attribute]]);
        },
        set(value) {
          this.dataset["_" + attribute] = value;

          if (/nonce|integrity|csp/.test(attribute)) {
            this.removeAttribute(attribute);
            return;
          }

          if (/src|href|data|action|formaction/.test(attribute)) {
            if (typeof TrustedScriptURL !== "undefined" && value instanceof TrustedScriptURL) {
              return;
            }
            value = encodeWithBase(value);
          } else if (attribute === "srcdoc") {
            value = self.__scramjet$bundle.rewriters.rewriteHtml(value);
          } else if (/(image)?srcset/.test(attribute)) {
            value = self.__scramjet$bundle.rewriters.rewriteSrcset(value);
          } else if (attribute === "style") {
            value = self.__scramjet$bundle.rewriters.rewriteCss(value);
          }

          descriptor.set.call(this, value);
        },
      });
    });
  });

  HTMLElement.prototype.getAttribute = new Proxy(Element.prototype.getAttribute, {
    apply(target, thisArg, args) {
      if (Object.prototype.hasOwnProperty.call(attributeTargets, args[0])) {
        args[0] = "_" + args[0];
      }

      return Reflect.apply(target, thisArg, args);
    },
  });

  HTMLElement.prototype.setAttribute = new Proxy(Element.prototype.setAttribute, {
    apply(target, thisArg, args) {
      if (Object.prototype.hasOwnProperty.call(attributeTargets, args[0])) {
        thisArg.dataset["_" + args[0]] = args[1];

        if (/nonce|integrity|csp/.test(args[0])) {
          return;
        }

        if (/src|href|data|action|formaction/.test(args[0])) {
          args[1] = encodeWithBase(args[1]);
        } else if (args[0] === "srcdoc") {
          args[1] = self.__scramjet$bundle.rewriters.rewriteHtml(args[1]);
        } else if (/(image)?srcset/.test(args[0])) {
          args[1] = self.__scramjet$bundle.rewriters.rewriteSrcset(args[1]);
        } else if (args[0] === "style") {
          args[1] = self.__scramjet$bundle.rewriters.rewriteCss(args[1]);
        }
      }

      return Reflect.apply(target, thisArg, args);
    },
  });

  const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (innerHtmlDescriptor?.set) {
    Object.defineProperty(HTMLElement.prototype, "innerHTML", {
      set(value) {
        if (this instanceof HTMLScriptElement) {
          if (!(typeof TrustedScript !== "undefined" && value instanceof TrustedScript)) {
            value = self.__scramjet$bundle.rewriters.rewriteJs(value);
          }
        } else if (this instanceof HTMLStyleElement) {
          value = self.__scramjet$bundle.rewriters.rewriteCss(value);
        } else if (!(typeof TrustedHTML !== "undefined" && value instanceof TrustedHTML)) {
          value = self.__scramjet$bundle.rewriters.rewriteHtml(value);
        }

        innerHtmlDescriptor.set.call(this, value);
      },
    });
  }

  window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, args) {
      if (typeof args[0] === "string") {
        args[0] = encodeWithBase(args[0]);
      }

      return Reflect.apply(target, thisArg, args);
    },
  });

  Headers = new Proxy(Headers, {
    construct(target, args, newTarget) {
      args[0] = self.__scramjet$bundle.rewriters.rewriteHeaders(args[0]);
      return Reflect.construct(target, args, newTarget);
    },
  });

  Request = new Proxy(Request, {
    construct(target, args, newTarget) {
      if (typeof args[0] === "string") {
        args[0] = encodeWithBase(args[0]);
      }

      return Reflect.construct(target, args, newTarget);
    },
  });

  Response.redirect = new Proxy(Response.redirect, {
    apply(target, thisArg, args) {
      args[0] = encodeWithBase(args[0]);
      return Reflect.apply(target, thisArg, args);
    },
  });

  XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
    apply(target, thisArg, args) {
      if (args[1]) {
        args[1] = encodeWithBase(args[1]);
      }

      return Reflect.apply(target, thisArg, args);
    },
  });

  XMLHttpRequest.prototype.setRequestHeader = new Proxy(XMLHttpRequest.prototype.setRequestHeader, {
    apply(target, thisArg, args) {
      let headers = Object.fromEntries([args]);
      headers = self.__scramjet$bundle.rewriters.rewriteHeaders(headers);
      args = Object.entries(headers)[0];
      return Reflect.apply(target, thisArg, args);
    },
  });

  const cssUrlProperties = [
    "background",
    "background-image",
    "mask",
    "mask-image",
    "list-style",
    "list-style-image",
    "border-image",
    "border-image-source",
    "cursor",
  ];

  const cssPropertyNames = [
    "background",
    "backgroundImage",
    "mask",
    "maskImage",
    "listStyle",
    "listStyleImage",
    "borderImage",
    "borderImageSource",
    "cursor",
  ];

  CSSStyleDeclaration.prototype.setProperty = new Proxy(CSSStyleDeclaration.prototype.setProperty, {
    apply(target, thisArg, args) {
      if (cssUrlProperties.includes(args[0])) {
        args[1] = self.__scramjet$bundle.rewriters.rewriteCss(args[1]);
      }

      return Reflect.apply(target, thisArg, args);
    },
  });

  cssPropertyNames.forEach((property) => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, property);
    if (!descriptor?.set) {
      return;
    }

    Object.defineProperty(CSSStyleDeclaration.prototype, property, {
      set(value) {
        descriptor.set.call(this, self.__scramjet$bundle.rewriters.rewriteCss(value));
      },
    });
  });
})();
