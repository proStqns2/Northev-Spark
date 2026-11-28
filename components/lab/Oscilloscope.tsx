'use client';

import { useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AxisLabels, Cursor, Curve, Grid, PlotFrame, type Point } from './charts';

/**
 * Oscilloscope virtuel.
 *
 * Trois signaux au choix (échelon RC, sinusoïde, redressement simple
 * alternance), réglages de base de temps et de sensibilité, curseur de temps.
 * Le calcul est fait ici, en physique réelle : le dessin correspond aux
 * équations du cours, pas à une animation décorative.
 */

type Signal = 'step' | 'sine' | 'rectified';

const SIGNAL_LABEL: Record<Signal, string> = {
  step: 'Échelon RC (charge)',
  sine: 'Sinusoïde',
  rectified: 'Redressé simple alternance',
};

export function Oscilloscope() {
  const [signal, setSignal] = useState<Signal>('step');
  const [tauMs, setTauMs] = useState(1.2);
  const [periodMs, setPeriodMs] = useState(4);
  const [amplitude, setAmplitude] = useState(5);
  const [windowMs, setWindowMs] = useState(10);
  const [cursorMs, setCursorMs] = useState(2);
  const [running, setRunning] = useState(true);
  const [offsetMs, setOffsetMs] = useState(0);

  const samples = useMemo(() => {
    const total = 240;
    const list: Point[] = [];
    const shift = running ? offsetMs : 0;
    for (let index = 0; index <= total; index += 1) {
      const t = (index / total) * windowMs + shift;
      let value: number;
      if (signal === 'step') {
        value = amplitude * (1 - Math.exp(-t / tauMs));
      } else if (signal === 'sine') {
        value = amplitude * Math.sin((2 * Math.PI * t) / periodMs);
      } else {
        const phase = Math.sin((2 * Math.PI * t) / periodMs);
        value = amplitude * Math.max(0, phase);
      }
      list.push({ x: index / total, y: value });
    }
    return list;
  }, [signal, tauMs, periodMs, amplitude, windowMs, running, offsetMs]);

  const peak = Math.max(amplitude, 1);
  const points = samples.map((point) => ({ x: point.x, y: 0.5 - (point.y / (peak * 2)) * 0.9 }));

  const cursorValue = useMemo(() => {
    if (signal === 'step') return amplitude * (1 - Math.exp(-cursorMs / tauMs));
    if (signal === 'sine') return amplitude * Math.sin((2 * Math.PI * cursorMs) / periodMs);
    return amplitude * Math.max(0, Math.sin((2 * Math.PI * cursorMs) / periodMs));
  }, [signal, cursorMs, amplitude, tauMs, periodMs]);

  const settling = tauMs * 5;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SIGNAL_LABEL) as Signal[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSignal(key)}
              className={cn('chip', signal === key && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
            >
              {SIGNAL_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            className="btn btn-sm border-line/60"
            title={running ? 'Figer' : 'Relancer'}
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setOffsetMs(0);
              setCursorMs(2);
            }}
            className="btn btn-sm border-line/60"
            title="Réinitialiser"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line/50 bg-[#05131a] p-2">
        <PlotFrame width={560} height={250} yLabel="u (V)" xLabel="temps (ms)">
          {({ w, h, x, y }) => (
            <>
              <Grid w={w} h={h} cols={10} rows={8} />
              <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              <Curve points={points.map((point) => ({ x: point.x * w, y: point.y * h }))} color="#46e6a0" width={2} />
              <Cursor
                x={Math.min(1, cursorMs / windowMs) * w}
                h={h}
                label={`${cursorMs.toFixed(1)} ms · ${cursorValue.toFixed(2)} V`}
              />
              <AxisLabels
                w={w}
                h={h}
                values={[amplitude, amplitude / 2, 0, -amplitude / 2, -amplitude]}
                format={(value) => `${value.toFixed(0)}`}
              />
              <AxisLabels
                w={w}
                h={h}
                axis="x"
                values={[0, windowMs / 2, windowMs]}
                format={(value) => `${value} ms`}
              />
              {/* marqueur du régime établi */}
              {signal === 'step' && settling <= windowMs ? (
                <line
                  x1={x(settling / windowMs)}
                  y1={0}
                  x2={x(settling / windowMs)}
                  y2={h}
                  stroke="rgba(255,194,102,0.5)"
                  strokeDasharray="4 4"
                />
              ) : null}
              {signal === 'step' && settling <= windowMs ? (
                <text x={x(settling / windowMs) + 4} y={12} fontSize={8.5} fill="rgba(255,194,102,0.8)">
                  5τ = {settling.toFixed(1)} ms
                </text>
              ) : null}
              <line x1={0} y1={y(0.5 + amplitude / (peak * 2) * 0.9)} x2={0} y2={0} stroke="transparent" />
            </>
          )}
        </PlotFrame>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Slider label="Amplitude" value={amplitude} min={1} max={12} step={0.5} unit="V" onChange={setAmplitude} />
        <Slider label="Fenêtre" value={windowMs} min={2} max={40} step={1} unit="ms" onChange={setWindowMs} />
        {signal === 'step' ? (
          <Slider label="Constante τ" value={tauMs} min={0.2} max={8} step={0.1} unit="ms" onChange={setTauMs} />
        ) : (
          <Slider label="Période" value={periodMs} min={0.5} max={12} step={0.1} unit="ms" onChange={setPeriodMs} />
        )}
        <Slider label="Curseur" value={cursorMs} min={0} max={windowMs} step={0.1} unit="ms" onChange={setCursorMs} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Readout label="Valeur au curseur" value={`${cursorValue.toFixed(3)} V`} accent="#46e6a0" />
        <Readout
          label={signal === 'step' ? 'Régime établi (5τ)' : 'Période'}
          value={signal === 'step' ? `${settling.toFixed(2)} ms` : `${periodMs.toFixed(2)} ms`}
          accent="#38e1e6"
        />
        <Readout
          label={signal === 'step' ? '63 % atteint à' : 'Fréquence'}
          value={signal === 'step' ? `${tauMs.toFixed(2)} ms` : `${(1000 / periodMs).toFixed(1)} Hz`}
          accent="#ffc266"
        />
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-fg-mute">
        <Waves size={11} className="mt-0.5 shrink-0" />
        {signal === 'step'
          ? 'Le condensateur suit u(t) = E(1 − e^(−t/τ)) : à τ la tension vaut 63 % de E, à 5τ elle est considérée établie.'
          : 'En sinusoïdal, la valeur affichée au curseur est instantanée ; la valeur efficace vaut amplitude/√2.'}
      </p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[10.5px] text-fg-mute">
        {label}
        <span className="font-mono text-fg-soft">
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-1.5 w-full appearance-none rounded-full bg-ink-700 accent-spark-cyan"
      />
    </label>
  );
}

export function Readout({ label, value, accent = '#38e1e6' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-line/50 bg-ink-900/60 px-2.5 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wide text-fg-mute">{label}</p>
      <p className="font-mono text-[13px] font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
