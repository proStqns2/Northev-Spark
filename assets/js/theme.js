/* =========================================================
   Northev Spark — thème du site
   - Mode : système / clair / sombre (data-theme sur <html>)
   - Couleur d'accent personnalisée (variable --accent)
   - Rayon des coins (--radius)
   Tout est persisté dans localStorage sous la clé "northev.theme"
   et l'état est synchronisé avec le panneau "Thème" de l'en-tête.
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'northev.theme';
  var DEFAULTS = { mode: 'system', accent: '#6d4aff', radius: 14 };
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function defaults() { return { mode: DEFAULTS.mode, accent: DEFAULTS.accent, radius: DEFAULTS.radius }; }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) { return defaults(); }
  }

  var state = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  }

  function resolvedMode() {
    return state.mode === 'system' ? (media.matches ? 'dark' : 'light') : state.mode;
  }

  /* Choisit la couleur de texte (blanc ou sombre) qui contraste avec l'accent. */
  function contrastOn(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return '#ffffff';
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return L > 0.45 ? '#12141a' : '#ffffff';
  }

  function apply() {
    var root = document.documentElement;
    root.setAttribute('data-theme', resolvedMode());
    root.style.setProperty('--accent', state.accent);
    root.style.setProperty('--on-accent', contrastOn(state.accent));
    root.style.setProperty('--radius', (parseInt(state.radius, 10) || 0) + 'px');
    syncUI();
  }

  function syncUI() {
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode));
    });
    document.querySelectorAll('[data-accent]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-accent').toLowerCase() === String(state.accent).toLowerCase()));
    });
    var picker = document.getElementById('accentPicker');
    if (picker && /^#[0-9a-f]{6}$/i.test(state.accent)) picker.value = state.accent;
    var range = document.getElementById('radiusRange');
    if (range) range.value = String(state.radius);
    var out = document.getElementById('radiusValue');
    if (out) out.textContent = (parseInt(state.radius, 10) || 0) + ' px';
  }

  function set(patch) {
    Object.assign(state, patch);
    save();
    apply();
  }

  /* Suit les changements du système quand le mode "système" est actif. */
  if (media.addEventListener) media.addEventListener('change', function () { if (state.mode === 'system') apply(); });
  else if (media.addListener) media.addListener(function () { if (state.mode === 'system') apply(); });

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    apply();

    /* Ouverture / fermeture du panneau */
    var btn = document.getElementById('themeBtn');
    var panel = document.getElementById('themePanel');
    if (btn && panel) {
      function toggle(force) {
        var open = (force === undefined) ? !panel.classList.contains('open') : force;
        panel.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      }
      btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      document.addEventListener('click', function () { toggle(false); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) { toggle(false); btn.focus(); }
      });
      btn._themeToggle = toggle; /* pratique pour tester en console */
    }

    /* Modes (système / clair / sombre) */
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { set({ mode: b.getAttribute('data-mode') }); });
    });

    /* Pastilles de couleur d'accent */
    document.querySelectorAll('[data-accent]').forEach(function (b) {
      b.addEventListener('click', function () { set({ accent: b.getAttribute('data-accent') }); });
    });

    /* Sélecteur de couleur libre */
    var picker = document.getElementById('accentPicker');
    if (picker) picker.addEventListener('input', function () { set({ accent: picker.value }); });

    /* Rayon des coins */
    var range = document.getElementById('radiusRange');
    if (range) range.addEventListener('input', function () { set({ radius: parseInt(range.value, 10) || 0 }); });

    /* Réinitialiser le thème */
    var reset = document.getElementById('themeReset');
    if (reset) reset.addEventListener('click', function () {
      state = defaults();
      save();
      apply();
    });
  });
})();
