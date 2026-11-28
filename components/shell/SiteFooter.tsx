'use client';

import Link from 'next/link';
import { Github, Sparkles } from 'lucide-react';
import { GROUPS, PRIMARY } from '@/lib/nav/site';
import { TechStrip } from './TechStrip';

/**
 * Pied de page — plan du site.
 *
 * Il liste **toutes** les pages, y compris celles qui ne tiennent pas dans la
 * barre du haut (progression, classement, badges, assistant…). C'est la
 * garantie qu'aucune page ne devient introuvable, même sur téléphone.
 */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line/60 bg-ink-950/80">
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-8 sm:px-6 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold tracking-tight">
            Northev<span className="text-spark-cyan"> Spark</span>
          </p>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-fg-mute">
            Studio de circuits, calculs d’équivalents Thévenin / Norton et travail à plusieurs. Tout le calcul se fait
            dans votre navigateur : aucune clé n’est nécessaire pour dessiner et vérifier un montage.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-fg-mute">
            <span className="chip">
              <Sparkles size={10} className="text-spark-violet" /> IA en option
            </span>
            <span className="chip">MNA · 13 dipôles</span>
            <span className="chip">Next.js</span>
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-mute">Accès directs</p>
          <ul className="mt-2 space-y-1.5">
            {PRIMARY.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-[12.5px] text-fg-soft transition hover:text-spark-cyan">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {GROUPS.map((group) => (
          <div key={group.id}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-mute">{group.label}</p>
            <ul className="mt-2 space-y-1.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-[12.5px] text-fg-soft transition hover:text-spark-cyan">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line/40 px-4 pb-6 pt-7 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <TechStrip />
        </div>
      </div>

      <div className="border-t border-line/40 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 text-[11px] text-fg-mute">
          <span>© {new Date().getFullYear()} Northev Spark · pédagogie de l’électronique</span>
          <span className="flex items-center gap-3">
            <Link href="/compte" className="transition hover:text-fg">
              Mon compte
            </Link>
            <Link href="/bibliotheque" className="transition hover:text-fg">
              Bibliothèque
            </Link>
            <a
              href="https://github.com/proStqns2/Northev-Spark"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 transition hover:text-fg"
            >
              <Github size={11} /> Dépôt
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
