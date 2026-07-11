/*
 * Computes today's civil/nautical/astronomical dawn & dusk for a single
 * fixed location, for the twilight-times/*.html landing pages.
 *
 * This is a direct port of computeDay()/solarParams()/eventUTC()/fmtLocal()/
 * tzOffset() from index.html's Ephemeris tab (same NOAA solar-position
 * algorithm) — kept in lockstep with that implementation so these pages
 * always agree with the app's own numbers for the same coordinates and date.
 * If those functions change in index.html, mirror the change here too.
 */
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var rad = function (d) { return d * RAD; };
  var deg = function (r) { return r / RAD; };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };

  function solarParams(y, m, d) {
    var JD = Date.UTC(y, m - 1, d, 12, 0, 0) / 86400000 + 2440587.5;
    var T = (JD - 2451545.0) / 36525;
    var L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
    var trueLong = L0 + C;
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * T));
    var obliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var obliqCorr = obliq + 0.00256 * Math.cos(rad(125.04 - 1934.136 * T));
    var decl = deg(Math.asin(Math.sin(rad(obliqCorr)) * Math.sin(rad(appLong))));
    var vY = Math.pow(Math.tan(rad(obliqCorr / 2)), 2);
    var eqTime = 4 * deg(vY * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * vY * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * vY * vY * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
    return { decl: decl, eqTime: eqTime };
  }

  function eventUTC(lat, lon, p, altDeg, rise) {
    var zen = 90 - altDeg;
    var cosH = (Math.cos(rad(zen)) - Math.sin(rad(lat)) * Math.sin(rad(p.decl))) / (Math.cos(rad(lat)) * Math.cos(rad(p.decl)));
    if (cosH > 1) return { none: 'below' };
    if (cosH < -1) return { none: 'above' };
    var HA = deg(Math.acos(cosH));
    var utc = rise ? 720 - 4 * (lon + HA) - p.eqTime : 720 - 4 * (lon - HA) - p.eqTime;
    return { utc: utc };
  }

  var ALT = { sun: -0.833, civil: -6, nautical: -12, astro: -18 };
  function computeDay(lat, lon, y, m, d) {
    var p = solarParams(y, m, d);
    var ev = function (a, rise) { return eventUTC(lat, lon, p, a, rise); };
    return {
      astroDawn: ev(ALT.astro, true),
      nautDawn: ev(ALT.nautical, true),
      civilDawn: ev(ALT.civil, true),
      sunrise: ev(ALT.sun, true),
      sunset: ev(ALT.sun, false),
      civilDusk: ev(ALT.civil, false),
      nautDusk: ev(ALT.nautical, false),
      astroDusk: ev(ALT.astro, false)
    };
  }

  function tzOffset(date, tz) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
    return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - date.getTime()) / 60000);
  }

  function localDateParts(tz, baseMs) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(baseMs)).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
    return { y: +parts.year, m: +parts.month, d: +parts.day };
  }

  function fmtLocal(utcMin, offMin, h24) {
    var t = utcMin + offMin;
    var dayShift = Math.floor(t / 1440);
    t = (t % 1440 + 1440) % 1440;
    var h = Math.floor(t / 60);
    var mn = Math.round(t - h * 60);
    if (mn === 60) { mn = 0; h = (h + 1) % 24; }
    var tag = dayShift < 0 ? ' −1d' : dayShift > 0 ? ' +1d' : '';
    if (h24) return pad2(h) + ':' + pad2(mn) + tag;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(mn) + ' ' + ap + tag;
  }

  function render() {
    var host = document.getElementById('tw-times');
    if (!host) return;
    var lat = parseFloat(host.getAttribute('data-lat'));
    var lon = parseFloat(host.getAttribute('data-lon'));
    var tz = host.getAttribute('data-tz');
    var h24 = host.getAttribute('data-h24') === '1';
    if (isNaN(lat) || isNaN(lon) || !tz) return;

    var now = Date.now();
    var ld = localDateParts(tz, now);
    var day = computeDay(lat, lon, ld.y, ld.m, ld.d);
    var offMin = tzOffset(new Date(now), tz);

    var fields = { astroDawn: 1, nautDawn: 1, civilDawn: 1, sunrise: 1, sunset: 1, civilDusk: 1, nautDusk: 1, astroDusk: 1 };
    Object.keys(fields).forEach(function (key) {
      var el = document.querySelector('[data-tw-field="' + key + '"]');
      if (!el) return;
      var ev = day[key];
      el.textContent = ev.utc !== undefined
        ? fmtLocal(ev.utc, offMin, h24)
        : (ev.none === 'above' ? 'Never (sun stays up)' : 'Never (sun stays down)');
    });

    var dateEl = document.querySelector('[data-tw-field="date"]');
    if (dateEl) {
      dateEl.textContent = new Date(Date.UTC(ld.y, ld.m - 1, ld.d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
