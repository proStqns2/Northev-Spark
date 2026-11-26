import { JSDOM, VirtualConsole } from 'jsdom';
const base = 'http://127.0.0.1:3000';
const pages = ['/', '/compte', '/compte?mode=inscription', '/studio', '/agents', '/bibliotheque', '/multiwork', '/premium', '/projets', '/symboles', '/export'];
const cookie = process.argv[2] ?? '';

for (const page of pages) {
  const res = await fetch(base + page, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    console.log(`${page.padEnd(26)} (redirigé ${res.status})`);
    continue;
  }
  const html = await res.text();
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message.split('\n')[0]));
  vc.on('error', (...a) => errors.push(String(a[0]).split('\n')[0]));
  const dom = new JSDOM(html, {
    url: base + page, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      for (const key of ['ReadableStream','WritableStream','TransformStream','TextEncoder','TextDecoder','AbortController','AbortSignal','structuredClone','queueMicrotask']) {
        if (!(key in window) && key in globalThis) window[key] = globalThis[key];
      }
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      window.matchMedia = window.matchMedia || (() => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
      window.cancelAnimationFrame = clearTimeout;
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 2200));
  const unique = [...new Set(errors)];
  console.log(`${page.padEnd(26)} ${unique.length ? `✗ ${unique.length} erreur(s)` : '✓ aucune erreur'}`);
  for (const e of unique.slice(0, 2)) console.log('    ', e.slice(0, 150));
  dom.window.close();
}
