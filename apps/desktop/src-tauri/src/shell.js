// Injected into the WHIP webview before the SPA loads (see lib.rs). Plain ES2020, no imports.
/* global window, __WHIP_RELEASE__ */
(function () {
  'use strict';
  var RELEASE = __WHIP_RELEASE__;

  function invoke(cmd) {
    var internals = window.__TAURI_INTERNALS__;
    if (internals) internals.invoke(cmd).catch(function () {});
  }

  // The window starts hidden. Show it when the SPA has painted its first boot-splash frame
  // (`window.dispatchEvent(new Event('whip:boot-ready'))`), or after 3 s whatever happens
  // (lib.rs has the same fallback in case this page never loads).
  var shown = false;
  function showWindow() {
    if (shown) return;
    shown = true;
    invoke('show_main_window');
  }
  window.addEventListener('whip:boot-ready', showWindow, { once: true });
  setTimeout(showWindow, 3000);

  function editable(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
  }

  window.addEventListener(
    'keydown',
    function (e) {
      // F11 / Alt+Enter: toggle fullscreen (PC game convention).
      if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
        e.preventDefault();
        if (!e.repeat) invoke('toggle_fullscreen');
        return;
      }
      if (!RELEASE) return;
      var ctrl = e.ctrlKey || e.metaKey;
      var k = e.key.toLowerCase();
      // Browser behaviour that has no place in a game window: reload, print, find, view source,
      // devtools, history navigation, page zoom.
      var blocked =
        k === 'f5' ||
        k === 'f12' ||
        k === 'f3' ||
        k === 'f7' ||
        k === 'browserback' ||
        k === 'browserforward' ||
        k === 'browserrefresh' ||
        (e.altKey && (k === 'arrowleft' || k === 'arrowright')) ||
        (ctrl &&
          ['r', 'p', 'f', 'g', 'u', 'j', 's', 'o', 'n', 't', '+', '-', '=', '0'].indexOf(k) >= 0) ||
        (ctrl && e.shiftKey && ['i', 'c', 'j'].indexOf(k) >= 0);
      if (blocked) e.preventDefault();
    },
    true,
  );

  if (RELEASE) {
    // No browser context menu, except in text fields (paste the sign-in code).
    window.addEventListener(
      'contextmenu',
      function (e) {
        if (!editable(e.target)) e.preventDefault();
      },
      true,
    );
    // Ctrl+wheel zoom.
    window.addEventListener(
      'wheel',
      function (e) {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false, capture: true },
    );
  }
})();
