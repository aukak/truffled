(function () {
  const partnerScript = document.createElement("script");
  partnerScript.async = true;
  document.head.appendChild(partnerScript);
  window.removeAds = function () {
    document.querySelectorAll('iframe[src*="effectivegatecpm"], iframe[src*="richinfo"], iframe[src*="syndication"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('div[id^="pl"], div[class*="adsbygoogle"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('script[src*="effectivegatecpm"], script[src*="richinfo"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('ins, .adsbygoogle').forEach(function (el) { el.remove(); });
  };
  var adsEnabled = localStorage.getItem("adsEnabled");
  var isAdsOn = adsEnabled === null ? true : adsEnabled === "true";
  if (isAdsOn) {
    var adScript = document.createElement("script");
    adScript.type = "text/javascript";
    adScript.src = "https://pl27846331.effectivegatecpm.com/3f/32/36/3f3236be1ec5673d9ed3582262c4dab9.js";
    adScript.async = true;
    var appendAdScript = function () { document.body.appendChild(adScript); };
    if (document.body) appendAdScript();
    else document.addEventListener("DOMContentLoaded", appendAdScript);
  }
})();