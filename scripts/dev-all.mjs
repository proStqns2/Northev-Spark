#!/usr/bin/env node
/**
 * Lance les deux processus du site, en un seul geste :
 *
 *  1. le service Express (port 4001) — leader de l'analyse R·C·L ;
 *  2. le site Next.js (port 3000) — studio, pages, reste de l'API.
 *
 * Le studio fonctionne aussi sans Express (repli automatique sur le moteur
 * Next), donc un échec d'un des deux processus n'arrête pas l'autre.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const expressPort = process.env.EXPRESS_PORT ?? '4001';

const children = [];

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  child.on('exit', (code, signal) => {
    console.log(`▸ ${name} arrêté (${signal ?? code ?? 0})`);
    shutdown();
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('express', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'server/express.ts'], {
  EXPRESS_PORT: expressPort,
});
start('next', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-H', '0.0.0.0', '-p', process.env.PORT ?? '3000'], {
  EXPRESS_URL: `http://127.0.0.1:${expressPort}`,
  NEXT_PUBLIC_EXPRESS_URL: process.env.NEXT_PUBLIC_EXPRESS_URL ?? '',
});
