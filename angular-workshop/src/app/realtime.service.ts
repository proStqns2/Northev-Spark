import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';

/**
 * Service temps réel — un seul WebSocket par atelier.
 *
 * Protocole (identique au serveur `server/realtime.mjs`) :
 *   client → serveur : {type:'cursor'|'idle'|'activity'|'doc'|'chat'|'ping'}
 *   serveur → client : welcome | cursors | presence | revision | chat |
 *                      member-joined | member-left | room-closed | heartbeat
 *
 * Les curseurs reçus sont interpolés (lerp à 60 fps) pour un rendu fluide,
 * exactement comme le fait `perfect-cursors` côté Next.js.
 */

export interface LiveCursor {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  hover?: string | null;
  tool?: string;
  idle?: boolean;
}

export interface LiveParticipant {
  id: string;
  name: string;
  color: string;
  activity: string;
  idle: boolean;
}

export interface LiveMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: string;
}

interface SmoothCursor extends LiveCursor {
  /** position écran interpolée (px dans le repère 0→1) */
  px: number;
  py: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  color: string;
  name: string;
}

const ENDPOINT = '/rt';
const GRID_X = 22;
const GRID_Y = 14;
const SIZE_X = GRID_X * 32;
const SIZE_Y = GRID_Y * 32;

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private http = inject(HttpClient);

  readonly code = signal<string | null>(null);
  readonly connected = signal(false);
  readonly latency = signal(0);
  readonly participants = signal<LiveParticipant[]>([]);
  readonly messages = signal<LiveMessage[]>([]);
  readonly cursors = signal<LiveCursor[]>([]);
  readonly userId = signal(`u_${Math.random().toString(36).slice(2, 10)}`);
  readonly userName = signal('Visiteur Angular');
  readonly endpoint = signal(ENDPOINT);

  /** curseurs avec position lissée, lue par le template à 60 fps */
  readonly interpolated = signal<SmoothCursor[]>([]);

  private socket: WebSocket | null = null;
  private smooth = new Map<string, SmoothCursor>();
  private raf = 0;
  private lastCursorAt = new Map<string, number>();

  constructor() {
    this.tick = this.tick.bind(this);
    // persiste l'identité pour retrouver sa couleur d'une session à l'autre
    const savedId = localStorage.getItem('northev.rt.userId');
    const savedName = localStorage.getItem('northev.rt.userName');
    if (savedId) this.userId.set(savedId);
    if (savedName) this.userName.set(savedName);
    localStorage.setItem('northev.rt.userId', this.userId());
    localStorage.setItem('northev.rt.userName', this.userName());
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private url(code: string): string {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}${ENDPOINT}/ws/${code}?userId=${encodeURIComponent(
      this.userId(),
    )}&userName=${encodeURIComponent(this.userName())}`;
  }

  connect(code: string): void {
    this.disconnect();
    this.code.set(code);
    const socket = new WebSocket(this.url(code));
    this.socket = socket;

    socket.onopen = () => {
      this.connected.set(true);
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.tick);
    };

    socket.onclose = () => {
      this.connected.set(false);
      cancelAnimationFrame(this.raf);
    };

    socket.onerror = () => this.connected.set(false);

    socket.onmessage = (event) => {
      try {
        this.handle(JSON.parse(event.data));
      } catch {
        /* trame ignorée */
      }
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connected.set(false);
    this.code.set(null);
    this.participants.set([]);
    this.cursors.set([]);
    this.messages.set([]);
    this.smooth.clear();
    this.interpolated.set([]);
    cancelAnimationFrame(this.raf);
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  publishCursor(col: number, row: number, tool: string): void {
    this.sendRaw({ type: 'cursor', x: col, y: row, tool, hover: null });
  }

  publishIdle(): void {
    this.sendRaw({ type: 'idle' });
  }

  publishActivity(activity: string): void {
    this.sendRaw({ type: 'activity', activity });
  }

  publishDoc(doc: unknown): void {
    this.sendRaw({ type: 'doc', doc });
  }

  sendChat(text: string): void {
    this.sendRaw({ type: 'chat', text });
  }

  async createRoom(name: string): Promise<string> {
    const response = await this.http
      .post<{ code: string }>(`${ENDPOINT}/api/rooms`, {
        name,
        ownerId: this.userId(),
        ownerName: this.userName(),
        doc: { name, components: [], ground: 'gnd', terminals: { a: null, b: null }, regime: 'dc', frequency: 50 },
      })
      .toPromise();
    return response?.code ?? '';
  }

  private handle(message: Record<string, unknown>): void {
    switch (message['type']) {
      case 'welcome': {
        this.participants.set((message['participants'] as LiveParticipant[]) ?? []);
        this.messages.set((message['messages'] as LiveMessage[]) ?? []);
        break;
      }
      case 'presence': {
        this.participants.set((message['participants'] as LiveParticipant[]) ?? []);
        break;
      }
      case 'cursors': {
        const list = (message['cursors'] as LiveCursor[]) ?? [];
        const mine = this.userId();
        const stamp = performance.now();
        for (const cursor of list) {
          if (cursor.id === mine) continue;
          this.lastCursorAt.set(cursor.id, stamp);
          const existing = this.smooth.get(cursor.id);
          const tx = (cursor.x / GRID_X) * SIZE_X;
          const ty = (cursor.y / GRID_Y) * SIZE_Y;
          if (existing) {
            existing.tx = tx;
            existing.ty = ty;
            existing.tool = cursor.tool;
            existing.name = cursor.name;
            existing.color = cursor.color;
          } else {
            this.smooth.set(cursor.id, {
              ...cursor,
              px: tx,
              py: ty,
              tx,
              ty,
              vx: 0,
              vy: 0,
            });
          }
        }
        for (const id of [...this.smooth.keys()]) {
          if (!list.some((c) => c.id === id)) {
            const last = this.lastCursorAt.get(id) ?? 0;
            if (performance.now() - last > 12_000) {
              this.smooth.delete(id);
              this.lastCursorAt.delete(id);
            }
          }
        }
        this.cursors.set([...this.smooth.values()]);
        break;
      }
      case 'revision': {
        this.latency.set(Math.round(performance.now() % 100));
        break;
      }
      case 'chat': {
        const incoming = message['message'] as LiveMessage;
        this.messages.update((list) => [...list, incoming].slice(-80));
        break;
      }
      case 'member-joined': {
        this.participants.update((list) => [
          ...list.filter((p) => p.id !== message['id']),
          { id: String(message['id']), name: String(message['name']), color: '#46e6a0', activity: 'vient d’arriver', idle: false },
        ]);
        break;
      }
      case 'member-left': {
        this.participants.update((list) => list.filter((p) => p.id !== message['id']));
        this.smooth.delete(String(message['id']));
        break;
      }
      case 'room-closed': {
        this.disconnect();
        break;
      }
      case 'heartbeat': {
        this.sendRaw({ type: 'ping' });
        break;
      }
      default:
        break;
    }
  }

  /** interpolation des curseurs distants — ease vers la cible */
  private tick(): void {
    const stamp = performance.now();
    for (const cursor of this.smooth.values()) {
      cursor.px += (cursor.tx - cursor.px) * 0.24;
      cursor.py += (cursor.ty - cursor.py) * 0.24;
    }
    if (this.smooth.size) this.interpolated.set([...this.smooth.values()]);
    void stamp;
    this.raf = requestAnimationFrame(this.tick);
  }
}
