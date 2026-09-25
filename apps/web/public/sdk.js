/**
 * Valid.ai tracking SDK — embedded on every published funnel page.
 * Posts events to /api/track, which builds each visitor's timeline
 * (Entrou → respondeu → assistiu vídeo → clicou → checkout) in the
 * Lead record shown in the dashboard's Leads section.
 */
(function (window, document) {
  'use strict';

  function getSessionId() {
    var key = '_vai_sid';
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var id = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, id);
      return id;
    } catch (e) {
      // Storage blocked (private mode, etc.) — fall back to a per-load id.
      return 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }
  }

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(function (k) {
      var v = params.get(k);
      if (v) utm[k] = v;
    });
    return utm;
  }

  function getDevice() {
    return /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  }

  function createTracker(config) {
    config = config || {};
    var projectId = config.projectId;
    var endpoint = config.endpoint || '';
    var sessionId = getSessionId();
    var utmParams = getUtmParams();
    var device = getDevice();
    var scrollMarks = { 25: false, 50: false, 75: false, 100: false };

    if (!projectId) {
      console.warn('[Valid.ai] createTracker called without a projectId — events will not be sent.');
    }

    function send(eventType, extra) {
      if (!projectId) return;
      var body = Object.assign(
        {
          projectId: projectId,
          sessionId: sessionId,
          eventType: eventType,
          device: device,
          utmParams: utmParams,
          timestamp: new Date().toISOString(),
        },
        extra || {}
      );
      var url = endpoint + '/api/track';
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: 'application/json' }));
        } else {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true,
          }).catch(function () {});
        }
      } catch (e) {
        /* never let tracking break the page */
      }
    }

    function onScroll() {
      var doc = document.documentElement;
      var scrolled = ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100;
      [25, 50, 75, 100].forEach(function (mark) {
        if (!scrollMarks[mark] && scrolled >= mark) {
          scrollMarks[mark] = true;
          send('scroll', { step: mark + '%' });
        }
      });
    }
    window.addEventListener('scroll', throttle(onScroll, 500), { passive: true });

    function throttle(fn, wait) {
      var last = 0;
      return function () {
        var now = Date.now();
        if (now - last >= wait) {
          last = now;
          fn();
        }
      };
    }

    // Any element marked data-vai-cta="checkout" (or any label) auto-tracks its clicks.
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-vai-cta]');
      if (el) send('cta_click', { step: el.getAttribute('data-vai-cta') });
    });

    return {
      page: function (name) {
        send('page_view', { step: name });
      },
      event: function (type, metadata) {
        send(type, { metadata: metadata || {} });
      },
      lead: function (data) {
        data = data || {};
        send('lead_capture', {
          leadEmail: data.email,
          metadata: { email: data.email, phone: data.phone, name: data.name },
        });
      },
    };
  }

  window.ValidAI = { createTracker: createTracker };
})(window, document);
