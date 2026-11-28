#!/usr/bin/env node
/**
 * Migration / sauvegarde de `.data/db.json` vers MongoDB.
 *
 *   node scripts/mongo-migrate.mjs --dry-run        # montre ce qui partirait
 *   MONGODB_URI=mongodb+srv://… node scripts/mongo-migrate.mjs
 *
 * Le script ne modifie jamais le fichier local : il copie. En cas d'absence du
 * pilote `mongodb`, il explique quoi installer et sort avec le code 2.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const input = (() => {
  const index = args.indexOf('--input');
  return index >= 0 ? args[index + 1] : path.join(process.cwd(), '.data', 'db.json');
})();
const databaseName = process.env.MONGODB_DB || 'northev_spark';
const uri = process.env.MONGODB_URI;

function hash(value) {
  let first = 0x811c9dc5;
  for (let index = 0; index < String(value).length; index += 1) {
    first = Math.imul(first ^ String(value).charCodeAt(index), 0x01000193) >>> 0;
  }
  return first.toString(16).padStart(8, '0');
}

const raw = await readFile(input, 'utf8');
const data = JSON.parse(raw);

const collections = {
  spark_users: (data.users ?? []).map(({ passwordHash, ...rest }) => ({
    ...rest,
    passwordHashLength: passwordHash?.length ?? 0,
  })),
  spark_sessions: (data.sessions ?? []).map(({ token, ...rest }) => ({ ...rest, tokenHash: hash(token) })),
  spark_circuits: data.circuits ?? [],
  spark_progress: data.progress ?? [],
  spark_projects: data.projects ?? [],
  spark_rooms: data.rooms ?? [],
};

console.log(`Source      : ${input}`);
console.log(`Cible       : ${databaseName}${uri ? '' : ' (MONGODB_URI absent)'}`);
for (const [name, rows] of Object.entries(collections)) {
  console.log(`  ${name.padEnd(16)} ${String(rows.length).padStart(5)} document(s)`);
}

if (dryRun) {
  console.log('\n--dry-run : aucune écriture.');
  process.exit(0);
}

if (!uri) {
  console.error('\nMONGODB_URI est requis pour écrire. Exemple :');
  console.error('  MONGODB_URI="mongodb+srv://user:pass@cluster/spark" node scripts/mongo-migrate.mjs');
  process.exit(2);
}

let MongoClient;
try {
  ({ MongoClient } = await import('mongodb'));
} catch {
  console.error('\nPilote absent. Installez-le :');
  console.error('  npm i mongodb');
  process.exit(2);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const database = client.db(databaseName);
  const stamp = new Date().toISOString();
  for (const [name, rows] of Object.entries(collections)) {
    const collection = database.collection(name);
    if (rows.length === 0) {
      console.log(`${name.padEnd(16)} vide — ignoré`);
      continue;
    }
    await collection.deleteMany({});
    await collection.insertMany(rows.map((row) => ({ ...row, _backupAt: stamp })));
    await collection.createIndex({ _backupAt: -1 }).catch(() => undefined);
    console.log(`${name.padEnd(16)} ${rows.length} document(s) écrits`);
  }
  console.log(`\nSauvegarde terminée à ${stamp}.`);
} finally {
  await client.close();
}
