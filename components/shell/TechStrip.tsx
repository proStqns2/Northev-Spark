'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ExpressMark,
  MongoMark,
  NextMark,
  NodalMark,
  NodeMark,
  PySparkMark,
  SupabaseMark,
  TailwindMark,
  TypeScriptMark,
} from './TechMarks';

/**
 * Bandeau « bâti avec » — la petite rangée de marques en bas de page.
 *
 * Chaque vignette montre **le logo** de la technologie et **son rôle réel dans
 * ce dépôt**, pas un argument marketing : Next.js sert les pages et l'API,
 * Express le service d'analyse R·C·L, Supabase la synchronisation des ateliers
 * multiwork, MongoDB le miroir optionnel, PySpark l'analytics hors ligne.
 *
 * Les marques sont vectorielles (`./TechMarks`), donc nettes à toutes les
 * tailles et assorties au thème sombre — un PNG sur fond blanc jurerait. Le
 * bandeau passe de 8 colonnes (grand écran) à 4 puis 2, sans jamais déborder.
 */

interface Tech {
  name: string;
  role: string;
  mark: ReactNode;
  tint: string;
  href: string;
  /** mis en avant : la brique qui porte le calcul ou le temps réel */
  hero?: boolean;
}

const TECHS: Tech[] = [
  {
    name: 'Next.js',
    role: 'pages + API',
    mark: <NextMark size={22} />,
    tint: 'text-fg',
    href: 'https://nextjs.org',
  },
  {
    name: 'TypeScript',
    role: 'contrats typés',
    mark: <TypeScriptMark size={22} />,
    tint: 'text-spark-blue',
    href: 'https://www.typescriptlang.org',
  },
  {
    name: 'Tailwind',
    role: 'design system',
    mark: <TailwindMark size={22} />,
    tint: 'text-spark-cyan',
    href: 'https://tailwindcss.com',
  },
  {
    name: 'Node + Express',
    role: 'service R·C·L',
    mark: (
      <span className="flex items-end gap-0.5">
        <span className="text-spark-green">
          <NodeMark size={18} />
        </span>
        <span className="text-fg-soft">
          <ExpressMark size={16} />
        </span>
      </span>
    ),
    tint: 'text-spark-green',
    href: 'https://expressjs.com',
  },
  {
    name: 'Moteur MNA',
    role: 'solveur nodal',
    mark: <NodalMark size={22} />,
    tint: 'text-spark-amber',
    href: '/studio',
    hero: true,
  },
  {
    name: 'Supabase',
    role: 'temps réel partagé',
    mark: <SupabaseMark size={22} />,
    tint: 'text-[#3ecf8e]',
    href: 'https://supabase.com',
    hero: true,
  },
  {
    name: 'MongoDB',
    role: 'miroir optionnel',
    mark: <MongoMark size={22} />,
    tint: 'text-[#4db33d]',
    href: '/export',
  },
  {
    name: 'PySpark',
    role: 'analytics hors ligne',
    mark: <PySparkMark size={22} />,
    tint: 'text-[#e25a1c]',
    href: '/export',
  },
];

export function TechStrip({ className }: { className?: string }) {
  return (
    <section className={cn('w-full', className)} aria-label="Technologies utilisées">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-line/70 to-line/70" />
        <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.3em] text-fg-mute">
          bâti avec
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent via-line/70 to-line/70" />
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
        {TECHS.map((tech) => {
          const external = tech.href.startsWith('http');
          return (
            <li key={tech.name}>
              <a
                href={tech.href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                title={`${tech.name} — ${tech.role}`}
                className={cn(
                  'group flex h-full flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition duration-300',
                  'hover:-translate-y-0.5',
                  tech.hero
                    ? 'border-spark-cyan/25 bg-gradient-to-b from-spark-cyan/[0.07] to-transparent hover:border-spark-cyan/50'
                    : 'border-line/50 bg-ink-900/50 hover:border-line hover:bg-ink-850/80',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center transition duration-300 group-hover:scale-110',
                    tech.tint,
                  )}
                >
                  {tech.mark}
                </span>
                <span className="text-[10px] font-medium leading-tight text-fg-soft">{tech.name}</span>
                <span className="hidden text-[9px] leading-tight text-fg-mute sm:block">{tech.role}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-2.5 max-w-xl text-center text-[10px] leading-relaxed text-fg-mute">
        Le calcul reste local : ni le solveur, ni les agents, ni le Studio ne dépendent d’une clé d’API.
        Le service Express est un second hôte du même code, jamais un second moteur.
      </p>
    </section>
  );
}
