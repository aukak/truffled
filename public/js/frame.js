function isUrl(val = "") {
  return /^https?:\/\//i.test(val) || (val.includes(".") && val.slice(0, 1) !== " ");
}
function decodeURL(url) {
  return __uv$config.decodeUrl(url);
}
const SITE_REDIRECTS = {
  'http://now.gg': 'https://nowgg.lol/hub',
  'http://now.gg/': 'https://nowgg.lol/hub',
  'https://now.gg': 'https://nowgg.lol/hub',
  'https://now.gg/': 'https://nowgg.lol/hub'
};
const PROTOCOL_HANDLERS = {
  'gms://roblox': 'http://api.v6.wiki/',
  'gms://android': 'https://api.v6.wiki/apps/frogiee1/69420/custom-thingy-loader.html'
};
const REVERSE_PROTOCOL_HANDLERS = Object.fromEntries(
  Object.entries(PROTOCOL_HANDLERS).map(([key, value]) => [value, key])
);
const PENDING_PROXY_URL_KEY = "pendingProxyUrl";

function getPendingProxyUrl() {
  return sessionStorage.getItem(PENDING_PROXY_URL_KEY) || "";
}

function getStoredEncodedUrl() {
  const encodedUrl = sessionStorage.getItem("encodedUrl") || "";
  return encodedUrl ? decodeURL(encodedUrl) : "";
}
async function loadNewPage(url) {
  const searchBar = document.getElementById("teacher-setup-dialogs-container-searchbar");
  if (searchBar) searchBar.blur();
  window.navigator.serviceWorker.register("/active/sw.js", {
    scope: "/active/go/",
  });
  if (PROTOCOL_HANDLERS[url]) {
    url = PROTOCOL_HANDLERS[url];
  }
  if (!isUrl(url)) {
    url = "https://duckduckgo.com/?t=h_&ia=web&q=" + encodeURIComponent(url);
  } else if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  if (SITE_REDIRECTS[url]) {
    alert('You are going to a broken site! Redirecting you to ' + SITE_REDIRECTS[url]);
    url = SITE_REDIRECTS[url];
  }
  const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
  if (await connection.getTransport() !== "/scram/libcurl/index.mjs") {
    await connection.setTransport("/scram/libcurl/index.mjs", [{ websocket: wispUrl }]);
  }
  const urlEncoded = "/active/go/" + __uv$config.encodeUrl(url);
  const iframe = document.getElementById("iframeid");
  if (iframe) {
    iframe.src = urlEncoded;
  } else {
    console.error('Iframe with id "iframeid" not found');
  }
  if (searchBar) {
    searchBar.value = REVERSE_PROTOCOL_HANDLERS[url] || url;
  }
}
window.addEventListener("load", function () {
  const encodedUrl = getStoredEncodedUrl();
  const pendingProxyUrl = getPendingProxyUrl();
  if (!encodedUrl && !pendingProxyUrl) {
    return;
  }
  if (encodedUrl) {
    loadNewPage(encodedUrl);
  }
});
window.addEventListener("DOMContentLoaded", function () {
  const searchBar = document.getElementById("teacher-setup-dialogs-container-searchbar");
  
  if (!searchBar) {
    console.error('Search bar not found');
    return;
  }
  const decodedUrl = getStoredEncodedUrl();
  const pendingProxyUrl = getPendingProxyUrl();
  const initialUrl = pendingProxyUrl || decodedUrl;
  searchBar.value = REVERSE_PROTOCOL_HANDLERS[initialUrl] || initialUrl;
  searchBar.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      let url = searchBar.value.trim();
            if (PROTOCOL_HANDLERS[url]) {
        url = PROTOCOL_HANDLERS[url];
      }
      
      loadNewPage(url);
    }
  });
  const iframe = document.getElementById("iframeid");
  if (iframe && (searchBar.value === "gms://roblox" || searchBar.value === "gms://android")) {
    iframe.sandbox = "allow-scripts allow-pointer-lock allow-forms allow-same-origin allow-downloads";
  }
  searchBar.addEventListener("focus", function () {
    searchBar.select();
  });
});
function reload() {
  const iframe = document.getElementById("iframeid");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.location.reload();
  }
}
function back() {
  const iframe = document.getElementById("iframeid");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.history.back();
  }
}
function forward() {
  const iframe = document.getElementById("iframeid");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.history.forward();
  }
}
function home() {
  window.location.href = "/";
}
document.onfullscreenchange = function () {
  const iframe = document.getElementById("iframeid");
  
  document.body.classList.toggle("fullscreen-active", !!document.fullscreenElement);
  
  if (iframe) {
    iframe.style.height = document.fullscreenElement ? "100vh" : "calc(100vh - 47.5px)";
  }
};
function fullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}
function erudaToggle() {
  const iframe = document.getElementById("iframeid");
  if (!iframe) return;

  const erudaWindow = iframe.contentWindow;
  const erudaDocument = iframe.contentDocument;
  
  if (!erudaWindow || !erudaDocument) return;

  if (erudaWindow.eruda?._isInit) {
    erudaWindow.eruda.destroy();
  } else {
    const script = erudaDocument.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.onload = function () {
      if (erudaWindow && erudaWindow.eruda) {
        erudaWindow.eruda.init();
        erudaWindow.eruda.show();
      }
    };
    erudaDocument.head.appendChild(script);
  }
}
function hideBar() {
  const classesToHide = [
    "bar", "bar-left", "bar-right", 
    "icon", "search", "search-icon", "navbtn"
  ];
  
  classesToHide.forEach((className) => {
    const elements = document.getElementsByClassName(className);
    Array.from(elements).forEach(el => el.style.display = "none");
  });
  const iframe = document.getElementById("iframeid");
  if (iframe) {
    iframe.style.height = "100vh";
    iframe.style.margin = "0";
    iframe.style.padding = "0";
  }
}
function cloak() {
  let inFrame;

  try {
    inFrame = window !== top;
  } catch (e) {
    inFrame = true;
  }
  if (inFrame || navigator.userAgent.includes("Firefox")) {
    return; 
  }
  const popup = open("about:blank", "_blank");
  
  if (!popup || popup.closed) {
    alert("Please allow popups and redirects.");
    return;
  }
  const doc = popup.document;
  const iframe = doc.createElement("iframe");
  const link = doc.createElement("link");
    const tabData = JSON.parse(localStorage.getItem("tab") || "{}");
  const name = tabData.title || "Dashboard";
  const icon = tabData.icon || "/img/favicon.ico";
  doc.title = name;
  link.rel = "icon";
  link.href = icon;
  doc.head.appendChild(link);
  iframe.src = location.href;
  Object.assign(iframe.style, {
    position: "fixed",
    top: "0",
    bottom: "0",
    left: "0",
    right: "0",
    border: "none",
    outline: "none",
    width: "100%",
    height: "100%"
  });
  doc.body.appendChild(iframe);
  const script = doc.createElement("script");
  script.textContent = `
    window.onbeforeunload = function (event) {
      const confirmationMessage = 'Leave Site?';
      (event || window.event).returnValue = confirmationMessage;
      return confirmationMessage;
    };
  `;
  doc.head.appendChild(script);
  const pLink = localStorage.getItem("pLink") || "https://www.google.com/";
  location.replace(pLink);
}
