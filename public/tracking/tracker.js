/**
 * Metric Streamer — Tracker v1.3
 * 
 * Cross-domain identity stitching via ?ms_vid= parameter.
 * Auto-decorates outbound links with visitor_id.
 */
(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────
  var scriptTag = document.currentScript;
  var config = window.__MS_TRACKING || {};
  var ENDPOINT =
    config.endpoint ||
    (scriptTag && scriptTag.getAttribute("data-endpoint")) ||
    "";

  if (!ENDPOINT) {
    console.warn("[MS Tracker] Endpoint não configurado. Use data-endpoint ou window.__MS_TRACKING.endpoint");
    return;
  }

  var ANON_KEY =
    config.anonKey ||
    (scriptTag && scriptTag.getAttribute("data-anon-key")) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M";

  var DEBUG = config.debug || false;

  function log() {
    if (DEBUG) console.log.apply(console, ["[MS Tracker]"].concat(Array.prototype.slice.call(arguments)));
  }

  // ── UUID v4 ─────────────────────────────────────────────
  function isValidUUID(str) {
    return typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  function uuidv4() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── Cookie helpers ──────────────────────────────────────
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      ";expires=" + d.toUTCString() +
      ";path=/;SameSite=Lax";
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // ── URL params ──────────────────────────────────────────
  function getParam(name) {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get(name) || undefined;
    } catch (e) {
      return undefined;
    }
  }

  // ── Visitor ID (cross-domain → cookie → localStorage → new) ──
  function getOrCreateVisitorId() {
    var COOKIE_NAME = "_ms_vid";
    var LS_KEY = "_ms_vid";

    // 1) Check URL param (cross-domain stitching)
    var urlVid = getParam("ms_vid");
    if (urlVid && isValidUUID(urlVid)) {
      log("Using ms_vid from URL:", urlVid);
      setCookie(COOKIE_NAME, urlVid, 365);
      try { localStorage.setItem(LS_KEY, urlVid); } catch (e) {}
      return urlVid;
    }

    // 2) Cookie
    var vid = getCookie(COOKIE_NAME);

    // 3) localStorage fallback
    if (!vid) {
      try { vid = localStorage.getItem(LS_KEY); } catch (e) {}
    }

    // 4) Generate new
    if (!vid) {
      vid = uuidv4();
    }

    setCookie(COOKIE_NAME, vid, 365);
    try { localStorage.setItem(LS_KEY, vid); } catch (e) {}

    return vid;
  }

  // ── Persist fbclid → fbc cookie (Meta standard) ────────
  function getFbc() {
    var fbclid = getParam("fbclid");
    if (fbclid) {
      var fbc = "fb.1." + Date.now() + "." + fbclid;
      setCookie("_fbc", fbc, 90);
      return fbc;
    }
    return getCookie("_fbc") || undefined;
  }

  function getFbp() {
    var existing = getCookie("_fbp");
    if (existing) return existing;
    var fbp = "fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e10);
    setCookie("_fbp", fbp, 365);
    return fbp;
  }

  // ── Funnel / Stage IDs (optional) ───────────────────────
  var FUNNEL_ID = (scriptTag && scriptTag.getAttribute("data-funnel-id")) || undefined;
  var STAGE_ID = (scriptTag && scriptTag.getAttribute("data-stage-id")) || undefined;

  // ── Build payload ──────────────────────────────────────
  function buildPayload(eventName, extra) {
    var base = {
      visitor_id: getOrCreateVisitorId(),
      event: eventName,
      funnel_id: FUNNEL_ID,
      stage_id: STAGE_ID,
      page_url: window.location.href,
      page_title: document.title,
      referrer: document.referrer || undefined,
      utm_source: getParam("utm_source"),
      utm_medium: getParam("utm_medium"),
      utm_campaign: getParam("utm_campaign"),
      utm_content: getParam("utm_content"),
      utm_term: getParam("utm_term"),
      fbclid: getParam("fbclid"),
      fbc: getFbc(),
      fbp: getFbp(),
      gclid: getParam("gclid"),
      screen_resolution: screen.width + "x" + screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) base[k] = extra[k];
      }
    }
    return base;
  }

  // ── Send event ─────────────────────────────────────────
  function sendEvent(eventName, extra) {
    var payload = buildPayload(eventName, extra);
    var json = JSON.stringify(payload);

    log("Sending", eventName, payload);

    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
        },
        body: json,
        keepalive: true,
      })
        .then(function (res) {
          if (!res.ok) {
            log("fetch failed with status", res.status);
          } else {
            log("Event sent OK:", eventName);
          }
        })
        .catch(function (err) {
          log("fetch error, trying sendBeacon fallback:", err);
          if (navigator.sendBeacon) {
            var blob = new Blob([json], { type: "application/json" });
            navigator.sendBeacon(ENDPOINT, blob);
          }
        });
    } catch (e) {
      log("fetch threw, trying sendBeacon:", e);
      if (navigator.sendBeacon) {
        var blob = new Blob([json], { type: "application/json" });
        navigator.sendBeacon(ENDPOINT, blob);
      }
    }
  }

  // ── Email validation ───────────────────────────────────
  function isValidEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  // ── Email capture (auto-detect email inputs) ───────────
  var capturedEmails = {};

  function attachEmailListeners() {
    var inputs = document.querySelectorAll(
      'input[type="email"], input[name*="email"], input[name*="Email"], input[placeholder*="email"], input[placeholder*="Email"]'
    );
    for (var i = 0; i < inputs.length; i++) {
      (function (input) {
        if (input.__ms_email_bound) return;
        input.__ms_email_bound = true;
        input.addEventListener("blur", function () {
          var val = (input.value || "").trim().toLowerCase();
          if (val && isValidEmail(val) && !capturedEmails[val]) {
            capturedEmails[val] = true;
            sendEvent("email_capture", { email: val });
          }
        });
      })(inputs[i]);
    }
  }

  // ── Cross-domain link decoration ───────────────────────
  var currentVisitorId = getOrCreateVisitorId();

  function decorateOutboundLinks() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.__ms_decorated) continue;
      try {
        var url = new URL(link.href);
        // Only decorate http(s) links to different domains
        if (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.hostname !== window.location.hostname &&
          !url.searchParams.has("ms_vid")
        ) {
          url.searchParams.set("ms_vid", currentVisitorId);
          link.href = url.toString();
          link.__ms_decorated = true;
          log("Decorated link:", link.href);
        }
      } catch (e) {
        // skip invalid URLs
      }
    }
  }

  // ── Auto-track pageview ────────────────────────────────
  sendEvent("pageview");

  // ── Attach listeners after DOM ready ───────────────────
  function onReady() {
    attachEmailListeners();
    decorateOutboundLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  // ── Observe for dynamically added elements ─────────────
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function () {
      attachEmailListeners();
      decorateOutboundLinks();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── Public API ─────────────────────────────────────────
  window.__MS_TRACKING = window.__MS_TRACKING || {};
  window.__MS_TRACKING.track = sendEvent;
  window.__MS_TRACKING.getVisitorId = getOrCreateVisitorId;
})();
