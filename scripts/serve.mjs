#!/usr/bin/env node
/**
 * Démarre le site en un seul geste.
 *
 * L'application Next.js est la seule chose à faire tourner (pages React +
 * API + temps réel). Ce script construit d'abord si nécessaire : le dossier
 * `.next` n'est pas conservé entre deux sessions, et un `next start` sans
 * build échoue avec une page blanche — la cause la plus fréquente d'un
 * aperçu « vide ».
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildId = path.join(root, '.next', 'BUILD_ID');
const port = process.env.PORT ?? '3000';

function run(command, args, env = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} → code ${code}`))));
    child.on('error', reject);
  });
}

if (!existsSync(buildId) || process.env.FORCE_BUILD === '1') {
  console.log('▸ build Next.js (première exécution ou code modifié)');
  await run('npx', ['next', 'build']);
}

console.log(`▸ Next.js sur http://0.0.0.0:${port}`);
const server = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', port], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
server.on('exit', (code) => process.exit(code ?? 0));
