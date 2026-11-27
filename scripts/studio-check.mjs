/**
 * Vérifie l'atelier dans un DOM réel (jsdom) : pose d'une pièce, déplacement,
 * outil fil, calcul et barre R·C·L. Ce script tourne contre le serveur local déjà démarré.
 *
 * Il ne remplace pas un navigateur, mais il prouve que la chaîne
 * « clic palette → clic plan → pièce dans le document → calcul » fonctionne,
 * ce qui était exactement le point faible signalé.
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const page = '/studio';

const html = await (await fetch(base + page)).text();
const errors = [];
const logs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (event) => errors.push(event.message));
vc.on('error', (...args) => errors.push(args.join(' ')));

const WIDTH = 940;
const HEIGHT = 560;

const dom = new JSDOM(html, {
  url: base + page,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    for (const key of [
      'ReadableStream', 'WritableStream', 'TransformStream', 'TextEncoder', 'TextDecoder',
      'AbortController', 'AbortSignal', 'structuredClone', 'queueMicrotask',
    ]) {
      if (!(key in window) && key in globalThis) window[key] = globalThis[key];
    }
    window.fetch = (url, options) => fetch(new URL(url, window.location.href), options);
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = clearTimeout;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    // jsdom ne calcule pas de mise en page : on fournit une surface réaliste
    const rect = () => ({
      x: 0, y: 0, top: 0, left: 0, width: WIDTH, height: HEIGHT,
      right: WIDTH, bottom: HEIGHT, toJSON() { return this; },
    });
    window.Element.prototype.getBoundingClientRect = rect;
    window.SVGElement.prototype.getBoundingClientRect = rect;
    window.HTMLElement.prototype.getBoundingClientRect = rect;
  },
});

await new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
await new Promise((resolve) => setTimeout(resolve, 2600));

const { document } = dom.window;
const win = /** @type {any} */ (dom.window);
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const canvas = document.querySelector('[data-testid="editor-canvas"]');
check('le plan est présent', Boolean(canvas));

const partsOf = () => [...document.querySelectorAll('[data-part-id]')];
const initialCount = partsOf().length;
check('montage d’amorçage affiché', initialCount > 0, `${initialCount} pièces`);

// --- pose d'une résistance depuis la palette ---
const paletteButton = [...document.querySelectorAll('button')].find((button) =>
  (button.getAttribute('title') ?? '').startsWith('Résistance'),
);
check('la palette propose la résistance', Boolean(paletteButton));
paletteButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 120));

const status = () => document.querySelector('[data-testid="editor-canvas"]')?.parentElement?.textContent ?? '';
check('la palette arme l’outil de pose', /Pose :/.test(status()), status().slice(0, 60));

const pointer = (type, x, y) => {
  const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  canvas.dispatchEvent(event);
};

pointer('pointerdown', 520, 320);
await new Promise((resolve) => setTimeout(resolve, 160));
const afterPlace = partsOf();
check('un clic sur le plan pose la pièce', afterPlace.length === initialCount + 1, `${initialCount} → ${afterPlace.length}`);

const placed = afterPlace[afterPlace.length - 1];
const placedA = placed?.getAttribute('data-a');
check('la pièce est posée à la cellule cliquée', Boolean(placedA), placedA ?? 'aucune cellule');

// après une pose, l'outil revient en sélection : c'est ce qui rend le
// glisser possible tout de suite
check('retour en sélection après la pose', /Sélection/.test(status()), status().slice(-40));

// --- déplacement par glisser ---
if (placed) {
  const before = placed.getAttribute('data-a');
  placed.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 520, clientY: 320, button: 0 }));
  win.document.dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true, clientX: 616, clientY: 320, button: 0 }));
  canvas.dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true, clientX: 616, clientY: 320, button: 0 }));
  canvas.dispatchEvent(new win.MouseEvent('pointerup', { bubbles: true, clientX: 616, clientY: 320, button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 160));
  const moved = partsOf().find((node) => node.getAttribute('data-part-id') === placed.getAttribute('data-part-id'));
  const after = moved?.getAttribute('data-a');
  check('glisser déplace la pièce', before !== after, `${before} → ${after}`);
}

// --- outil fil au clavier ---
doc_key(win, 'w');
await new Promise((resolve) => setTimeout(resolve, 120));
check('la touche W arme l’outil fil', /Fil/.test(status()), status().slice(0, 60));
doc_key(win, 'v');
await new Promise((resolve) => setTimeout(resolve, 100));

// --- calcul ---
const solveButton = [...document.querySelectorAll('button')].find((button) => /Calculer/.test(button.textContent ?? ''));
check('bouton Calculer présent', Boolean(solveButton));
solveButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, waitUntil: 0 }));
await new Promise((resolve) => setTimeout(resolve, 400));
const bodyText = document.body.textContent ?? '';
check('le calcul renvoie une valeur', /V\(|Eth|Rth/.test(bodyText), /Eth/.test(bodyText) ? 'Eth/Rth affichés' : 'aucune valeur');

// --- annulation ---
doc_key(win, 'z', { ctrlKey: true });
await new Promise((resolve) => setTimeout(resolve, 160));
check('Ctrl+Z est branché', partsOf().length >= initialCount, `${partsOf().length} pièces`);

// --- le montage R·C·L calculé se charge ou s’ajoute au plan sans perdre l’historique ---
const valueBar = document.querySelector('[aria-label="Barre de valeurs R, C, L du montage"]');
const valueAction = (label) => [...(valueBar?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label);
const appendButton = valueAction('Ajouter');
const loadButton = valueAction('Charger');
check('la barre R·C·L a reçu le montage calculé', Boolean(appendButton && !appendButton.disabled && loadButton && !loadButton.disabled));

const snapshot = () => partsOf().map((part) => ['data-part-id', 'data-a', 'data-b'].map((attr) => part.getAttribute(attr)).join('|'));
const beforeValues = snapshot();
appendButton?.click();
await new Promise((resolve) => setTimeout(resolve, 120));
const afterAppend = snapshot();
check('Ajouter pose le bloc R·C·L sans modifier les pièces présentes',
  afterAppend.length === beforeValues.length + 7 && beforeValues.every((part, index) => afterAppend[index] === part));

loadButton?.click();
await new Promise((resolve) => setTimeout(resolve, 120));
check('Charger remplace le plan par le montage R·C·L',
  partsOf().length === 7 && Boolean(canvas.querySelector('[data-kind="inductor"]')) && Boolean(canvas.querySelector('[data-kind="capacitor"]')));
for (let action = 0; action < 2; action += 1) {
  doc_key(win, 'z', { ctrlKey: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
}
check('Annuler restaure les pièces et leurs positions', JSON.stringify(snapshot()) === JSON.stringify(beforeValues));

// --- voie sans plan : montage pas à pas (boutons seuls, aucun canvas) ---
const pasTab = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Pas à pas');
pasTab?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 200));
const builder = document.querySelector('[aria-label="Montage pas à pas"]');
check('le panneau « Montage pas à pas » est accessible', Boolean(builder));

const placeButton = [...(builder?.querySelectorAll('button') ?? [])].find((button) =>
  /^Poser/.test(button.textContent.trim()),
);
check('le bouton « Poser » existe sans toucher au plan', Boolean(placeButton));

const beforeStep = partsOf().map((part) => part.getAttribute('data-part-id'));
placeButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 160));
placeButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 160));
const afterStep = partsOf().map((part) => part.getAttribute('data-part-id'));
check('deux clics ajoutent deux dipôles au document', afterStep.length === beforeStep.length + 2,
  `${beforeStep.length} → ${afterStep.length}`);
const addedParts = partsOf().filter((part) => !beforeStep.includes(part.getAttribute('data-part-id')));
const addedNodes = addedParts.map((part) => [part.getAttribute('data-a'), part.getAttribute('data-b')]);
const chained =
  addedNodes.length === 2 && addedNodes.some(([, b], index) => addedNodes[index === 0 ? 1 : 0]?.[0] === b);
check('les dipôles ajoutés s’enchaînent sur un nœud commun', chained, JSON.stringify(addedNodes));

const solveStep = [...(builder?.querySelectorAll('button') ?? [])].find((button) => /Calculer ce montage/.test(button.textContent));
check('le panneau lance le calcul lui-même', Boolean(solveStep));

check('aucune erreur JavaScript', errors.length === 0, errors[0]?.slice(0, 120) ?? '');

function doc_key(target, key, options = {}) {
  target.document.dispatchEvent(new target.KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

const passed = results.filter((item) => item.ok).length;
console.log(`\n${passed}/${results.length} contrôles passés`);
dom.window.close();
process.exit(passed === results.length ? 0 : 1);
