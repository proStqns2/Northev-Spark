'use client';

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Curve, Grid, PlotFrame, type Point } from './charts';
import { Readout } from './Oscilloscope';

/**
 * Puissances et compensation : triangle P/Q/S en direct, plus le
 * dimensionnement du condensateur de relèvement du facteur de puissance.
 *
 * Le calcul part de U et I efficaces et du déphasage, exactement comme sur
 * une facture d’électricité industrielle (avec pénalités de réactif).
 */

export function PowerLab() {
  const [tension, setTension] = useState(230);
  const [courant, setCourant] = useState(8);
  const [cosPhi, setCosPhi] = useState(0.72);
  const [targetCos, setTargetCos] = useState(0.95);
  const [freq, setFreq] = useState(50);

  const phi = Math.acos(cosPhi);
  const phiTarget = Math.acos(targetCos);

  const p = tension * courant * cosPhi;
  const s = tension * courant;
  const q = tension * courant * Math.sin(phi);

  const pTarget = p;
  const sTarget = p / targetCos;
  const qTarget = p * Math.tan(phiTarget);
  const qComp = Math.max(0, q - qTarget);
  const capacitance = qComp / (2 * Math.PI * freq * tension * tension);

  const gain = ((q - qTarget) / Math.max(q, 1e-9)) * 100;
  const deltaI = courant - sTarget / tension;

  const triangle = useMemo(() => {
    const scale = 1 / Math.max(s, 1);
    const base = [
      { x: 0.05, y: 0.9 },
      { x: 0.05 + p * scale * 0.9, y: 0.9 },
      { x: 0.05 + p * scale * 0.9, y: 0.9 - q * scale * 0.9 },
      { x: 0.05, y: 0.9 },
    ];
    return base as Point[];
  }, [p, q, s]);

  const compensated = useMemo(() => {
    const scale = 1 / Math.max(s, 1);
    const base = [
      { x: 0.05, y: 0.9 },
      { x: 0.05 + pTarget * scale * 0.9, y: 0.9 },
      { x: 0.05 + pTarget * scale * 0.9, y: 0.9 - qTarget * scale * 0.9 },
      { x: 0.05, y: 0.9 },
    ];
    return base as Point[];
  }, [pTarget, qTarget, s]);

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Triangle des puissances & compensation</h3>
        <span className="chip">
          <Zap size={11} /> {freq} Hz
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-line/50 bg-[#05131a] p-2">
          <PlotFrame width={480} height={230} yLabel="Q (kvar)" xLabel="P (kW)">
            {({ w, h }) => (
              <>
                <Grid w={w} h={h} cols={8} rows={6} dashed />
                <Curve
                  points={triangle.map((point) => ({ x: point.x * w, y: point.y * h }))}
                  color="#ffc266"
                  width={2}
                />
                <Curve
                  points={compensated.map((point) => ({ x: point.x * w, y: point.y * h }))}
                  color="#46e6a0"
                  width={2}
                  dashed
                />
                <text x={triangle[1].x * w * 0.5} y={triangle[1].y * h + 12} fontSize={9} fill="rgba(255,194,102,0.85)">
                  P = {(p / 1000).toFixed(2)} kW
                </text>
                <text
                  x={triangle[2].x * w + 4}
                  y={(triangle[1].y + triangle[2].y) * 0.5 * h}
                  fontSize={9}
                  fill="rgba(255,194,102,0.85)"
                >
                  Q = {(q / 1000).toFixed(2)} kvar
                </text>
                <text x={triangle[2].x * w * 0.55} y={triangle[2].y * h - 4} fontSize={9} fill="rgba(255,255,255,0.7)">
                  S = {(s / 1000).toFixed(2)} kVA
                </text>
                <text x={compensated[2].x * w * 0.55 + 10} y={compensated[2].y * h + 16} fontSize={9} fill="rgba(70,230,160,0.9)">
                  après compensation
                </text>
              </>
            )}
          </PlotFrame>
        </div>

        <div className="space-y-2">
          <Row label="Tension efficace U" value={tension} min={110} max={400} step={5} unit="V" onChange={setTension} />
          <Row label="Courant efficace I" value={courant} min={1} max={40} step={0.5} unit="A" onChange={setCourant} />
          <Row label="cos φ actuel" value={cosPhi} min={0.3} max={1} step={0.01} unit="" onChange={setCosPhi} />
          <Row label="cos φ visé" value={targetCos} min={0.5} max={1} step={0.01} unit="" onChange={setTargetCos} />
          <Row label="Fréquence" value={freq} min={50} max={60} step={10} unit="Hz" onChange={setFreq} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Readout label="P active" value={`${(p / 1000).toFixed(2)} kW`} accent="#ffc266" />
        <Readout label="Q réactive" value={`${(q / 1000).toFixed(2)} kvar`} accent="#a479ff" />
        <Readout label="S apparente" value={`${(s / 1000).toFixed(2)} kVA`} accent="#38e1e6" />
        <Readout label="Q à compenser" value={`${(qComp / 1000).toFixed(2)} kvar`} accent="#ff7a90" />
        <Readout label="Condensateur" value={capFormat(capacitance)} accent="#46e6a0" />
        <Readout label="Courant économisé" value={`${(deltaI * 1000).toFixed(0)} mA`} accent="#46e6a0" />
      </div>

      <div className="mt-3 rounded-lg border border-line/50 bg-ink-900/50 p-2.5 text-[10.5px] leading-relaxed text-fg-soft">
        <p>
          <span className="text-spark-amber">Déphasage actuel :</span> φ = {(phi * 180 / Math.PI).toFixed(1)}° — l’installation
          absorbe {((s - p) / 1000).toFixed(2)} kVA de « puissance qui ne travaille pas », facturée en réactif.
        </p>
        <p className="mt-1">
          <span className="text-spark-green">Après compensation :</span> Q tombe à {(qTarget / 1000).toFixed(2)} kvar
          ({gain.toFixed(0)} % de réactif en moins), soit un condensateur de {capFormat(capacitance)} en parallèle
          (C = Q_c / (2π·f·U²)).
        </p>
        <p className="mt-1 text-fg-mute">
          Formule utilisée : C = P(tan φ₁ − tan φ₂) / (2π·f·U²). La vérification croisée est disponible dans le studio via{' '}
          <span className="font-mono text-fg-soft">millman</span> et{' '}
          <span className="font-mono text-fg-soft">bobines-impedances</span>.
        </p>
      </div>
    </div>
  );
}

function Row({
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
        <span className={cn('font-mono', 'text-fg-soft')}>
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
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

function capFormat(farads: number): string {
  if (!Number.isFinite(farads) || farads <= 0) return '—';
  if (farads >= 1e-3) return `${(farads * 1e3).toFixed(1)} mF`;
  if (farads >= 1e-6) return `${(farads * 1e6).toFixed(1)} µF`;
  return `${(farads * 1e9).toFixed(0)} nF`;
}
