'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircuitDoc, Component, COMPONENT_META, ComponentKind } from '@/lib/engine/types';
import { CircuitDoc as Doc } from '@/lib/engine/types';
import {
  GRID,
  cellToPoint,
  circuitBounds,
  orderedEnds,
  orientationOf,
  pointToCell,
  } from '@/lib/studio/geometry';
import { addComponent, moveComponent, removeComponent } from '@/lib/studio/doc';
import { SymbolDefs, SymbolGlyph, KIND_COLORS } from './Symbols';
import { NormSymbol, NormSymbolDefs } from './symbols/NormSymbol';
import { ElectronFlow, WireGlow } from './ElectronFlow';
import type { Reading } from '@/lib/engine/solver';
import { cn } from '@/lib/utils';
import { CursorOverlay, PresencePills } from './cursors/CursorOverlay';
import type { LiveCursor, LiveParticipant } from '@/hooks/useCollaboration';

export type Tool =
  | { mode: 'select' }
  | { mode: 'place'; kind: ComponentKind }
  | { mode: 'terminal'; which: 'a' | 'b' }
  | { mode: 'ground' }
  | { mode: 'erase' };

interface Props {
  doc: CircuitDoc;
  onChange: (doc: CircuitDoc, options?: { commit?: boolean }) => void;
  tool: Tool;
  onToolDone?: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  readings?: Record<string, Reading>;
  showFlow: boolean;
  flowSpeed: number;
  showGrid: boolean;
  className?: string;
  /** collaboration temps réel */
  collaborators?: LiveCursor[];
  participants?: LiveParticipant[];
  localId?: string;
  onCursorMove?: (payload: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    vw: number;
    vh: number;
    hover: string | null;
    tool: string;
  }) => void;
  showPresencePills?: boolean;
  /** valeur à appliquer au prochain dipôle posé (saisie dans le panneau Valeurs) */
  nextValue?: number;
}

const MIN_VIEW = { w: 700, h: 430 };

export function CircuitCanvas({
  doc,
  onChange,
  tool,
  onToolDone,
  selectedId,
  onSelect,
  readings,
  showFlow,
  flowSpeed,
  showGrid,
  className,
  collaborators = [],
  participants = [],
  localId = '',
  onCursorMove,
  showPresencePills = false,
  nextValue,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ x: -40, y: -40, w: 700, h: 430 });
  const [hover, setHover] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  /**
   * Placement « en deux clics » : le premier clic pose l'ancre, le second le
   * dipôle. C'est ce que l'interface annonce (« cliquez deux nœuds ») — le
   * glisser reste possible pour aller plus vite.
   */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    start: { x: number; y: number };
    originCell?: string;
    moved: boolean;
  } | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number; view: typeof view } | null>(null);
  const [size, setSize] = useState({ w: 700, h: 430 });
  const onChangeRef = useRef(onChange);
  const dragRef = useRef<{
    id: string;
    start: { x: number; y: number };
    originCell?: string;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  /* -------------------------------------------------- géométrie du viewport */
  const toSvg = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const toCell = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const p = toSvg(event);
      return pointToCell(p.x / GRID, p.y / GRID);
    },
    [toSvg],
  );

  const fit = useCallback(() => {
    const bounds = circuitBounds(doc.components);
    const w = Math.max((bounds.maxX - bounds.minX) * GRID, MIN_VIEW.w);
    const h = Math.max((bounds.maxY - bounds.minY) * GRID, MIN_VIEW.h);
    setView({ x: bounds.minX * GRID, y: bounds.minY * GRID, w, h });
  }, [doc.components]);

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(() => circuitBounds(doc.components), [doc.components]);
  const vb = useMemo(() => {
    const width = Math.max((bounds.maxX - bounds.minX) * GRID, MIN_VIEW.w) * 0.72;
    const height = Math.max((bounds.maxY - bounds.minY) * GRID, MIN_VIEW.h) * 0.72;
    const cx = ((bounds.minX + bounds.maxX) / 2) * GRID;
    const cy = ((bounds.minY + bounds.maxY) / 2) * GRID;
    return `${cx - width / 2 + 20} ${cy - height / 2 + 20} ${width} ${height}`;
  }, [bounds]);

  /* ------------------------------------------------------------ interactions */
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      event.preventDefault();
      setPanning({ x: event.clientX, y: event.clientY, view });
      return;
    }
    if (event.button !== 0) return;
    const cell = toCell(event);
    (event.target as Element).releasePointerCapture?.(event.pointerId);

    if (tool.mode === 'place') {
      setDraft({ from: cell, to: cell });
      return;
    }
    if (tool.mode === 'terminal') {
      onChange(
        {
          ...doc,
          terminals: { ...doc.terminals, [tool.which]: cell },
        },
        { commit: true },
      );
      onToolDone?.();
      return;
    }
    if (tool.mode === 'ground') {
      onChange({ ...doc, ground: cell }, { commit: true });
      onToolDone?.();
      return;
    }
    if (tool.mode === 'select') {
      onSelect(null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const cell = toCell(event);
    setHover(cell);
    if (panning) {
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      const scale = ctm ? 1 / ctm.a : 1;
      const dx = (event.clientX - panning.x) * scale;
      const dy = (event.clientY - panning.y) * scale;
      setView({ ...panning.view, x: panning.view.x - dx, y: panning.view.y - dy });
      return;
    }
    if (draft) {
      setDraft({ ...draft, to: cell });
      return;
    }
    if (drag) {
      const dx = Math.abs(event.clientX - drag.start.x);
      const dy = Math.abs(event.clientY - drag.start.y);
      if (!drag.moved && (dx > 3 || dy > 3)) {
        setDrag({ ...drag, moved: true });
      }
      if (drag.moved) {
        const point = toSvg(event);
        const targetCell = pointToCell(point.x / GRID, point.y / GRID);
        const origin = cellToPoint(drag.originCell ?? '');
        const target = cellToPoint(targetCell);
        if (origin && target) {
          const dx = target.x - origin.x;
          const dy = target.y - origin.y;
          if (dx !== 0 || dy !== 0) {
            const moved = moveComponent(doc, drag.id, dx, dy);
            onChangeRef.current(moved, { commit: false });
            dragRef.current = { ...drag, originCell: targetCell, start: { x: event.clientX, y: event.clientY } };
          }
        }
        return;
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panning) {
      setPanning(null);
      return;
    }
    if (draft) {
      const from = cellToPoint(draft.from);
      const to = cellToPoint(draft.to);
      if (tool.mode === 'place') {
        // --- glisser : du premier au dernier point, on aligne sur l'axe dominant
        if (from && to && (from.x !== to.x || from.y !== to.y)) {
          const horizontal = Math.abs(to.y - from.y) <= Math.abs(to.x - from.x);
          const end = horizontal ? pointToCell(to.x, from.y) : pointToCell(from.x, to.y);
          if (end !== draft.from) {
            const result = addComponent(doc, tool.kind, draft.from, end, nextValue ? { value: nextValue } : {});
            onChange(result.doc, { commit: true });
            onSelect(result.component.id);
            setAnchor(null);
            setDraft(null);
            onToolDone?.();
            return;
          }
        }

        // --- clic simple : premier clic = ancre, second clic = dipôle
        const cell = draft.from;
        if (!anchor) {
          setAnchor(cell);
          setDraft(null);
          return;
        }
        if (anchor !== cell) {
          // on aligne le second point sur l'axe dominant pour rester sur la grille
          const a = cellToPoint(anchor);
          const b = cellToPoint(cell);
          if (a && b) {
            const horizontal = Math.abs(b.y - a.y) <= Math.abs(b.x - a.x);
            const end = horizontal ? pointToCell(b.x, a.y) : pointToCell(a.x, b.y);
            if (end !== anchor) {
              const result = addComponent(doc, tool.kind, anchor, end, nextValue ? { value: nextValue } : {});
              onChange(result.doc, { commit: true });
              onSelect(result.component.id);
            }
          }
          setAnchor(null);
          setDraft(null);
          onToolDone?.();
          return;
        }
        // second clic sur la même cellule : on annule l'ancre
        setAnchor(null);
        setDraft(null);
        return;
      }
      setDraft(null);
      onToolDone?.();
      return;
    }
    if (drag) {
      const current = dragRef.current ?? drag;
      if (!current.moved) {
        const cell = toCell(event);
        const point = cellToPoint(cell);
        if (point) {
          const target = doc.components.find((c) => {
            const [a, b] = orderedEnds(c);
            return (
              (a.x === b.x && Math.abs(point.x - a.x) <= 0 && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)) ||
              (a.y === b.y && Math.abs(point.y - a.y) <= 0 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x))
            );
          });
          onSelect(target?.id ?? null);
        }
      }
      setDrag(null);
    }
  };

  const handleComponentPointerDown = (
    event: React.PointerEvent<SVGGElement>,
    component: Component,
  ) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (tool.mode === 'erase') {
      onChange(removeComponent(doc, component.id), { commit: true });
      return;
    }
    if (tool.mode !== 'select') return;
    onSelect(component.id);
    setDrag({
      id: component.id,
      start: { x: event.clientX, y: event.clientY },
      originCell: component.a,
      moved: false,
    });
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const scale = 1 / ctm.a;
    const p = toSvg(event);
    const factor = event.deltaY > 0 ? 1.12 : 0.89;
    const nextW = Math.min(Math.max(view.w * factor, 260), 4200);
    const nextH = Math.min(Math.max(view.h * factor, 200), 3200);
    const ratioX = (p.x - view.x) / view.w;
    const ratioY = (p.y - view.y) / view.h;
    setView({
      x: p.x - nextW * ratioX,
      y: p.y - nextH * ratioY,
      w: nextW,
      h: nextH,
    });
    void scale;
  };

  /* -------------------------------------------------------------- raccourcis */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        onChange(removeComponent(doc, selectedId), { commit: true });
        onSelect(null);
      }
      if (event.key === 'Escape') {
        setDraft(null);
        onSelect(null);
      }
      if (event.key.toLowerCase() === 'f') fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, selectedId, onChange, onSelect, fit]);

  /* ------------------------------------------------------------------ rendu */
  const nodePoints = useMemo(() => {
    const map = new Map<string, { x: number; y: number; count: number }>();
    for (const c of doc.components) {
      for (const cell of [c.a, c.b]) {
        const p = cellToPoint(cell);
        if (!p) continue;
        const key = pointToCell(p.x, p.y);
        const entry = map.get(key) ?? { x: p.x * GRID, y: p.y * GRID, count: 0 };
        entry.count += 1;
        map.set(key, entry);
      }
      if (c.ctrl) {
        for (const cell of [c.ctrl.a, c.ctrl.b]) {
          const p = cellToPoint(cell);
          if (!p) continue;
          const key = pointToCell(p.x, p.y);
          const entry = map.get(key) ?? { x: p.x * GRID, y: p.y * GRID, count: 0 };
          map.set(key, entry);
        }
      }
    }
    return map;
  }, [doc.components]);

  const groundPoint = cellToPoint(doc.ground);
  const terminalA = cellToPoint(doc.terminals.a ?? '');
  const terminalB = cellToPoint(doc.terminals.b ?? '');

  const hoverPoint = hover ? cellToPoint(hover) : null;

  /* ------------------------------------------- présence : position du curseur */
  const [localPointer, setLocalPointer] = useState<{ x: number; y: number } | null>(null);
  const pointingRef = useRef(false);

  // conversions grille → pixels écran (les curseurs distants sont en coordonnées de grille)
  const gridToPixel = useCallback(
    (cell: { x: number; y: number }) => {
      const svg = svgRef.current;
      if (!svg) return { x: -9999, y: -9999 };
      const ctm = svg.getScreenCTM();
      const box = wrapRef.current?.getBoundingClientRect();
      if (!ctm || !box) return { x: -9999, y: -9999 };
      const px = ctm.a * cell.x * GRID + ctm.e - box.left;
      const py = ctm.d * cell.y * GRID + ctm.f - box.top;
      return { x: px, y: py };
    },
    [],
  );

  const publishPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>, over?: string | null) => {
      if (!onCursorMove) return;
      const local = toSvg(event);
      const vx = view.x / GRID;
      const vy = view.y / GRID;
      const vw = view.w / GRID;
      const vh = view.h / GRID;
      onCursorMove({
        x: local.x / GRID,
        y: local.y / GRID,
        vx,
        vy,
        vw,
        vh,
        hover: over ?? null,
        tool: tool.mode,
      });
    },
    [onCursorMove, toSvg, view, tool.mode],
  );

  const handlePointerMoveWithPresence = (event: React.PointerEvent<SVGSVGElement>) => {
    handlePointerMove(event);
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) {
      setLocalPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
      if (!pointingRef.current) {
        pointingRef.current = true;
      }
    }
    publishPointer(event, hover);
  };

  const draftRect = useMemo(() => {
    if (!draft) return null;
    const from = cellToPoint(draft.from);
    const to = cellToPoint(draft.to);
    if (!from || !to) return null;
    const horizontal = Math.abs(to.y - from.y) <= Math.abs(to.x - from.x);
    const end = horizontal ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    return {
      x: Math.min(from.x, end.x) * GRID,
      y: Math.min(from.y, end.y) * GRID,
      w: Math.max(Math.abs(end.x - from.x), 0.4) * GRID,
      h: Math.max(Math.abs(end.y - from.y), 0.4) * GRID,
    };
  }, [draft]);

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full overflow-hidden rounded-2xl', className)}>
      <svg
        ref={svgRef}
        viewBox={vb}
        className={cn(
          'h-full w-full touch-none select-none',
          tool.mode === 'select' ? 'cursor-default' : 'cursor-crosshair',
          panning && 'cursor-grabbing',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveWithPresence}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setHover(null);
          setPanning(null);
          setLocalPointer(null);
          pointingRef.current = false;
          onCursorMove?.({
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            vw: 0,
            vh: 0,
            hover: null,
            tool: 'idle',
          });
        }}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <SymbolDefs />
        <NormSymbolDefs />
        <defs>
          <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgb(var(--grid-color) / 0.11)" strokeWidth="1" />
          </pattern>
          <pattern id="grid-lg" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
            <rect width={GRID * 4} height={GRID * 4} fill="url(#grid)" />
            <path
              d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`}
              fill="none"
              stroke="rgb(var(--grid-color) / 0.16)"
              strokeWidth="1.2"
            />
          </pattern>
        </defs>

        {showGrid ? <rect x={view.x - 4000} y={view.y - 4000} width={12000} height={12000} fill="url(#grid-lg)" /> : null}

        {/* --------------------------- fils & composants --------------------------- */}
        {doc.components.map((c) => {
          const [a, b] = orderedEnds(c);
          const p1 = { x: a.x * GRID, y: a.y * GRID };
          const p2 = { x: b.x * GRID, y: b.y * GRID };
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
          const reading = readings?.[c.id];
          const current = reading && Number.isFinite(reading.i.re) ? reading.i.re : null;
          const selected = c.id === selectedId;
          const color = selected ? '#ecfeff' : KIND_COLORS[c.kind];
          const intensity = current ? Math.min(Math.abs(current) / 0.05, 1) : 0;
          const scale = length / 100;
          const labelVertical = orientationOf(c) === 'v';

          return (
            <g key={c.id}>
              <WireGlow from={p1} to={p2} intensity={showFlow ? intensity : 0} color={color} />
              <g
                transform={`translate(${mid.x} ${mid.y}) rotate(${angle}) scale(${scale} ${scale})`}
                onPointerDown={(event) => handleComponentPointerDown(event, c)}
                className={tool.mode === 'erase' ? 'cursor-not-allowed' : 'cursor-pointer'}
                style={{ pointerEvents: 'all' }}
              >
                <rect x={-50} y={-22} width={100} height={44} fill="transparent" />
                <NormSymbol kind={c.kind} color={color} closed={c.closed} glow={selected ? 1 : 0} />
              </g>

              {showFlow ? (
                <ElectronFlow
                  from={p1}
                  to={p2}
                  current={current}
                  enabled={showFlow}
                  speed={flowSpeed}
                  color={c.kind === 'isource' ? '#4f9dff' : '#e9fbff'}
                  count={Math.max(2, Math.round(length / 46))}
                  wireId={c.id}
                />
              ) : null}

              {length > 26 ? (
                <text
                  x={mid.x + (labelVertical ? 14 : 0)}
                  y={mid.y + (labelVertical ? 0 : -14)}
                  textAnchor={labelVertical ? 'start' : 'middle'}
                  dominantBaseline={labelVertical ? 'middle' : 'auto'}
                  fontSize={11}
                  fontFamily="JetBrains Mono Variable, monospace"
                  fill="rgb(var(--fg-soft))"
                  opacity={selected ? 1 : 0.82}
                  pointerEvents="none"
                >
                  {c.label ?? c.id}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* --------------------------------- nœuds --------------------------------- */}
        {[...nodePoints.entries()].map(([key, p]) => (
          <circle
            key={`node-${key}`}
            cx={p.x}
            cy={p.y}
            r={2.6}
            fill="rgb(var(--fg-mute) / 0.85)"
            filter="url(#node-glow)"
          />
        ))}

        {/* -------------------------------- masse ---------------------------------- */}
        {groundPoint ? (
          <g transform={`translate(${groundPoint.x * GRID} ${groundPoint.y * GRID})`} pointerEvents="none">
            <line x1={0} y1={0} x2={0} y2={8} stroke="#8fa6c4" strokeWidth={2} />
            <line x1={-9} y1={8} x2={9} y2={8} stroke="#8fa6c4" strokeWidth={2.2} strokeLinecap="round" />
            <line x1={-6} y1={13} x2={6} y2={13} stroke="#8fa6c4" strokeWidth={2} strokeLinecap="round" />
            <line x1={-3} y1={18} x2={3} y2={18} stroke="#8fa6c4" strokeWidth={1.8} strokeLinecap="round" />
          </g>
        ) : null}

        {/* ------------------------------- bornes A/B ------------------------------- */}
        {(
          [
            { p: terminalA, label: 'A', color: '#38e1e6' },
            { p: terminalB, label: 'B', color: '#a479ff' },
          ] as const
        ).map(({ p, label, color }) =>
          p ? (
            <g key={label} transform={`translate(${p.x * GRID} ${p.y * GRID})`} pointerEvents="none">
              <circle r={11} fill="none" stroke={color} strokeWidth={1.6} opacity={0.45} />
              <circle r={4.2} fill={color} opacity={0.95} />
              <text
                x={0}
                y={-18}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={color}
                fontFamily="JetBrains Mono Variable, monospace"
              >
                {label}
              </text>
            </g>
          ) : null,
        )}

        {/* --------------------------- prévisualisation ----------------------------- */}
        {draftRect ? (
          <g pointerEvents="none">
            <rect
              x={draftRect.x}
              y={draftRect.y}
              width={draftRect.w}
              height={draftRect.h}
              rx={6}
              fill="rgba(56,225,230,.10)"
              stroke="#38e1e6"
              strokeDasharray="5 4"
              strokeWidth={1.4}
            />
            {tool.mode === 'place' ? (
              <g
                transform={`translate(${draftRect.x + draftRect.w / 2} ${draftRect.y + draftRect.h / 2}) scale(${
                  Math.max(draftRect.w, draftRect.h) / 100
                })`}
              >
                <NormSymbol kind={tool.kind} color={KIND_COLORS[tool.kind]} />
              </g>
            ) : null}
          </g>
        ) : null}

        {/* --------------------- ancre du placement en deux clics ---------------- */}
        {anchor && tool.mode === 'place' ? (() => {
          const a = cellToPoint(anchor);
          if (!a) return null;
          const ax = a.x * GRID;
          const ay = a.y * GRID;
          const hx = hoverPoint ? hoverPoint.x * GRID : null;
          const hy = hoverPoint ? hoverPoint.y * GRID : null;
          return (
            <g pointerEvents="none">
              <circle cx={ax} cy={ay} r={9} fill="none" stroke="#38e1e6" strokeWidth={2} />
              <circle cx={ax} cy={ay} r={3.4} fill="#38e1e6" />
              {hx !== null && hy !== null ? (
                <>
                  <line
                    x1={ax}
                    y1={ay}
                    x2={hx}
                    y2={hy}
                    stroke="#38e1e6"
                    strokeWidth={1.6}
                    strokeDasharray="6 5"
                    opacity={0.8}
                  />
                  <g
                    transform={`translate(${(ax + hx) / 2} ${(ay + hy) / 2}) rotate(${
                      (Math.atan2(hy - ay, hx - ax) * 180) / Math.PI
                    }) scale(${Math.max(Math.hypot(hx - ax, hy - ay), 60) / 100})`}
                    opacity={0.55}
                  >
                    <NormSymbol kind={tool.kind} color={KIND_COLORS[tool.kind]} />
                  </g>
                </>
              ) : null}
            </g>
          );
        })() : null}

        {hoverPoint && tool.mode !== 'select' ? (
          <g pointerEvents="none">
            <circle
              cx={hoverPoint.x * GRID}
              cy={hoverPoint.y * GRID}
              r={5}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={1.4}
              opacity={0.75}
            />
            <line
              x1={hoverPoint.x * GRID - 10}
              y1={hoverPoint.y * GRID}
              x2={hoverPoint.x * GRID + 10}
              y2={hoverPoint.y * GRID}
              stroke="rgb(var(--accent))"
              strokeWidth={0.9}
              opacity={0.5}
            />
            <line
              x1={hoverPoint.x * GRID}
              y1={hoverPoint.y * GRID - 10}
              x2={hoverPoint.x * GRID}
              y2={hoverPoint.y * GRID + 10}
              stroke="rgb(var(--accent))"
              strokeWidth={0.9}
              opacity={0.5}
            />
          </g>
        ) : null}
      </svg>

      {/* --------------------------- curseurs des collaborateurs --------------------------- */}
      <CursorOverlay
        cursors={collaborators}
        toPx={gridToPixel}
        localCursor={onCursorMove ? localPointer : null}
      />

      {/* --------------------------- légende / aides --------------------------- */}
      {showPresencePills ? (
        <div className="pointer-events-auto absolute right-12 top-3 z-20">
          <PresencePills cursors={collaborators} participants={participants} localId={localId} />
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
        <span className="chip bg-ink-950/80 backdrop-blur">molette : zoom</span>
        <span className="chip bg-ink-950/80 backdrop-blur">alt + glisser : déplacer</span>
        <span className="chip bg-ink-950/80 backdrop-blur">suppr : effacer</span>
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, w: v.w * 0.85, h: v.h * 0.85 }))}
          className="h-7 w-7 rounded-md border border-line/70 bg-ink-900/90 text-sm leading-none text-fg-soft backdrop-blur transition hover:text-fg"
          title="Zoom avant"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, w: v.w * 1.18, h: v.h * 1.18 }))}
          className="h-7 w-7 rounded-md border border-line/70 bg-ink-900/90 text-sm leading-none text-fg-soft backdrop-blur transition hover:text-fg"
          title="Zoom arrière"
        >
          −
        </button>
        <button
          type="button"
          onClick={fit}
          className="h-7 w-7 rounded-md border border-line/70 bg-ink-900/90 text-[10px] font-semibold text-fg-soft backdrop-blur transition hover:text-fg"
          title="Ajuster la vue"
        >
          ⤢
        </button>
      </div>

      {!doc.components.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-xs rounded-2xl border border-dashed border-line/70 bg-ink-950/60 px-5 py-4 text-center backdrop-blur">
            <p className="text-sm font-medium text-fg">Grille vide</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-mute">
              Choisissez un dipôle dans la palette de gauche, puis <strong className="text-fg-soft">cliquez deux nœuds</strong> de la
              grille : le premier fixe le départ, le second termine le tracé. Ajoutez ensuite la masse et les bornes A / B.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Miniature statique réutilisable (bibliothèque, historique, export) */
export function CircuitThumbnail({
  doc,
  width = 320,
  height = 180,
  animated = false,
  className,
}: {
  doc: Doc;
  width?: number;
  height?: number;
  animated?: boolean;
  className?: string;
}) {
  const bounds = useMemo(() => circuitBounds(doc.components), [doc.components]);
  const vb = `${bounds.minX * GRID} ${bounds.minY * GRID} ${(bounds.maxX - bounds.minX) * GRID} ${
    (bounds.maxY - bounds.minY) * GRID
  }`;

  return (
    <svg
      viewBox={vb}
      width={width}
      height={height}
      className={cn('h-full w-full', className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <SymbolDefs />
      {doc.components.map((c) => {
        const [a, b] = orderedEnds(c);
        const p1 = { x: a.x * GRID, y: a.y * GRID };
        const p2 = { x: b.x * GRID, y: b.y * GRID };
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
        return (
          <g key={c.id} transform={`translate(${mid.x} ${mid.y}) rotate(${angle}) scale(${length / 100})`}>
            <NormSymbol kind={c.kind} color={KIND_COLORS[c.kind] ?? '#8fa6c4'} />
          </g>
        );
      })}
      {(() => {
        const cell = doc.terminals.a ?? doc.ground;
        const p = cell ? cellToPoint(cell) : null;
        const q = doc.terminals.b ? cellToPoint(doc.terminals.b) : null;
        return (
          <>
            {p ? <circle cx={p.x * GRID} cy={p.y * GRID} r={4} fill="#38e1e6" /> : null}
            {q ? <circle cx={q.x * GRID} cy={q.y * GRID} r={4} fill="#a479ff" /> : null}
            {animated ? null : null}
          </>
        );
      })()}
    </svg>
  );
}

/** Résumé textuel utilisé par l'export SVG/PNG autonome */
export const describeComponent = (c: Component) =>
  `${c.label ?? c.id} (${COMPONENT_META[c.kind].label}) entre ${c.a} et ${c.b} — ${c.value} ${COMPONENT_META[c.kind].unit}`;

export type { CircuitDoc };
export type { Reading };
