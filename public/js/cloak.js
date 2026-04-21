(function () {
  const STORAGE_KEY = "selectedCloak";
  let cloakData = [];

  function applyCloak(cloak) {
    if (!cloak) return removeCloak();
    document.title = cloak.title;
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = cloak.icon;
  }

  function removeCloak() {
    document.title = document.querySelector("title")?.dataset.original || "Truffled";
    let link = document.querySelector("link[rel*='icon']");
    if (link) link.href = "png/logo.png";
    localStorage.removeItem(STORAGE_KEY);
  }

  function saveCloak(cloak) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloak));
    applyCloak(cloak);
  }

  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function buildUI(container) {
    const select = container.querySelector("#cloakSelect");
    if (!select) return;

    cloakData.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
    const saved = loadSaved();
    if (saved) {
      const idx = cloakData.findIndex(c => c.name === saved.name);
      if (idx !== -1) select.value = idx;
    }
    select.addEventListener("change", () => {
      const i = select.value;
      if (i === "") return removeCloak();
      saveCloak(cloakData[i]);
    });
    const resetBtn = container.querySelector("#cloakReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        select.value = "";
        removeCloak();
      });
    }
  }
  const originalTitle = document.title;
  fetch("/js/json/cloak.json")
    .then(r => r.json())
    .then(data => {
      cloakData = data;
      const saved = loadSaved();
      if (saved) applyCloak(saved);
      const container = document.getElementById("cloaksettings");
      if (container) buildUI(container);
    })
    .catch(() => {
      const saved = loadSaved();
      if (saved) applyCloak(saved);
    });
  if (!document.querySelector("title")?.dataset.original) {
    const t = document.querySelector("title");
    if (t) t.dataset.original = originalTitle;
  }
})();