'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import explicite : le rendu de test (react-dom/server via tsx) n'applique pas
// la transformation JSX automatique de Next.
import React from 'react';
import {
  ArrowRight,
  CircleHelp,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { COMPONENT_META } from '@/lib/engine/types';
import { abs } from '@/lib/engine/complex';
import { formatSI } from '@/lib/engine/format';
import { VALUE_DEFAULTS } from '@/lib/express/model';
import { parseEngineerValue } from '@/lib/express/params';
import type { ValueModel } from '@/lib/express/model';
import { cn } from '@/lib/utils';

/**
 * Barre de valeurs R · C · L du studio.
 *
 * Trois champs compacts (`R = 1k`, `C = 100n`, `L = 10m`) acceptent la notation
 * d'ingénieur (`4,7k`, `100nF`, `10 mH`), les préfixes SI et les valeurs
 * usuelles en un clic. Chaque frappe relance l'analyse : le service Express
 * (`POST /api/v1/analyze`) est appelé en priorité — c'est lui le chef
 * d'orchestre du montage — et le site bascule sur son propre calcul
 * (`POST /api/values/analyze`) s'il ne répond pas.
 *
 * Le résultat s'affiche en clair sur la barre : `U_th · Z_th · I_N`, fréquence
 * de résonance, facteur de qualité et puissance maximale.
 */

type Field = 'r' | 'c' | 'l' | 'e' | 'f';

interface FieldSpec {
  key: Field;
  letter: string;
  unit: string;
  /** nom accessible du champ */
  label: string;
  scales: Array<{ factor: number; label: string }>;
  presets: number[];
  placeholder: string;
  width: string;
}

const FIELDS: FieldSpec[] = [
  {
    key: 'r',
    letter: 'R',
    label: 'Résistance',
    unit: 'Ω',
    scales: [
      { factor: 1, label: 'Ω' },
      { factor: 1e3, label: 'kΩ' },
      { factor: 1e6, label: 'MΩ' },
    ],
    presets: [100, 470, 1_000, 4_700, 10_000, 47_000],
    placeholder: '1k',
    width: 'w-[86px]',
  },
  {
    key: 'c',
    letter: 'C',
    label: 'Condensateur',
    unit: 'F',
    scales: [
      { factor: 1e-12, label: 'pF' },
      { factor: 1e-9, label: 'nF' },
      { factor: 1e-6, label: 'µF' },
    ],
    presets: [1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6],
    placeholder: '100n',
    width: 'w-[78px]',
  },
  {
    key: 'l',
    letter: 'L',
    label: 'Bobine',
    unit: 'H',
    scales: [
      { factor: 1e-6, label: 'µH' },
      { factor: 1e-3, label: 'mH' },
      { factor: 1, label: 'H' },
    ],
    presets: [1e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1],
    placeholder: '10m',
    width: 'w-[78px]',
  },
  {
    key: 'e',
    letter: 'E',
    label: 'Source de tension',
    unit: 'V',
    scales: [{ factor: 1, label: 'V' }],
    presets: [5, 9, 12, 24],
    placeholder: '12',
    width: 'w-[64px]',
  },
  {
    key: 'f',
    letter: 'f',
    label: 'Fréquence d’étude',
    unit: 'Hz',
    scales: [
      { factor: 1, label: 'Hz' },
      { factor: 1e3, label: 'kHz' },
      { factor: 1e6, label: 'MHz' },
    ],
    presets: [50, 1_000, 10_000, 100_000],
    placeholder: '1k',
    width: 'w-[74px]',
  },
];

/** Choisit le préfixe lisible pour une valeur (ex. 4700 → 4,7 kΩ). */
function bestScale(field: FieldSpec, value: number): { factor: number; label: string } {
  const absolute = Math.abs(value);
  const matches = field.scales.filter((scale) => absolute >= scale.factor * 0.999);
  return matches[matches.length - 1] ?? field.scales[0];
}

/** `4700` → `4,7` (valeur ramenée au préfixe) ; pas de zéro traînant. */
function toDisplay(value: number, factor: number): string {
  if (!Number.isFinite(value)) return '';
  const scaled = value / factor;
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 3;
  return Number(scaled.toFixed(digits)).toString().replace('.', ',');
}

export interface ValueBarProps {
  /** reçoit le montage canonique prêt à charger dans la grille */
  onApply: (model: ValueModel, options: { replace: boolean }) => void;
  /** résumé compact pour les entêtes / mobile */
  compact?: boolean;
  className?: string;
}

export function ValueBar({ onApply, compact = false, className }: ValueBarProps) {
  const [values, setValues] = useState<Record<Field, number>>({
    r: VALUE_DEFAULTS.r,
    c: VALUE_DEFAULTS.c,
    l: VALUE_DEFAULTS.l,
    e: VALUE_DEFAULTS.e,
    f: VALUE_DEFAULTS.f,
  });
  /** texte brut en cours de frappe (on ne formate pas sous les doigts) */
  const [texts, setTexts] = useState<Record<string, string>>({});
  /** préfixe actif par champ, mémorisé séparément du texte */
  const [scales, setScales] = useState<Record<Field, number>>({
    r: 1e3,
    c: 1e-9,
    l: 1e-3,
    e: 1,
    f: 1e3,
  });
  const [model, setModel] = useState<ValueModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [service, setService] = useState<'express' | 'next' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<'none' | 'presets' | 'help'>('none');
  const [direct, setDirect] = useState(false);
  const requestId = useRef(0);

  /** URL du service Express dans le navigateur (facultative, CORS ouvert). */
  const directUrl = (process.env.NEXT_PUBLIC_EXPRESS_URL ?? '').trim().replace(/\/$/, '');

  /* ------------------------------------------------------------ analyse servie */
  const analyze = useCallback(
    async (next: Record<Field, number>) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      const body = JSON.stringify({
        r: next.r,
        c: next.c,
        l: next.l,
        e: next.e,
        f: next.f,
        regime: 'ac',
        name: 'Montage R · C · L — barre de valeurs',
      });
      const send = (url: string) =>
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

      try {
        // 1. service Express en direct si NEXT_PUBLIC_EXPRESS_URL est renseignée
        if (directUrl) {
          try {
            const directResponse = await send(`${directUrl}/api/v1/analyze`);
            if (directResponse.ok) {
              const payload = (await directResponse.json()) as ValueModel & { error?: string };
              if (id !== requestId.current) return;
              setModel(payload);
              setService('express');
              setDirect(true);
              return;
            }
          } catch {
            /* service éteint ou bloqué : on passe par le relais du site */
          }
          if (id === requestId.current) setDirect(false);
        }

        // 2. relais du site — Express s'il tourne, moteur Next sinon
        const response = await send('/api/values/analyze');
        const payload = (await response.json()) as ValueModel & { error?: string };
        if (id !== requestId.current) return;
        if (!response.ok) {
          setError(payload.error ?? 'Calcul impossible pour ces valeurs.');
          return;
        }
        setModel(payload);
        setService(response.headers.get('x-spark-service') === 'express' ? 'express' : 'next');
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [directUrl],
  );

  /* première analyse à l'affichage, puis à chaque changement (débounce 220 ms) */
  useEffect(() => {
    const timer = setTimeout(() => void analyze(values), 220);
    return () => clearTimeout(timer);
  }, [values, analyze]);

  const commit = useCallback((field: Field, raw: string) => {
    const parsed = parseEngineerValue(raw);
    const factor = scales[field];
    // « 4,7 » sans suffixe = 4,7 × préfixe choisipour le champ
    const suffixless = /^[-+]?[\d.,\s]+$/.test(raw.trim());
    const value = parsed === null ? NaN : suffixless ? parsed * factor : parsed;
    if (!Number.isFinite(value) || value <= 0) return;
    setValues((current) => ({ ...current, [field]: value }));
  }, [scales]);

  const displayValue = useCallback(
    (field: FieldSpec) => {
      const typed = texts[field.key];
      if (typed !== undefined) return typed;
      return toDisplay(values[field.key], scales[field.key]);
    },
    [texts, values, scales],
  );

  const apply = useCallback(
    (replace: boolean) => {
      if (model) {
        onApply(model, { replace });
        return;
      }
      void analyze(values).then(() => undefined);
    },
    [model, onApply, analyze, values],
  );

  const metrics = model?.metrics;
  const equivalent = model?.equivalent;

  const headline = useMemo(() => {
    if (!model) return null;
    if (!model.ok || !equivalent) {
      return <span className="text-spark-amber/{80} text-[10.5px]">{model.error ?? 'Montage non calculable'}</span>;
    }
    const vth = formatSI(abs(equivalent.vth), 'V', { digits: 3 });
    const zth = formatSI(abs(equivalent.rth), 'Ω', { digits: 3 });
    const inorton = formatSI(abs(equivalent.inorton), 'A', { digits: 3 });
    return (
      <span className="flex items-center gap-2 font-mono text-[10.5px]">
        <span className="text-spark-cyan" title="Tension de Thévenin aux bornes A-B">
          U_th {vth}
        </span>
        <span className="text-fg-mute/50">·</span>
        <span className="text-spark-violet" title="Impédance équivalente">
          Z_th {zth}
        </span>
        <span className="text-fg-mute/50">·</span>
        <span className="text-spark-amber" title="Courant de Norton">
          I_N {inorton}
        </span>
      </span>
    );
  }, [model, equivalent]);

  return (
    <section
      className={cn(
        'relative border-b border-line/60 bg-ink-900/70 backdrop-blur',
        compact ? 'px-2 py-1.5' : 'px-3 py-2',
        className,
      )}
      aria-label="Barre de valeurs R, C, L du montage"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
          <SlidersHorizontal size={11} className="text-spark-cyan" />
          {compact ? 'Valeurs' : 'Barre de valeurs'}
        </span>

        {/* champs R, C, L, E, f */}
        {FIELDS.map((field) => {
          const meta =
            COMPONENT_META[
              field.key === 'r'
                ? 'resistor'
                : field.key === 'c'
                  ? 'capacitor'
                  : field.key === 'l'
                    ? 'inductor'
                    : 'vsource'
            ];
          const tone = field.key === 'f' ? '#8ba0bb' : meta.color;
          const scale = field.scales.find((s) => s.factor === scales[field.key]) ?? field.scales[0];
          const isPending = texts[field.key] !== undefined;
          return (
            <div
              key={field.key}
              className={cn(
                'group flex items-center gap-1 rounded-lg border px-1.5 py-[3px] transition',
                // sur petit écran, E et f restent accessibles via les valeurs usuelles
                (field.key === 'e' || field.key === 'f') && 'hidden sm:flex',
                isPending ? 'border-spark-cyan/60 bg-spark-cyan/[0.06]' : 'border-line/60 bg-ink-950/60',
                field.key === 'f' && 'ml-auto',
              )}
              title={`${field.letter} — ${field.unit} · notation d'ingénieur acceptée (ex. ${field.placeholder})`}
            >
              <span className="font-mono text-[10px] font-bold" style={{ color: tone }}>
                {field.letter}
              </span>
              <input
                value={displayValue(field)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setTexts((current) => ({ ...current, [field.key]: raw }));
                  commit(field.key, raw);
                }}
                onBlur={() => {
                  setTexts((current) => {
                    const next = { ...current };
                    delete next[field.key];
                    return next;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                    void analyze(values);
                  }
                }}
                inputMode="text"
                spellCheck={false}
                aria-label={`${field.label} (${field.unit})`}
                className={cn(
                  'bg-transparent font-mono text-[11.5px] text-fg outline-none placeholder:text-fg-mute/60',
                  field.width,
                )}
                placeholder={field.placeholder}
              />
              {field.key !== 'e' ? (
                <select
                  value={scale.factor}
                  onChange={(event) => {
                    const factor = Number(event.target.value);
                    setScales((current) => ({ ...current, [field.key]: factor }));
                    setTexts((current) => {
                      const next = { ...current };
                      delete next[field.key];
                      return next;
                    });
                  }}
                  aria-label={`Préfixe de ${field.letter}`}
                  className="cursor-pointer bg-transparent font-mono text-[9.5px] text-fg-mute outline-none"
                >
                  {field.scales.map((option) => (
                    <option key={option.factor} value={option.factor} className="bg-ink-900 text-fg">
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-[9.5px] text-fg-mute">V</span>
              )}
            </div>
          );
        })}

        {/* valeurs usuelles */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => (v === 'presets' ? 'none' : 'presets'))}
            className={cn(
              'rounded-lg border px-1.5 py-[3px] text-[9.5px] font-medium transition',
              open === 'presets'
                ? 'border-spark-cyan/60 text-spark-cyan'
                : 'border-line/60 text-fg-mute hover:text-fg-soft',
            )}
            aria-expanded={open === 'presets'}
            title="Valeurs usuelles de R, C, L, E et f"
          >
            <Sparkles size={10} className="inline" /> usuelles
          </button>
          {open === 'presets' ? (
            <div className="absolute left-0 top-8 z-40 w-[330px] rounded-xl border border-line/70 bg-ink-950/98 p-2 shadow-panel backdrop-blur">
              {FIELDS.map((field) => (
                <div key={field.key} className="mb-1.5 last:mb-0">
                  <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-fg-mute">
                    {field.letter} · {field.unit}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {field.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setValues((current) => ({ ...current, [field.key]: preset }));
                          setTexts((current) => {
                            const next = { ...current };
                            delete next[field.key];
                            return next;
                          });
                          setScales((current) => ({ ...current, [field.key]: bestScale(field, preset).factor }));
                          setOpen('none');
                        }}
                        className="rounded border border-line/50 px-1.5 py-[2px] font-mono text-[9.5px] text-fg-mute transition hover:border-spark-cyan/60 hover:text-spark-cyan"
                      >
                        {formatSI(preset, field.unit, { digits: 2, space: false })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => apply(true)}
            disabled={!model || loading}
            className="flex items-center gap-1 rounded-lg border border-spark-cyan/50 bg-spark-cyan/10 px-2 py-[3px] text-[10px] font-medium text-spark-cyan transition hover:bg-spark-cyan/20 disabled:opacity-50"
            title="Charger le montage R·C·L calculé dans la grille du studio"
          >
            <Zap size={10} /> Charger
          </button>
          <button
            type="button"
            onClick={() => apply(false)}
            disabled={!model || loading}
            className="hidden items-center gap-1 rounded-lg border border-line/60 px-2 py-[3px] text-[10px] text-fg-soft transition hover:border-spark-violet/50 hover:text-spark-violet disabled:opacity-50 sm:flex"
            title="Ajouter ce montage à côté de celui déjà posé"
          >
            <ArrowRight size={10} /> Ajouter
          </button>
          <button
            type="button"
            onClick={() => {
              setValues({
                r: VALUE_DEFAULTS.r,
                c: VALUE_DEFAULTS.c,
                l: VALUE_DEFAULTS.l,
                e: VALUE_DEFAULTS.e,
                f: VALUE_DEFAULTS.f,
              });
              setTexts({});
              setScales({ r: 1e3, c: 1e-9, l: 1e-3, e: 1, f: 1e3 });
            }}
            className="rounded-lg border border-line/60 p-[3px] text-fg-mute transition hover:text-fg-soft"
            title="Revenir aux valeurs par défaut"
            aria-label="Réinitialiser les valeurs"
          >
            <RotateCcw size={10} />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => (v === 'help' ? 'none' : 'help'))}
            className={cn(
              'rounded-lg border border-line/60 p-[3px] transition',
              open === 'help' ? 'text-spark-cyan' : 'text-fg-mute hover:text-fg-soft',
            )}
            aria-label="Aide sur la barre de valeurs"
            aria-expanded={open === 'help'}
          >
            <CircleHelp size={10} />
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- résultat en direct */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {loading ? (
          <span className="flex items-center gap-1 text-[10.5px] text-fg-mute">
            <Loader2 size={10} className="animate-spin" /> calcul nodal en cours…
          </span>
        ) : error ? (
          <span className="text-[10.5px] text-spark-coral">{error}</span>
        ) : (
          headline
        )}

        {metrics && model?.ok ? (
          <>
            <span className="hidden h-3 w-px bg-line/70 md:block" />
            <span className="hidden font-mono text-[10px] text-fg-mute sm:inline" title="Fréquence de résonance du couple L ∥ C">
              f₀ <span className="text-fg-soft">{formatSI(metrics.f0 ?? NaN, 'Hz', { digits: 3 })}</span>
            </span>
            <span className="hidden font-mono text-[10px] text-fg-mute sm:inline" title="Facteur de qualité Q = (1/R)·√(L/C)">
              Q <span className="text-fg-soft">{metrics.quality === null ? '—' : metrics.quality.toFixed(3).replace('.', ',')}</span>
            </span>
            <span className="hidden font-mono text-[10px] text-fg-mute lg:inline" title="Réactances à la fréquence d'étude">
              X_L <span className="text-fg-soft">{formatSI(metrics.xl ?? NaN, 'Ω', { digits: 3 })}</span>
              {' · '}X_C <span className="text-fg-soft">{formatSI(metrics.xc ?? NaN, 'Ω', { digits: 3 })}</span>
            </span>
            <span className="hidden font-mono text-[10px] text-fg-mute sm:inline" title="Puissance maximale transférable (P_max = U_th²/4Z_th)">
              P_max{' '}
              <span className="text-spark-green">
                {formatSI(metrics.powerMax ?? NaN, 'W', { digits: 3 })}
              </span>
            </span>
          </>
        ) : null}

        <span
          className={cn(
            'ml-auto flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-wider',
            service === 'express'
              ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
              : service === 'next'
                ? 'border-spark-amber/40 bg-spark-amber/10 text-spark-amber'
                : 'border-line/60 text-fg-mute',
          )}
          title={
            service === 'express'
              ? 'Analyse servie par le service Express (leader du montage)'
              : 'Service Express injoignable : le moteur Next.js a répondu'
          }
        >
          <span className="h-1 w-1 rounded-full bg-current" />
          {service === 'express'
            ? direct
              ? 'express · direct'
              : 'express · leader'
            : service === 'next'
              ? 'moteur next'
              : 'prêt'}
        </span>
      </div>

      {open === 'help' ? (
        <div className="mt-2 rounded-lg border border-line/60 bg-ink-950/80 p-2.5 text-[10.5px] leading-relaxed text-fg-soft">
          <p className="mb-1 font-semibold text-fg">Notation acceptée</p>
          <p className="text-fg-mute">
            <code className="text-spark-cyan">4,7k</code> · <code className="text-spark-cyan">100nF</code> ·{' '}
            <code className="text-spark-cyan">10 mH</code> · <code className="text-spark-cyan">1e-6</code> : les
            préfixes p, n, µ, m, k, M, G sont compris, la virgule vaut le point. Le montage construit est un diviseur{' '}
            <strong>R / (L ∥ C)</strong> alimenté par E : <strong>Charger</strong> le remplace dans la grille,{' '}
            <strong>Ajouter</strong> le pose à côté. Résonance : <code>f₀ = 1/(2π√(LC))</code>, qualité{' '}
            <code>Q = (1/R)·√(L/C)</code>.
          </p>
        </div>
      ) : null}
    </section>
  );
}
