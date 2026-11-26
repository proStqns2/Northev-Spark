import { Component, computed, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RealtimeService, type LiveCursor, type LiveMessage, type LiveParticipant } from './realtime.service';

/**
 * Atelier Angular — même protocole que le studio Next.js :
 * codes à 5 chiffres, curseurs WebSocket, présence et chat.
 *
 * Choix techniques :
 *  - signals + change detection zoneless (pas de zone.js)
 *  - le dessin de la grille est un SVG piloté par signals
 *  - les curseurs distants sont interpolés côté service (requestAnimationFrame)
 */

interface Placed {
  id: string;
  kind: 'resistor' | 'capacitor' | 'inductor' | 'vsource' | 'isource';
  a: string;
  b: string;
  value: number;
}

const GRID = 32;
const COLS = 22;
const ROWS = 14;

const SYMBOL: Record<Placed['kind'], { label: string; unit: string; color: string; initial: number }> = {
  resistor: { label: 'Résistance', unit: 'Ω', color: '#38e1e6', initial: 1000 },
  capacitor: { label: 'Condensateur', unit: 'F', color: '#46e6a0', initial: 1e-6 },
  inductor: { label: 'Bobine', unit: 'H', color: '#a479ff', initial: 10e-3 },
  vsource: { label: 'Source E', unit: 'V', color: '#ffc266', initial: 12 },
  isource: { label: 'Source i', unit: 'A', color: '#4f9dff', initial: 2 },
};

@Component({
  selector: 'ws-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ws">
      <header class="bar">
        <div class="brand">
          <span class="dot"></span>
          <strong>Northev Spark</strong>
          <span class="tag">Atelier Angular</span>
        </div>

        <div class="join" *ngIf="!rt.connected() && !rt.code()">
          <input
            [(ngModel)]="codeInput"
            maxlength="5"
            inputmode="numeric"
            placeholder="Code à 5 chiffres"
            class="code-input"
            (keyup.enter)="join()"
          />
          <button class="btn primary" (click)="join()" [disabled]="!validCode()">Rejoindre</button>
          <button class="btn" (click)="create()">Créer un atelier</button>
        </div>

        <div class="live" *ngIf="rt.code()">
          <span class="code">{{ rt.code() }}</span>
          <span class="pill" [class.ok]="rt.connected()">
            {{ rt.connected() ? 'websocket · ' + rt.latency() + ' ms' : 'reconnexion…' }}
          </span>
          <span class="pill">{{ rt.participants().length }} en ligne</span>
          <button class="btn ghost" (click)="leave()">Quitter</button>
        </div>
      </header>

      <main class="work">
        <!-- ------------------------------------------------- Build Box -->
        <aside class="box">
          <p class="box-title">Composants</p>
          <div class="tiles">
            @for (item of kinds; track item) {
              <button
                class="tile"
                [class.active]="tool() === item"
                (click)="tool.set(item)"
                [title]="SYMBOL[item].label"
              >
                <svg viewBox="-50 -50 100 100" width="36" height="36">
                  <g [attr.stroke]="SYMBOL[item].color" stroke-width="3" fill="none" stroke-linecap="round">
                    @switch (item) {
                      @case ('resistor') {
                        <rect x="-16" y="-6" width="32" height="12" rx="1.5" />
                      }
                      @case ('capacitor') {
                        <line x1="-4" y1="-13" x2="-4" y2="13" />
                        <line x1="4" y1="-13" x2="4" y2="13" />
                      }
                      @case ('inductor') {
                        <path d="M -17 0 a 4.2 4.2 0 0 1 8.5 0 a 4.2 4.2 0 0 1 8.5 0 a 4.2 4.2 0 0 1 8.5 0 a 4.2 4.2 0 0 1 8.5 0" />
                      }
                      @case ('vsource') {
                        <circle cx="0" cy="0" r="13" />
                        <line x1="0" y1="-6" x2="0" y2="6" />
                        <line x1="-6" y1="0" x2="6" y2="0" />
                      }
                      @case ('isource') {
                        <circle cx="0" cy="0" r="13" />
                        <line x1="0" y1="20" x2="0" y2="-20" />
                        <path d="M -5 -14 L 0 -21 L 5 -14" />
                      }
                    }
                  </g>
                </svg>
                <span>{{ SYMBOL[item].label }}</span>
              </button>
            }
          </div>

          <p class="box-title">Valeur</p>
          <div class="field">
            <input type="number" [(ngModel)]="draftValue" class="input" />
            <span class="unit">{{ SYMBOL[tool()].unit }}</span>
          </div>

          <div class="stats">
            <p><span>{{ placed().length }}</span> dipôles</p>
            <p><span>{{ cursors().length }}</span> curseurs</p>
          </div>

          <p class="hint">
            Cliquez deux nœuds de la grille pour placer le dipôle. Les curseurs des autres participants
            apparaissent en direct.
          </p>
        </aside>

        <!-- -------------------------------------------------- grille -->
        <section class="stage" #stage>
          <svg
            class="grid"
            [attr.viewBox]="'0 0 ' + COLS * GRID + ' ' + ROWS * GRID"
            (pointermove)="onMove($event)"
            (pointerleave)="rt.publishIdle()"
            (click)="onClick($event)"
          >
            <defs>
              <pattern [attr.id]="'g'" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#1e3350" />
              </pattern>
            </defs>
            <rect [attr.width]="COLS * GRID" [attr.height]="ROWS * GRID" [attr.fill]="'url(#g)'" />

            @for (c of placed(); track c.id) {
              <g [attr.transform]="transform(c)">
                <g [attr.stroke]="SYMBOL[c.kind].color" stroke-width="2.2" fill="none" stroke-linecap="round">
                  @switch (c.kind) {
                    @case ('resistor') {
                      <rect x="-16" y="-6" width="32" height="12" rx="1.5" />
                    }
                    @case ('capacitor') {
                      <line x1="-3" y1="-12" x2="-3" y2="12" />
                      <line x1="3" y1="-12" x2="3" y2="12" />
                    }
                    @case ('inductor') {
                      <path d="M -16 0 a 4 4 0 0 1 8 0 a 4 4 0 0 1 8 0 a 4 4 0 0 1 8 0 a 4 4 0 0 1 8 0" />
                    }
                    @case ('vsource') {
                      <circle cx="0" cy="0" r="12" />
                      <line x1="0" y1="-5" x2="0" y2="5" />
                      <line x1="-5" y1="0" x2="5" y2="0" />
                    }
                    @case ('isource') {
                      <circle cx="0" cy="0" r="12" />
                      <line x1="0" y1="18" x2="0" y2="-18" />
                      <path d="M -4 -13 L 0 -19 L 4 -13" />
                    }
                  }
                </g>
                <text x="0" y="-16" text-anchor="middle" font-size="9" fill="#8ba3c0">
                  {{ c.kind === 'vsource' ? 'E' : c.kind === 'isource' ? 'i' : SYMBOL[c.kind].label.charAt(0) }}
                </text>
              </g>
            }

            @for (p of rt.interpolated(); track p.id) {
              <g [attr.transform]="'translate(' + p.px + ' ' + p.py + ')'" class="remote">
                <path d="M0 0 L0 17 L4.6 12.6 L7.4 18.6 L10.2 17.2 L7.6 11.4 L13.6 11 Z" [attr.fill]="p.color" />
                <rect x="14" y="16" rx="4" width="88" height="17" [attr.fill]="p.color" opacity="0.94" />
                <text x="20" y="28" font-size="10" fill="#04121a" font-weight="700">
                  {{ p.name }}
                </text>
              </g>
            }

            @if (pending(); as start) {
              <circle [attr.cx]="start.x" [attr.cy]="start.y" r="5" fill="#38e1e6" />
            }
          </svg>

          <div class="badges">
            @for (p of rt.participants(); track p.id) {
              <span class="badge" [style.borderColor]="p.color">
                <i [style.background]="p.color"></i>{{ p.name }}
              </span>
            }
          </div>
        </section>

        <!-- ---------------------------------------------------- chat -->
        <aside class="side">
          <p class="box-title">Équipe</p>
          <ul class="people">
            @for (p of rt.participants(); track p.id) {
              <li>
                <span class="av" [style.background]="p.color">{{ initials(p.name) }}</span>
                <span class="who">
                  <b>{{ p.name }}</b>
                  <em>{{ p.activity }}</em>
                </span>
                <span class="on" [class.idle]="p.idle"></span>
              </li>
            } @empty {
              <li class="empty">Personne pour l’instant.</li>
            }
          </ul>

          <p class="box-title">Chat</p>
          <ul class="chat">
            @for (m of rt.messages(); track m.id) {
              <li [class.mine]="m.authorId === rt.userId()">
                <b>{{ m.authorName }}</b>
                <span>{{ m.text }}</span>
              </li>
            } @empty {
              <li class="empty">Aucun message.</li>
            }
          </ul>
          <form class="compose" (submit)="$event.preventDefault(); send()">
            <input [(ngModel)]="message" name="message" placeholder="Écrire…" class="input" />
            <button class="btn primary" type="submit" [disabled]="!message.trim()">↑</button>
          </form>
        </aside>
      </main>

      <footer class="foot">
        <span>Angular {{ version }} · signals zoneless · WebSocket</span>
        <span>Serveur : {{ rt.endpoint() }}</span>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background: #060f19;
        color: #e6f2ff;
        font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      }
      .ws {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 16px;
        border-bottom: 1px solid #16283b;
        background: #08131f;
        flex-wrap: wrap;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #38e1e6;
        box-shadow: 0 0 10px #38e1e6;
      }
      .tag {
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #8ba3c0;
        border: 1px solid #1e3350;
        border-radius: 999px;
        padding: 2px 7px;
      }
      .join,
      .live {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-left: auto;
        flex-wrap: wrap;
      }
      .code-input {
        width: 148px;
        padding: 7px 10px;
        border-radius: 8px;
        border: 1px solid #1e3350;
        background: #0a1420;
        color: #e6f2ff;
        letter-spacing: 0.24em;
        font-size: 13px;
        font-family: ui-monospace, monospace;
        outline: none;
      }
      .code-input:focus {
        border-color: #38e1e6;
      }
      .code {
        font-family: ui-monospace, monospace;
        letter-spacing: 0.2em;
        color: #a479ff;
        border: 1px solid #a479ff55;
        background: #a479ff14;
        border-radius: 7px;
        padding: 4px 9px;
      }
      .pill {
        font-size: 10px;
        color: #8ba3c0;
        border: 1px solid #1e3350;
        border-radius: 999px;
        padding: 3px 8px;
      }
      .pill.ok {
        color: #46e6a0;
        border-color: #46e6a055;
      }
      .btn {
        border: 1px solid #1e3350;
        background: #0f1d2b;
        color: #d6e6f7;
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
        transition: 0.15s;
      }
      .btn:hover {
        border-color: #2c4a6d;
      }
      .btn.primary {
        border-color: #38e1e666;
        background: #38e1e61a;
        color: #9df3f6;
      }
      .btn.ghost {
        background: transparent;
      }
      .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .work {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .box,
      .side {
        width: 210px;
        border-right: 1px solid #16283b;
        background: #08131f;
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .side {
        width: 240px;
        border-right: none;
        border-left: 1px solid #16283b;
      }
      .box-title {
        font-size: 9.5px;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #8ba3c0;
        margin: 2px 0 0;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 5px;
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 7px 3px;
        border-radius: 7px;
        border: 1px solid #1e3350;
        background: linear-gradient(180deg, #16283b, #0f1d2b);
        color: #9fb6d6;
        font-size: 9px;
        cursor: pointer;
      }
      .tile.active {
        border-color: #38e1e6;
        background: #38e1e614;
        color: #e6f2ff;
      }
      .field {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .input {
        flex: 1;
        width: 100%;
        padding: 6px 8px;
        border-radius: 7px;
        border: 1px solid #1e3350;
        background: #0a1420;
        color: #e6f2ff;
        font-size: 12px;
        outline: none;
      }
      .input:focus {
        border-color: #38e1e655;
      }
      .unit {
        font-family: ui-monospace, monospace;
        color: #8ba3c0;
        font-size: 11px;
      }
      .stats {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      .stats p {
        flex: 1;
        margin: 0;
        text-align: center;
        font-size: 9.5px;
        color: #8ba3c0;
        border: 1px solid #16283b;
        border-radius: 7px;
        padding: 5px 2px;
      }
      .stats span {
        display: block;
        font-size: 15px;
        font-weight: 700;
        color: #e6f2ff;
      }
      .hint {
        font-size: 9.5px;
        line-height: 1.5;
        color: #6d87a6;
        margin: 0;
      }
      .stage {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at 40% 30%, #0d1c2c, #060f19 70%);
        overflow: hidden;
      }
      .grid {
        width: 100%;
        height: 100%;
        cursor: crosshair;
      }
      .remote {
        pointer-events: none;
      }
      .badges {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: flex-end;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 9.5px;
        color: #cfe2f5;
        background: #08131fd9;
        border: 1px solid;
        border-radius: 999px;
        padding: 2px 7px 2px 4px;
      }
      .badge i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
      }
      .people {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .people li {
        display: flex;
        align-items: center;
        gap: 7px;
        border: 1px solid #16283b;
        border-radius: 8px;
        padding: 5px 6px;
      }
      .av {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 8px;
        font-weight: 800;
        color: #04121a;
        flex-shrink: 0;
      }
      .who {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .who b {
        font-size: 10.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .who em {
        font-style: normal;
        font-size: 8.5px;
        color: #6d87a6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .on {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #46e6a0;
        box-shadow: 0 0 6px #46e6a0;
      }
      .on.idle {
        background: #6d87a6;
        box-shadow: none;
      }
      .chat {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1;
        min-height: 80px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .chat li {
        border: 1px solid #16283b;
        border-radius: 8px;
        padding: 5px 7px;
        font-size: 10.5px;
      }
      .chat li b {
        display: block;
        font-size: 8.5px;
        color: #8ba3c0;
        font-weight: 600;
        margin-bottom: 1px;
      }
      .chat li.mine {
        border-color: #38e1e644;
        background: #38e1e60d;
      }
      .chat li.empty,
      li.empty {
        border: 0;
        color: #6d87a6;
        font-size: 10px;
        padding: 2px;
      }
      .compose {
        display: flex;
        gap: 5px;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 16px;
        border-top: 1px solid #16283b;
        font-size: 9.5px;
        color: #6d87a6;
        background: #08131f;
      }
      @media (max-width: 900px) {
        .box,
        .side {
          display: none;
        }
      }
    `,
  ],
})
export class WorkshopApp implements OnInit, OnDestroy {
  readonly rt = inject(RealtimeService);
  readonly version = '20';
  readonly SYMBOL = SYMBOL;
  readonly COLS = COLS;
  readonly ROWS = ROWS;
  readonly GRID = GRID;
  readonly kinds: Placed['kind'][] = ['vsource', 'isource', 'resistor', 'capacitor', 'inductor'];

  readonly tool = signal<Placed['kind']>('resistor');
  readonly placed = signal<Placed[]>([]);
  readonly pending = signal<{ x: number; y: number; cell: string } | null>(null);
  readonly cursors = computed(() => this.rt.interpolated());

  codeInput = '';
  message = '';
  draftValue = SYMBOL.resistor.initial;

  private stageEl: HTMLElement | null = null;

  constructor() {
    // le changement d'outil propose la valeur par défaut de l'outil
    effect(() => {
      const kind = this.tool();
      this.draftValue = SYMBOL[kind].initial;
    });
  }

  ngOnInit(): void {
    const code = new URLSearchParams(location.search).get('code');
    if (code && /^\d{5}$/.test(code)) {
      this.codeInput = code;
      void this.rt.connect(code);
    }
  }

  ngOnDestroy(): void {
    this.rt.disconnect();
  }

  validCode(): boolean {
    return /^\d{5}$/.test(this.codeInput.trim());
  }

  async join(): Promise<void> {
    if (!this.validCode()) return;
    await this.rt.connect(this.codeInput.trim());
    history.replaceState(null, '', `?code=${this.codeInput.trim()}`);
  }

  async create(): Promise<void> {
    const code = await this.rt.createRoom('Atelier Angular');
    this.codeInput = code;
    await this.join();
  }

  leave(): void {
    this.rt.disconnect();
    this.placed.set([]);
    this.pending.set(null);
    history.replaceState(null, '', location.pathname);
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  transform(c: Placed): string {
    const [ax, ay] = c.a.split(',').map(Number);
    const [bx, by] = c.b.split(',').map(Number);
    const mx = ((ax + bx) / 2) * GRID;
    const my = ((ay + by) / 2) * GRID;
    const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    return `translate(${mx} ${my}) rotate(${angle})`;
  }

  private cell(event: PointerEvent | MouseEvent): { col: number; row: number; x: number; y: number } {
    const svg = (event.currentTarget as SVGElement).closest('svg') as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = (COLS * GRID) / rect.width;
    const scaleY = (ROWS * GRID) / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return {
      col: Math.round(x / GRID),
      row: Math.round(y / GRID),
      x: Math.round(x / GRID) * GRID,
      y: Math.round(y / GRID) * GRID,
    };
  }

  onMove(event: PointerEvent): void {
    const p = this.cell(event);
    this.rt.publishCursor(p.col, p.row, this.tool());
  }

  onClick(event: MouseEvent): void {
    const p = this.cell(event);
    const cell = `${p.col},${p.row}`;
    const start = this.pending();
    if (!start) {
      this.pending.set({ x: p.x, y: p.y, cell });
      return;
    }
    if (start.cell === cell) {
      this.pending.set(null);
      return;
    }
    const entry: Placed = {
      id: `c_${Math.random().toString(36).slice(2, 8)}`,
      kind: this.tool(),
      a: start.cell,
      b: cell,
      value: Number(this.draftValue) || SYMBOL[this.tool()].initial,
    };
    this.placed.update((list) => [...list, entry]);
    this.pending.set(null);
    this.rt.publishDoc({ name: 'Atelier Angular', components: this.placed() });
    this.rt.publishActivity(`place ${SYMBOL[entry.kind].label}`);
  }

  send(): void {
    if (!this.message.trim()) return;
    this.rt.sendChat(this.message.trim());
    this.message = '';
  }
}
