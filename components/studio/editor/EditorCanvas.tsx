'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, MousePointer2, Plus, ZoomIn } from 'lucide-react';
import { COMPONENT_META, type CircuitDoc, type Component } from '@/lib/engine/types';
import { GRID } from '@/lib/studio/geometry';
import {
  cellKey,
  commit,
  cancelWire,
  createEditor,
  docBounds,
  finishWire,
  movePart,
  nearestNode,
  nodesOf,
  partAtCell,
  partGeometry,
  placePart,
  removePart,
  select,
  setGround,
  setTerminal,
  setTool,
  startWire,
  type Cell,
  type EditorState,
} from '@/lib/studio/editor';
import { PlacedGlyph } from './PartGlyph';
import { cn } from '@/lib/utils';

export interface EditorCanvasProps {
  state: EditorState;
  setState: (updater: (state: EditorState) => EditorState) => void;
  onNotice?: (message: string, tone?: 'info' | 'ok' | 'warn') => void;
  onTemplate?: (slug: string) => void;
  /** grille alignée sur 24 px : exposé pour les tests visuels */
  className?: string;
}

const DEFAULT_SIZE = { width: 920, height: 560 };
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.6;

interface View {
  zoom: number;
  /** coin supérieur gauche du monde visible, en pixels de grille */
  panX: number;
  panY: number;
}

const KIND_COLOR: Record<string, string> = {
  resistor: '#38e1e6',
  capacitor: '#46e6a0',
  inductor: '#a479ff',
  vsource: '#ffc266',
  isource: '#4f9dff',
  wire: '#8fa3b5',
  switch: '#f2f5f8',
  ammeter: '#ffd166',
  voltmeter: '#9bd3ff',
  lamp: '#ff9f68',
  potentiometer: '#7be5c2',
  vcvs: '#ff8fab',
  vccs: '#c9a0ff',
};

export function EditorCanvas({ state, setState, onNotice, onTemplate, className }: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [view, setView] = useState<View>({ zoom: 1, panX: -GRID * 1.5, panY: -GRID * 1.5 });
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [dragging, setDragging] = useState<{ id: string; moved: boolean } | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{ id: string; start: Cell; applied: Cell; docAtStart: CircuitDoc; moved: boolean } | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const spaceRef = useRef(false);

  /* ---------------- mesures ---------------- */

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------------- conversions ---------------- */

  const toWorld = useCallback(
    (clientX: number, clientY: number): Cell => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: 0, y: 0 };
      return {
        x: view.panX + (clientX - rect.left) / view.zoom,
        y: view.panY + (clientY - rect.top) / view.zoom,
      };
    },
    [view],
  );

  const toCell = useCallback(
    (clientX: number, clientY: number): Cell => {
      const world = toWorld(clientX, clientY);
      return { x: Math.round(world.x / GRID), y: Math.round(world.y / GRID) };
    },
    [toWorld],
  );

  const fit = useCallback(() => {
    const bounds = docBounds(state.doc);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(size.width / bounds.width, size.height / bounds.height) * 0.86),
    );
    setView({
      zoom,
      panX: bounds.minX - (size.width / zoom - bounds.width) / 2,
      panY: bounds.minY - (size.height / zoom - bounds.height) / 2,
    });
  }, [size.height, size.width, state.doc]);

  // zoom initial agréable au premier rendu
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (fittedOnce.current) return;
    fittedOnce.current = true;
    fit();
  }, [fit]);

  /* ---------------- gestes ---------------- */

  const notify = useCallback(
    (message: string, tone: 'info' | 'ok' | 'warn' = 'info') => onNotice?.(message, tone),
    [onNotice],
  );

  const backgroundDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || state.tool.mode === 'pan' || spaceRef.current) {
      panRef.current = { clientX: event.clientX, clientY: event.clientY, panX: view.panX, panY: view.panY };
      setPanning({ x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY });
      (event.target as Element).setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const cell = toCell(event.clientX, event.clientY);

    switch (state.tool.mode) {
      case 'place': {
        const { state: next, component } = placePart(state, state.tool.kind, cell);
        if (!component) return;
        // après la pose, on repasse en sélection : l'utilisateur veut
        // immédiatement pouvoir déplacer ou régler la pièce qu'il vient de
        // poser. Maj enfoncée = poser plusieurs pièces à la suite.
        setState(() => (event.shiftKey ? next : setTool(next, { mode: 'select' })));
        notify(
          event.shiftKey ? `${COMPONENT_META[component.kind].label} posé (Maj : encore).` : `${COMPONENT_META[component.kind].label} posé et sélectionné.`,
          'ok',
        );
        break;
      }
      case 'erase': {
        const part = partAtCell(state.doc, cell, { includeWires: true });
        if (!part) {
          notify('Rien à effacer ici.', 'warn');
          break;
        }
        setState((current) => removePart(current, part.id));
        notify('Supprimé.', 'ok');
        break;
      }
      case 'wire': {
        const node = nearestNode(state.doc, cell, 0) ?? cellKey(cell.x, cell.y);
        const result = finishWire(state, node);
        setState(() => result.state);
        notify(result.message, result.message === 'Fil ajouté.' ? 'ok' : 'info');
        break;
      }
      case 'ground': {
        setState((current) => setGround(current, cellKey(cell.x, cell.y)));
        notify('Masse déplacée.', 'ok');
        break;
      }
      case 'terminal': {
        setState((current) => setTerminal(current, state.tool.mode === 'terminal' ? state.tool.which : 'a', cellKey(cell.x, cell.y)));
        notify('Borne enregistrée.', 'ok');
        break;
      }
      default: {
        setState((current) => select(current, null));
        break;
      }
    }
  };

  const partDown = (event: React.PointerEvent<SVGGElement>, part: Component) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (state.tool.mode === 'erase') {
      setState((current) => removePart(current, part.id));
      notify('Supprimé.', 'ok');
      return;
    }
    if (state.tool.mode === 'wire') {
      const node = nearestNode(state.doc, toCell(event.clientX, event.clientY), 1) ?? part.a;
      const result = finishWire(state, node);
      setState(() => result.state);
      notify(result.message, result.message === 'Fil ajouté.' ? 'ok' : 'info');
      return;
    }
    if (state.tool.mode === 'place') {
      // en mode pose, cliquer sur une pièce existante pose à côté
      const cell = toCell(event.clientX, event.clientY);
      const { state: next } = placePart(state, state.tool.kind, cell);
      setState(() => (event.shiftKey ? next : setTool(next, { mode: 'select' })));
      return;
    }
    if (state.tool.mode === 'ground') {
      const node = part.a;
      setState((current) => setGround(current, node));
      notify('Masse posée sur ' + node + '.', 'ok');
      return;
    }
    if (state.tool.mode === 'terminal') {
      const which = state.tool.which;
      const node = part.a;
      setState((current) => setTerminal(current, which, node));
      notify(`Borne ${which.toUpperCase()} = ${node}.`, 'ok');
      return;
    }

    // sélection + glisser
    setState((current) => select(current, part.id));
    const start = toCell(event.clientX, event.clientY);
    dragRef.current = { id: part.id, start, applied: { x: 0, y: 0 }, docAtStart: state.doc, moved: false };
    setDragging({ id: part.id, moved: false });
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorld(event.clientX, event.clientY);
    setHoverCell({ x: Math.round(world.x / GRID), y: Math.round(world.y / GRID) });

    if (panRef.current) {
      const current = panRef.current;
      setView((previous) => ({
        ...previous,
        panX: current.panX - (event.clientX - current.clientX) / previous.zoom,
        panY: current.panY - (event.clientY - current.clientY) / previous.zoom,
      }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const cell = toCell(event.clientX, event.clientY);
    const delta = { x: cell.x - drag.start.x, y: cell.y - drag.start.y };
    const step = { x: delta.x - drag.applied.x, y: delta.y - drag.applied.y };
    if (step.x === 0 && step.y === 0) return;
    drag.applied = delta;
    if (!drag.moved && (Math.abs(delta.x) > 0 || Math.abs(delta.y) > 0)) {
      drag.moved = true;
      setDragging({ id: drag.id, moved: true });
    }
    setState((current) => movePart(current, drag.id, step, { commit: false }));
  };

  const up = () => {
    if (panRef.current) {
      panRef.current = null;
      setPanning(null);
    }
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      if (drag.moved) {
        setState((current) => commit({ ...current, doc: drag.docAtStart }, current.doc, 'Déplacer'));
        notify('Pièce déplacée.', 'ok');
      }
      setDragging(null);
    }
  };

  const wheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setView((previous) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previous.zoom * factor));
      // on zoome autour du curseur
      const worldX = previous.panX + (event.clientX - rect.left) / previous.zoom;
      const worldY = previous.panY + (event.clientY - rect.top) / previous.zoom;
      return {
        zoom,
        panX: worldX - (event.clientX - rect.left) / zoom,
        panY: worldY - (event.clientY - rect.top) / zoom,
      };
    });
  };

  const dropFromPalette = (event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/x-spark-kind');
    if (!kind) return;
    const cell = toCell(event.clientX, event.clientY);
    const { state: next, component } = placePart(state, kind as Component['kind'], cell);
    if (!component) return;
    setState(() => next);
    notify(`${COMPONENT_META[component.kind].label} posé.`, 'ok');
  };

  /* ---------------- rendu ---------------- */

  const viewWidth = size.width / view.zoom;
  const viewHeight = size.height / view.zoom;
  const degrees = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodesOf(state.doc)) map.set(node, 0);
    for (const part of state.doc.components) {
      map.set(part.a, (map.get(part.a) ?? 0) + 1);
      map.set(part.b, (map.get(part.b) ?? 0) + 1);
      if (part.ctrl?.a) map.set(part.ctrl.a, (map.get(part.ctrl.a) ?? 0) + 1);
      if (part.ctrl?.b) map.set(part.ctrl.b, (map.get(part.ctrl.b) ?? 0) + 1);
    }
    return map;
  }, [state.doc]);

  const ghost = state.tool.mode === 'place' && hoverCell ? state.tool.kind : null;
  const wireFrom = state.wireFrom;
  const wireTarget = state.tool.mode === 'wire' ? hoverCell : null;
  const isEmpty = state.doc.components.length === 0;

  return (
    <div ref={wrapRef} className={cn('relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-line/60 bg-[#04101a]', className)}>
      <svg
        ref={svgRef}
        className={cn('h-full w-full touch-none', panning ? 'cursor-grabbing' : state.tool.mode === 'select' ? 'cursor-default' : 'cursor-crosshair')}
        viewBox={`${view.panX} ${view.panY} ${viewWidth} ${viewHeight}`}
        onPointerDown={backgroundDown}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => {
          setHoverCell(null);
          up();
        }}
        onWheel={wheel}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropFromPalette}
        role="application"
        aria-label="Plan de montage"
        data-testid="editor-canvas"
      >
        <defs>
          <pattern id="spark-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(120,190,210,0.10)" strokeWidth={1} />
          </pattern>
          <pattern id="spark-grid-major" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
            <rect width={GRID * 5} height={GRID * 5} fill="url(#spark-grid)" />
            <path d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`} fill="none" stroke="rgba(120,190,210,0.18)" strokeWidth={1.2} />
          </pattern>
          <radialGradient id="spark-vignette" cx="50%" cy="40%" r="75%">
            <stop offset="60%" stopColor="rgba(4,16,26,0)" />
            <stop offset="100%" stopColor="rgba(2,8,14,0.55)" />
          </radialGradient>
        </defs>

        <rect x={view.panX} y={view.panY} width={viewWidth} height={viewHeight} fill="#04101a" />
        <rect x={view.panX} y={view.panY} width={viewWidth} height={viewHeight} fill="url(#spark-grid-major)" />

        {/* fils d'abord : les dipôles se dessinent par-dessus */}
        {state.doc.components.map((part) => {
          const geometry = partGeometry(part);
          if (!geometry) return null;
          const isSelected = part.id === state.selectedId;
          return (
            <g
              key={part.id}
              onPointerDown={(event) => partDown(event, part)}
              className={state.tool.mode === 'select' ? 'cursor-move' : 'cursor-pointer'}
              data-part-id={part.id}
              data-kind={part.kind}
              data-a={part.a}
              data-b={part.b}
            >
              {part.kind === 'wire' ? (
                <line
                  x1={geometry.aPx.x}
                  y1={geometry.aPx.y}
                  x2={geometry.bPx.x}
                  y2={geometry.bPx.y}
                  stroke={isSelected ? '#ecfeff' : '#7d92a6'}
                  strokeWidth={isSelected ? 3.2 : 2.4}
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <line
                    x1={geometry.aPx.x}
                    y1={geometry.aPx.y}
                    x2={geometry.bPx.x}
                    y2={geometry.bPx.y}
                    stroke="transparent"
                    strokeWidth={18}
                  />
                  <PlacedGlyph
                    kind={part.kind}
                    a={geometry.aPx}
                    b={geometry.bPx}
                    color={KIND_COLOR[part.kind] ?? '#38e1e6'}
                    selected={isSelected}
                    closed={part.closed}
                    ac={Boolean(part.ac) || state.doc.regime === 'ac'}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* étiquettes */}
        {view.zoom > 0.62
          ? state.doc.components
              .filter((part) => part.kind !== 'wire')
              .map((part) => {
                const geometry = partGeometry(part);
                if (!geometry) return null;
                const vertical = geometry.orientation === 'v';
                const x = geometry.centerPx.x + (vertical ? GRID * 0.85 : 0);
                const y = geometry.centerPx.y + (vertical ? 0 : -GRID * 0.75);
                return (
                  <g key={`label-${part.id}`} pointerEvents="none">
                    <text
                      x={x}
                      y={y - 4}
                      textAnchor={vertical ? 'start' : 'middle'}
                      fontSize={10.5}
                      fontWeight={600}
                      fill="#c9dbe6"
                    >
                      {part.label ?? COMPONENT_META[part.kind].symbol}
                    </text>
                    <text
                      x={x}
                      y={y + 7}
                      textAnchor={vertical ? 'start' : 'middle'}
                      fontSize={9.5}
                      fill="rgba(201,219,230,0.62)"
                    >
                      {formatValue(part.value, COMPONENT_META[part.kind].unit)}
                    </text>
                  </g>
                );
              })
          : null}

        {/* nœuds et points de connexion */}
        {[...degrees.entries()].map(([node, degree]) => {
          const point = parse(node);
          if (!point) return null;
          const isGround = node === state.doc.ground;
          const isTerminalA = node === state.doc.terminals.a;
          const isTerminalB = node === state.doc.terminals.b;
          const isWireStart = node === wireFrom;
          const show = degree >= 2 || isGround || isTerminalA || isTerminalB || isWireStart || state.tool.mode === 'wire';
          if (!show) return null;
          return (
            <g key={`node-${node}`} pointerEvents="none">
              <circle
                cx={point.x * GRID}
                cy={point.y * GRID}
                r={degree >= 3 ? 3.4 : 2.6}
                fill={isWireStart ? '#ffc266' : isGround ? '#46e6a0' : '#9fc4d6'}
                opacity={0.9}
              />
            </g>
          );
        })}

        {/* masse */}
        {state.doc.ground ? <GroundSymbol node={state.doc.ground} /> : null}

        {/* bornes A et B */}
        {(['a', 'b'] as const).map((which) => {
          const node = state.doc.terminals[which];
          if (!node) return null;
          const point = parse(node);
          if (!point) return null;
          return (
            <g key={`term-${which}`} pointerEvents="none">
              <circle cx={point.x * GRID} cy={point.y * GRID} r={7.5} fill="none" stroke="#ffc266" strokeWidth={1.6} strokeDasharray="3 3" />
              <text x={point.x * GRID} y={point.y * GRID - 12} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffc266">
                {which.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* aperçu de la pièce à poser */}
        {ghost && hoverCell ? (
          <g pointerEvents="none" opacity={0.55}>
            <circle cx={hoverCell.x * GRID} cy={hoverCell.y * GRID} r={GRID * 0.35} fill="rgba(56,225,230,0.18)" />
            <PlacedGlyph
              kind={ghost}
              a={{ x: hoverCell.x * GRID, y: hoverCell.y * GRID }}
              b={{ x: (hoverCell.x + 2) * GRID, y: hoverCell.y * GRID }}
              color="#38e1e6"
              selected
            />
          </g>
        ) : null}

        {/* aperçu du fil en cours */}
        {wireFrom && wireTarget
          ? (() => {
              const from = parse(wireFrom);
              if (!from) return null;
              const x1 = from.x * GRID;
              const y1 = from.y * GRID;
              const x2 = wireTarget.x * GRID;
              const y2 = wireTarget.y * GRID;
              return (
                <g pointerEvents="none">
                  <path
                    d={`M${x1},${y1} L${x2},${y1} L${x2},${y2}`}
                    fill="none"
                    stroke="#ffc266"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  <circle cx={x2} cy={y2} r={4} fill="#ffc266" />
                </g>
              );
            })()
          : null}

        {/* cadre de sélection */}
        {state.selectedId
          ? (() => {
              const part = state.doc.components.find((item) => item.id === state.selectedId);
              const geometry = part ? partGeometry(part) : null;
              if (!geometry) return null;
              const pad = 12;
              const minX = Math.min(geometry.aPx.x, geometry.bPx.x) - pad;
              const minY = Math.min(geometry.aPx.y, geometry.bPx.y) - pad;
              const width = Math.abs(geometry.bPx.x - geometry.aPx.x) + pad * 2;
              const height = Math.abs(geometry.bPx.y - geometry.aPx.y) + pad * 2;
              return (
                <rect
                  x={minX}
                  y={minY}
                  width={width}
                  height={height}
                  rx={6}
                  fill="none"
                  stroke="rgba(236,254,255,0.5)"
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              );
            })()
          : null}

        <rect x={view.panX} y={view.panY} width={viewWidth} height={viewHeight} fill="url(#spark-vignette)" pointerEvents="none" />
      </svg>

      {/* bandeau d'état */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 text-[10.5px]">
        <span className="rounded-md border border-line/60 bg-ink-950/80 px-2 py-1 font-medium text-fg-soft backdrop-blur">
          {toolLabel(state)}
        </span>
        <span className="w-fit rounded-md border border-line/50 bg-ink-950/60 px-2 py-0.5 font-mono text-[9.5px] text-fg-mute backdrop-blur">
          {hoverCell ? `x ${hoverCell.x} · y ${hoverCell.y}` : 'survolez le plan'} · zoom {Math.round(view.zoom * 100)} %
        </span>
      </div>

      {/* commandes de vue */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-line/60 bg-ink-950/85 p-1 backdrop-blur">
        <IconButton label="Dézoomer" onClick={() => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom * 0.85) }))}>
          <Minus size={13} />
        </IconButton>
        <span className="w-10 text-center font-mono text-[9.5px] text-fg-mute">{Math.round(view.zoom * 100)}%</span>
        <IconButton label="Zoomer" onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.18) }))}>
          <Plus size={13} />
        </IconButton>
        <IconButton label="Ajuster au montage" onClick={fit}>
          <Maximize2 size={13} />
        </IconButton>
        <IconButton label="Centrer sur l’origine" onClick={() => setView({ zoom: 1, panX: -GRID * 1.5, panY: -GRID * 1.5 })}>
          <Crosshair size={13} />
        </IconButton>
      </div>

      {/* écran vide : on n'abandonne jamais l'utilisateur */}
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-[380px] rounded-2xl border border-spark-cyan/30 bg-ink-950/90 p-4 text-center shadow-2xl backdrop-blur">
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold">
              <MousePointer2 size={14} className="text-spark-cyan" /> Plan vide — à vous de jouer
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-soft">
              1. Choisissez un dipôle dans la palette (ou tapez <kbd className="kbd">R</kbd>).
              <br />
              2. Cliquez sur le plan pour le poser.
              <br />
              3. Reliez les bornes avec l’outil <kbd className="kbd">W</kbd>, puis calculez.
            </p>
            {onTemplate ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <button type="button" onClick={() => onTemplate('thevenin-serie')} className="btn btn-sm border-line/60">
                  Partir d’un exemple
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = placePart(state, 'vsource', { x: 3, y: 4 });
                    setState(() => next.state);
                    notify('Source posée : continuez avec R et W.', 'ok');
                  }}
                  className="btn btn-primary btn-sm"
                >
                  <ZoomIn size={12} /> Poser une source
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toolLabel(state: EditorState): string {
  switch (state.tool.mode) {
    case 'place':
      return `Pose : ${COMPONENT_META[state.tool.kind].label} — cliquez sur le plan`;
    case 'wire':
      return state.wireFrom ? `Fil depuis ${state.wireFrom} — cliquez la seconde borne` : 'Fil — cliquez une première borne';
    case 'erase':
      return 'Gomme — cliquez une pièce';
    case 'ground':
      return 'Masse — cliquez un nœud';
    case 'terminal':
      return `Borne ${state.tool.which.toUpperCase()} — cliquez un nœud`;
    case 'pan':
      return 'Déplacement de la vue — glissez';
    default:
      return 'Sélection — cliquez, glissez pour déplacer, T pour pivoter';
  }
}

function GroundSymbol({ node }: { node: string }) {
  const point = parse(node);
  if (!point) return null;
  const x = point.x * GRID;
  const y = point.y * GRID;
  return (
    <g pointerEvents="none" stroke="#46e6a0" strokeWidth={2} strokeLinecap="round">
      <line x1={x} y1={y} x2={x} y2={y + 9} />
      <line x1={x - 9} y1={y + 9} x2={x + 9} y2={y + 9} />
      <line x1={x - 6} y1={y + 13} x2={x + 6} y2={y + 13} />
      <line x1={x - 3} y1={y + 17} x2={x + 3} y2={y + 17} />
    </g>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-fg-soft transition hover:bg-ink-800 hover:text-fg"
    >
      {children}
    </button>
  );
}

function parse(node: string): Cell | null {
  const [x, y] = node.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function formatValue(value: number, unit: string): string {
  if (!unit) return '';
  const abs = Math.abs(value);
  if (abs === 0) return `0 ${unit}`;
  if (abs >= 1e6) return `${round(value / 1e6)} M${unit}`;
  if (abs >= 1e3) return `${round(value / 1e3)} k${unit}`;
  if (abs >= 1) return `${round(value)} ${unit}`;
  if (abs >= 1e-3) return `${round(value * 1e3)} m${unit}`;
  if (abs >= 1e-6) return `${round(value * 1e6)} µ${unit}`;
  if (abs >= 1e-9) return `${round(value * 1e9)} n${unit}`;
  return `${round(value * 1e12)} p${unit}`;
}

function round(value: number): string {
  return Number(value.toPrecision(3)).toString().replace('.', ',');
}

/** Réexport utilitaire pour les tests et la coquille. */
export { createEditor, cellKey, cancelWire, startWire };
