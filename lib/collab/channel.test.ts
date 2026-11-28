/**
 * Tests du canal de collaboration multi-onglets.
 *
 * Node expose BroadcastChannel (worker_threads) : on peut donc vérifier
 * l'échange réel de messages entre deux « onglets » sans navigateur.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openChannel, postMessage, type CollabMessage } from './channel';
import type { CircuitDoc } from '@/lib/engine/types';

const doc: CircuitDoc = {
  version: 1,
  components: [
    { id: 'R1', kind: 'resistor', a: '0,0', b: '2,0', value: 1000 },
    { id: 'E1', kind: 'vsource', a: '2,0', b: '4,0', value: 12 },
  ],
  wires: [],
  nodes: [],
  ground: '0,0',
  terminals: { a: '2,0', b: '4,0' },
  simulationConfig: { mode: 'dc', frequency: 50 },
} as unknown as CircuitDoc;

const receive = (channel: BroadcastChannel): Promise<CollabMessage> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message non reçu')), 2000);
    channel.onmessage = (event: MessageEvent<CollabMessage>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
  });

describe('canal multi-onglets', () => {
  it('transmet le document d\u2019un onglet à l\u2019autre', async () => {
    const tabA = openChannel();
    const tabB = openChannel();
    assert.ok(tabA && tabB, 'BroadcastChannel indisponible');
    try {
      const waiting = receive(tabB);
      postMessage(tabA, { kind: 'doc', doc, sender: 'A' });
      const message = await waiting;
      assert.equal(message.kind, 'doc');
      if (message.kind === 'doc') {
        assert.equal(message.sender, 'A');
        assert.equal(message.doc.components.length, 2);
        assert.equal(message.doc.components[0].value, 1000);
      }
    } finally {
      tabA.close();
      tabB.close();
    }
  });

  it('transmet verrous, activité et curseurs', async () => {
    const tabA = openChannel();
    const tabB = openChannel();
    assert.ok(tabA && tabB);
    try {
      const lockWait = receive(tabB);
      postMessage(tabA, {
        kind: 'lock',
        lock: { componentId: 'R1', userId: 'tab-A', userName: 'Ryad', color: '#38e1e6' },
        sender: 'A',
      });
      const lock = await lockWait;
      assert.equal(lock.kind, 'lock');
      if (lock.kind === 'lock') assert.equal(lock.lock?.componentId, 'R1');

      const cursorWait = receive(tabB);
      postMessage(tabA, { kind: 'cursor', x: 4, y: 2, sender: 'A', name: 'Ryad', color: '#38e1e6' });
      const cursor = await cursorWait;
      assert.equal(cursor.kind, 'cursor');
      if (cursor.kind === 'cursor') {
        assert.equal(cursor.x, 4);
        assert.equal(cursor.name, 'Ryad');
      }

      const activityWait = receive(tabB);
      postMessage(tabA, {
        kind: 'activity',
        entry: { id: 'e1', userName: 'Ryad', text: 'ajoute R1', at: new Date().toISOString() },
        sender: 'A',
      });
      const activity = await activityWait;
      assert.equal(activity.kind, 'activity');
      if (activity.kind === 'activity') assert.match(activity.entry.text, /R1/);
    } finally {
      tabA.close();
      tabB.close();
    }
  });

  it('postMessage tolère un canal absent', () => {
    assert.doesNotThrow(() => postMessage(null, { kind: 'bye', sender: 'A' }));
  });
});
