/**
 * Vérifie que chaque page s'hydrate vraiment : on clique un contrôle et on
 * exige que le DOM change (preuve que React a attaché ses gestionnaires).
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const base = 'http://127.0.0.1:3000';

async function open(page, selector, action, label) {
  const html = await (await fetch(base + page)).text();
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(a.join(' ')));

  const dom = new JSDOM(html, {
    url: base + page,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      for (const key of ['ReadableStream', 'WritableStream', 'TransformStream', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'structuredClone', 'queueMicrotask']) {
        if (!(key in window) && key in globalThis) window[key] = globalThis[key];
      }
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
      window.cancelAnimationFrame = clearTimeout;
    },
  });

  await new Promise((r) => dom.window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 2500));

  const doc = dom.window.document;
  const before = doc.body.innerHTML.length;
  const target = doc.querySelector(selector);
  if (!target) {
    console.log(`${label.padEnd(22)} ✗ cible absente (${selector})`);
    dom.window.close();
    return false;
  }
  action(target, dom.window);
  await new Promise((r) => setTimeout(r, 700));
  const after = doc.body.innerHTML.length;
  const changed = before !== after;
  console.log(
    `${label.padEnd(22)} ${changed ? '✓ interactif' : '✗ aucun changement'}  (${before} → ${after})${errors.length ? `  erreurs: ${errors.length}` : ''}`,
  );
  if (errors.length) console.log('   ', errors[0].slice(0, 160));
  dom.window.close();
  return changed;
}

await open('/compte?mode=connexion', 'button:nth-of-type(1)', (el) => el.click(), 'compte : onglets');
await open('/bibliotheque', 'input[type="search"], input[placeholder]', (el, win) => {
  // React suit la valeur via son propre descripteur : il faut le setter natif
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  setter.call(el, 'norton');
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}, 'bibliothèque : recherche');
await open('/studio', 'svg', () => {}, 'studio : rendu canvas');
await open('/studio', 'button', (el) => el.click(), 'studio : bouton');
await open('/multiwork', 'button', (el) => el.click(), 'multiwork : bouton');
