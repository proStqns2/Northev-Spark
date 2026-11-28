#!/usr/bin/env node
/**
 * Vérifie qu'une clé IA fonctionne — sans jamais l'afficher.
 *
 *   node scripts/ai-selftest.mjs            # lit .env.local puis l'environnement
 *   node scripts/ai-selftest.mjs --json     # sortie machine
 *
 * Le script envoie une requête minuscule (« réponds OK ») à chaque fournisseur
 * configuré, affiche le code HTTP et le modèle, et masque toute clé dans les
 * messages d'erreur. Sortie 0 si au moins un fournisseur répond.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

async function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = await readFile(path, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '').trim();
    if (value) env[match[1]] = value;
  }
  return env;
}

const fileEnv = await loadEnvFile('.env.local');
const env = (key) => process.env[key] ?? fileEnv[key];

const providers = [
  {
    id: 'gemini',
    keyName: 'GEMINI_API_KEY',
    key: env('GEMINI_API_KEY') ?? env('GOOGLE_API_KEY'),
    model: env('GEMINI_MODEL') ?? 'gemini-2.5-flash',
    call: async (key, model) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement : OK' }] }] }),
      }),
    extract: async (response) => {
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? '';
    },
  },
  {
    id: 'openrouter',
    keyName: 'OPENROUTER_API_KEY',
    key: env('OPENROUTER_API_KEY'),
    model: env('OPENROUTER_MODEL') ?? 'google/gemini-2.0-flash-001',
    call: async (key, model) =>
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'Northev Spark' },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Réponds uniquement : OK' }] }),
      }),
    extract: async (response) => {
      const data = await response.json();
      return data?.choices?.[0]?.message?.content ?? '';
    },
  },
  {
    id: 'openai',
    keyName: 'OPENAI_API_KEY',
    key: env('OPENAI_API_KEY'),
    model: env('OPENAI_MODEL') ?? 'gpt-4o-mini',
    call: async (key, model) =>
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Réponds uniquement : OK' }] }),
      }),
    extract: async (response) => {
      const data = await response.json();
      return data?.choices?.[0]?.message?.content ?? '';
    },
  },
];

const mask = (text) =>
  String(text)
    .replace(/sk-or-v1-[A-Za-z0-9]+/g, 'sk-or-v1-***')
    .replace(/sk-[A-Za-z0-9]{12,}/g, 'sk-***')
    .replace(/AQ\.[A-Za-z0-9_\-]{10,}/g, 'AQ.***')
    .replace(/AIza[A-Za-z0-9_\-]{10,}/g, 'AIza***');

const results = [];
for (const provider of providers) {
  if (!provider.key) {
    results.push({ provider: provider.id, configured: false, ok: false, detail: `${provider.keyName} non défini` });
    continue;
  }
  const started = Date.now();
  try {
    const response = await provider.call(provider.key, provider.model);
    const body = response.ok ? await provider.extract(response) : mask((await response.text()).slice(0, 200));
    results.push({
      provider: provider.id,
      configured: true,
      ok: response.ok,
      status: response.status,
      model: provider.model,
      ms: Date.now() - started,
      detail: response.ok ? String(body).trim().slice(0, 60) : body,
      keyLength: provider.key.length,
    });
  } catch (error) {
    results.push({
      provider: provider.id,
      configured: true,
      ok: false,
      model: provider.model,
      ms: Date.now() - started,
      detail: mask(error instanceof Error ? error.message : 'erreur réseau'),
      keyLength: provider.key.length,
    });
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.log('Contrôle des clés IA (aucune clé affichée)\n');
  for (const result of results) {
    const state = !result.configured ? '— non configuré' : result.ok ? '✓ répond' : `✗ échec${result.status ? ` (${result.status})` : ''}`;
    console.log(`  ${result.provider.padEnd(11)} ${state}`);
    if (result.configured) console.log(`              modèle ${result.model} · clé de ${result.keyLength} caractères · ${result.ms} ms`);
    if (result.detail) console.log(`              ${String(result.detail).replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  const working = results.filter((result) => result.ok).length;
  console.log(`\n${working}/${results.length} fournisseur(s) opérationnel(s).`);
  if (!working) {
    console.log('Rappel : sans clé, le studio, l’académie et le laboratoire restent entièrement fonctionnels.');
  }
}

process.exit(results.some((result) => result.ok) ? 0 : 1);
