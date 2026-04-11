/**
 * Metric Streamer — Tracker v1.2
 * 
 * Script standalone para landing pages.
 * Cole no <head> da LP:
 * 
 *   <script src="https://SEU_DOMINIO/tracking/tracker.js"
 *           data-endpoint="https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event"
 *           data-funnel-id="OPTIONAL_FUNNEL_UUID"
 *           data-stage-id="OPTIONAL_STAGE_UUID"
 *           defer
 *   ></script>
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

  // Anon key pública — necessária para o gateway do Supabase aceitar a request
  var ANON_KEY =
    config.anonKey ||
    (scriptTag && scriptTag.getAttribute("data-anon-key")) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M";

  var DEBUG = config.debug || false;

  function log() {
    if (DEBUG) console.log.apply(console, ["[MS Tracker]"].concat(Array.prototype.slice.call(arguments)));
  }

  // ── UUID v4 ─────────────────────────────────────────────
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

  // ── Visitor ID (cookie 1yr + localStorage backup) ──────
  function getOrCreateVisitorId() {
    var COOKIE_NAME = "_ms_vid";
    var LS_KEY = "_ms_vid";
    var vid = getCookie(COOKIE_NAME);

    if (!vid) {
      try { vid = localStorage.getItem(LS_KEY); } catch (e) {}
    }

    if (!vid) {
      vid = uuidv4();
    }

    setCookie(COOKIE_NAME, vid, 365);
    try { localStorage.setItem(LS_KEY, vid); } catch (e) {}

    return vid;
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

    // Primary: fetch with apikey header (required by Supabase gateway)
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
          // Fallback: sendBeacon (no custom headers, but better than nothing)
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

  // ── Auto-track pageview ────────────────────────────────
  sendEvent("pageview");

  // ── Attach email listeners (now + observe DOM changes) ─
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachEmailListeners);
  } else {
    attachEmailListeners();
  }

  // Observe for dynamically added inputs
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function () {
      attachEmailListeners();
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
