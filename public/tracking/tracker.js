/**
 * Metric Streamer — Tracker v1.0
 * 
 * Script standalone para landing pages.
 * Cole no <head> da LP:
 * 
 *   <script src="https://SEU_DOMINIO/tracking/tracker.js"
 *           data-endpoint="https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event"
 *   ></script>
 *
 * Ou configure manualmente:
 *   window.__MS_TRACKING = { endpoint: "https://..." };
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

    // Always refresh cookie TTL
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
    // Generate fbp if not present
    var fbp = "fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e10);
    setCookie("_fbp", fbp, 365);
    return fbp;
  }

  // ── Funnel / Stage IDs (optional) ───────────────────────
  var FUNNEL_ID = (scriptTag && scriptTag.getAttribute("data-funnel-id")) || undefined;
  var STAGE_ID = (scriptTag && scriptTag.getAttribute("data-stage-id")) || undefined;

  // ── Build payload ──────────────────────────────────────
  function buildPayload(eventName) {
    return {
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
  }

  // ── Send event ─────────────────────────────────────────
  function sendEvent(eventName) {
    var payload = buildPayload(eventName);
    var json = JSON.stringify(payload);

    // Prefer sendBeacon (non-blocking, survives page unload)
    if (navigator.sendBeacon) {
      var blob = new Blob([json], { type: "application/json" });
      var sent = navigator.sendBeacon(ENDPOINT, blob);
      if (sent) return;
    }

    // Fallback: fetch with keepalive
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // ── Auto-track pageview ────────────────────────────────
  sendEvent("pageview");

  // ── Public API ─────────────────────────────────────────
  window.__MS_TRACKING = window.__MS_TRACKING || {};
  window.__MS_TRACKING.track = sendEvent;
  window.__MS_TRACKING.getVisitorId = getOrCreateVisitorId;
})();
