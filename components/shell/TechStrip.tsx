import { Boxes, Database, Hexagon, Server, Triangle, Wind, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bandeau « bâti avec » — petit détail de bas de page d'accueil.
 *
 * Chaque entrée donne le rôle réel du framework **dans ce dépôt**, pas un
 * argument marketing : Next.js sert les pages et l'API, Express le service
 * d'analyse R·C·L, MongoDB le miroir optionnel des données, PySpark le
 * pipeline d'analytics hors ligne.
 *
 * Les icônes sont des composants `lucide-react` (aucun asset externe, aucun
 * build supplémentaire) : le bandeau reste léger et lisible même à 320 px.
 */

interface Tech {
  name: string;
  role: string;
  icon: LucideIcon;
  tint: string;
  href: string;
}

const TECHS: Tech[] = [
  {
    name: 'Next.js',
    role: 'pages + API',
    icon: Triangle,
    tint: 'text-fg',
    href: 'https://nextjs.org',
  },
  {
    name: 'TypeScript',
    role: 'contrats typés',
    icon: Boxes,
    tint: 'text-spark-blue',
    href: 'https://www.typescriptlang.org',
  },
  {
    name: 'Tailwind',
    role: 'design system',
    icon: Wind,
    tint: 'text-spark-cyan',
    href: 'https://tailwindcss.com',
  },
  {
    name: 'Express',
    role: 'service R·C·L',
    icon: Server,
    tint: 'text-spark-green',
    href: 'https://expressjs.com',
  },
  {
    name: 'Moteur MNA',
    role: 'solveur nodal',
    icon: Zap,
    tint: 'text-spark-amber',
    href: '/studio',
  },
  {
    name: 'MongoDB',
    role: 'miroir optionnel',
    icon: Database,
    tint: 'text-spark-green',
    href: '/export',
  },
  {
    name: 'PySpark',
    role: 'analytics hors ligne',
    icon: Hexagon,
    tint: 'text-spark-violet',
    href: '/export',
  },
];

export function TechStrip({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <p className="text-center font-mono text-[9.5px] uppercase tracking-[0.22em] text-fg-mute">
        bâti avec
      </p>
      <ul className="flex flex-wrap items-stretch justify-center gap-1.5 sm:gap-2">
        {TECHS.map((tech) => {
          const Icon = tech.icon;
          return (
            <li key={tech.name}>
              <a
                href={tech.href}
                target={tech.href.startsWith('http') ? '_blank' : undefined}
                rel={tech.href.startsWith('http') ? 'noreferrer' : undefined}
                className="group flex items-center gap-1.5 rounded-lg border border-line/50 bg-ink-900/60 px-2 py-1.5 transition hover:border-line hover:bg-ink-850"
                title={`${tech.name} — ${tech.role}`}
              >
                <Icon size={12} className={cn('shrink-0 transition group-hover:scale-110', tech.tint)} />
                <span className="text-[10.5px] font-medium text-fg-soft">{tech.name}</span>
                <span className="hidden text-[9.5px] text-fg-mute sm:inline">{tech.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
