'use client';

import { useMemo, useState } from 'react';
import { Activity, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AxisLabels, Curve, Cursor, Grid, PlotFrame, type Point } from './charts';
import { Readout } from './Oscilloscope';

/**
 * Explorateur de filtres : diagramme de Bode calculé en direct.
 *
 * L’utilisateur choisit un type (passe-bas, passe-haut, RLC série) et les
 * composants ; on trace gain et phase sur quatre décades, avec la coupure
 * marquée. Les formules sont celles du cours, pas une approximation
 * asymptotique.
 */

type Kind = 'lowpass' | 'highpass' | 'rlc';

const KIND_LABEL: Record<Kind, string> = {
  lowpass: 'Passe-bas RC',
  highpass: 'Passe-haut RC',
  rlc: 'RLC série (résonance)',
};

const decades = 4;

export function BodeExplorer() {
  const [kind, setKind] = useState<Kind>('lowpass');
  const [resistance, setResistance] = useState(1000);
  const [capacite, setCapacite] = useState(100);
  const [inductance, setInductance] = useState(100);
  const [f0, setF0] = useState(1000);

  const fc = 1 / (2 * Math.PI * resistance * capacite * 1e-9);
  const fres = 1 / (2 * Math.PI * Math.sqrt(inductance * 1e-3 * capacite * 1e-9));
  const q = (1 / resistance) * Math.sqrt((inductance * 1e-3) / (capacite * 1e-9));

  const { gainPoints, phasePoints, cutoff, label } = useMemo(() => {
    const total = 220;
    const gain: Point[] = [];
    const phase: Point[] = [];
    const fStart = Math.log10(10);
    const fEnd = Math.log10(10) + decades;

    for (let index = 0; index <= total; index += 1) {
      const logF = fStart + (index / total) * (fEnd - fStart);
      const frequency = 10 ** logF;
      const ratio = frequency / fc;

      let magnitude = 0;
      let argument = 0;

      if (kind === 'lowpass') {
        magnitude = 20 * Math.log10(1 / Math.sqrt(1 + ratio * ratio));
        argument = -Math.atan(ratio);
      } else if (kind === 'highpass') {
        magnitude = 20 * Math.log10(ratio / Math.sqrt(1 + ratio * ratio));
        argument = Math.PI / 2 - Math.atan(ratio);
      } else {
        const x = frequency / fres;
        const denominator = Math.hypot(1 - x * x, x / q);
        magnitude = 20 * Math.log10(1 / Math.max(denominator, 1e-6));
        argument = -Math.atan2(x / q, 1 - x * x);
      }

      // axe y : −60 dB … +20 dB
      const normalizedGain = (Math.max(-60, Math.min(20, magnitude)) + 60) / 80;
      // phase : −180° … +180°
      const normalizedPhase = (argument * 180) / Math.PI / 360 + 0.5;
      gain.push({ x: index / total, y: normalizedGain });
      phase.push({ x: index / total, y: normalizedPhase });
    }

    return {
      gainPoints: gain,
      phasePoints: phase,
      cutoff: kind === 'rlc' ? fres : fc,
      label: kind === 'rlc' ? 'f₀' : 'f_c',
    };
  }, [kind, fc, fres, q]);

  const cutoffRatio = (Math.log10(cutoff) - Math.log10(10)) / decades;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABEL) as Kind[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setKind(key)}
              className={cn('chip', kind === key && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
            >
              {KIND_LABEL[key]}
            </button>
          ))}
        </div>
        <span className="chip">
          <SlidersHorizontal size={11} /> Bode
        </span>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-xl border border-line/50 bg-[#05131a] p-2">
          <PlotFrame width={520} height={210} yLabel="gain (dB)" xLabel="fréquence">
            {({ w, h, x }) => (
              <>
                <Grid w={w} h={h} cols={decades * 2} rows={8} />
                <line x1={0} y1={h * (1 - 20 / 80)} x2={w} y2={h * (1 - 20 / 80)} stroke="rgba(255,255,255,0.14)" />
                <Curve points={gainPoints.map((point) => ({ x: point.x * w, y: point.y * h }))} color="#38e1e6" width={2} />
                {cutoffRatio >= 0 && cutoffRatio <= 1 ? (
                  <Cursor x={x(cutoffRatio)} h={h} label={`${label} = ${formatHz(cutoff)}`} />
                ) : null}
                <AxisLabels w={w} h={h} values={[20, 0, -20, -40, -60]} format={(value) => `${value}`} />
                <AxisLabels
                  w={w}
                  h={h}
                  axis="x"
                  values={[10, 100, 1000, 10000, 100000]}
                  format={(value) => (value >= 1000 ? `${value / 1000}k` : `${value}`)}
                />
              </>
            )}
          </PlotFrame>
        </div>

        <div className="rounded-xl border border-line/50 bg-[#05131a] p-2">
          <PlotFrame width={520} height={210} yLabel="phase (°)" xLabel="fréquence">
            {({ w, h, x }) => (
              <>
                <Grid w={w} h={h} cols={decades * 2} rows={4} />
                <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.14)" />
                <Curve points={phasePoints.map((point) => ({ x: point.x * w, y: point.y * h }))} color="#a479ff" width={2} />
                {cutoffRatio >= 0 && cutoffRatio <= 1 ? <Cursor x={x(cutoffRatio)} h={h} label={label} color="#ffc266" /> : null}
                <AxisLabels w={w} h={h} values={[180, 90, 0, -90, -180]} format={(value) => `${value}`} />
              </>
            )}
          </PlotFrame>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Slider label="Résistance R" value={resistance} min={100} max={10000} step={100} unit="Ω" onChange={setResistance} />
        <Slider label="Capacité C" value={capacite} min={10} max={1000} step={10} unit="nF" onChange={setCapacite} />
        {kind === 'rlc' ? (
          <Slider label="Inductance L" value={inductance} min={10} max={500} step={10} unit="mH" onChange={setInductance} />
        ) : (
          <Slider label="Fréquence repère" value={f0} min={100} max={100000} step={100} unit="Hz" onChange={setF0} />
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Readout label={kind === 'rlc' ? 'Résonance' : 'Coupure'} value={formatHz(kind === 'rlc' ? fres : fc)} />
        <Readout label="Facteur Q" value={kind === 'rlc' ? q.toFixed(2) : '—'} accent="#a479ff" />
        <Readout label="Bande passante" value={kind === 'rlc' ? formatHz(fres / Math.max(q, 0.01)) : formatHz(fc)} accent="#ffc266" />
        <Readout
          label="Phase à la coupure"
          value={kind === 'highpass' ? '+45°' : kind === 'lowpass' ? '−45°' : '0°'}
          accent="#46e6a0"
        />
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-fg-mute">
        <Activity size={11} className="mt-0.5 shrink-0" />
        Le gain est tracé en décibels réels : chaque décade franchie après la coupure coûte 20 dB au premier ordre et 40 dB
        au second.
      </p>
    </div>
  );
}

function formatHz(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MHz`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)} kHz`;
  return `${value.toFixed(1)} Hz`;
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
          {value.toLocaleString('fr-FR')} {unit}
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
