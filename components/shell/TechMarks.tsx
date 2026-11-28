'use client';

import type { ReactNode } from 'react';

/**
 * Marques des technologies, dessinées en SVG inline.
 *
 * Pourquoi pas les logos en PNG ? Parce qu'un fichier raster sur fond blanc
 * jure dans un bandeau sombre, pèse quelques dizaines de kilo-octets et devient
 * flou dès qu'on change d'échelle. Ces tracés vectoriels prennent la couleur du
 * texte, restent nets à toutes les tailles et ne coûtent rien au chargement.
 *
 * Chaque marque est un carré de 24 × 24 (repère −12 → +12), donc toutes
 * s'alignent parfaitement dans la rangée du bas de page.
 */

function Frame({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
      className="overflow-visible"
    >
      {children}
    </svg>
  );
}

/** Next.js : cercle et « N » barré. */
export function NextMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <circle cx={0} cy={0} r={10.5} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.75} />
      <path d="M-4 -5 L-4 5 M-4 -4 L4 5 M4 -5 L4 5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
    </Frame>
  );
}

/** TypeScript : pastille et « TS ». */
export function TypeScriptMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <rect x={-10.5} y={-10.5} width={21} height={21} rx={3} fill="currentColor" opacity={0.16} />
      <text
        x={0}
        y={4.2}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={800}
        fontFamily="ui-monospace, monospace"
        fill="currentColor"
      >
        TS
      </text>
    </Frame>
  );
}

/** Tailwind : les deux souffles. */
export function TailwindMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path
        d="M-10 2 q3 -7 10 -6 q3 0 4 3 q1 3 -3 5 q-3 1 -4 -1 M0 7 q3 -7 10 -6 q3 0 4 3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Node.js : l'hexagone. */
export function NodeMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path
        d="M0 -10.5 L9 -5.2 L9 5.2 L0 10.5 L-9 5.2 L-9 -5.2 Z"
        fill="currentColor"
        opacity={0.16}
      />
      <path
        d="M0 -10.5 L9 -5.2 L9 5.2 L0 10.5 L-9 5.2 L-9 -5.2 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <text x={0} y={3.6} textAnchor="middle" fontSize={7} fontWeight={800} fontFamily="ui-monospace, monospace" fill="currentColor">
        js
      </text>
    </Frame>
  );
}

/** Express : le « x » du logotype, tracé au trait. */
export function ExpressMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <text
        x={-0.5}
        y={4.4}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
        fontStyle="italic"
      >
        ex
      </text>
    </Frame>
  );
}

/** Supabase : l'éclair. */
export function SupabaseMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path d="M2 -11 L-9 2.5 L-0.5 2.5 L-2 11 L9 -2.5 L0.5 -2.5 Z" fill="currentColor" opacity={0.9} />
    </Frame>
  );
}

/** MongoDB : la feuille. */
export function MongoMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path
        d="M0 -11 q6 4.5 6 9.5 q0 6 -6 8.5 q-6 -2.5 -6 -8.5 q0 -5 6 -9.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M0 -9 L0 9" stroke="currentColor" strokeWidth={1.1} opacity={0.6} />
    </Frame>
  );
}

/** PySpark : l'étoile et l'étincelle. */
export function PySparkMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path
        d="M3 -11 L5.6 -4.6 L11.5 -3.8 L7 -0.6 L8.4 5.2 L3.2 2.1 L-2 5.2 L-0.6 -0.6 L-5 -3.8 L0.4 -4.6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <circle cx={-7.5} cy={-7} r={1.7} fill="currentColor" />
    </Frame>
  );
}

/** Moteur MNA : trois nœuds reliés, la signature du solveur maison. */
export function NodalMark({ size }: { size?: number }) {
  return (
    <Frame size={size}>
      <path d="M-8 -6 L0 6 L8 -6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={-8} cy={-6} r={2.4} fill="currentColor" />
      <circle cx={8} cy={-6} r={2.4} fill="currentColor" />
      <circle cx={0} cy={6} r={2.4} fill="currentColor" />
    </Frame>
  );
}
