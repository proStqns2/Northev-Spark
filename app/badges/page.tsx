import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Lock, Sparkles } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { userProgress } from '@/lib/db/progress';
import { BADGES, BADGE_TIERS, badgesByTier } from '@/lib/learning/badges';
import { BadgeTile, ProgressRing } from '@/components/learning/visuals';

export const metadata: Metadata = {
  title: 'Badges',
  description: 'Les 42 badges de l’Académie Northev Spark : leçons, quiz, défis, séries et gabarits explorés.',
};

export const dynamic = 'force-dynamic';

export default async function BadgesPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const progress = user ? await userProgress(user.id) : null;
  const earned = progress ? Object.keys(progress.badges).length : 0;

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1250px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
              <BadgeCheck size={12} /> Collection
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Badges</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
              {BADGES.length} distinctions en quatre niveaux. Les critères sont évalués par le serveur à chaque leçon,
              quiz ou défi — impossible de les forcer depuis le navigateur.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={earned / BADGES.length} size={72} color="#46e6a0" label={`${earned}`} sub={`/${BADGES.length}`} />
            {user ? (
              <Link href="/academie" className="btn btn-sm border-line/60">
                Gagner des badges <ArrowRight size={12} />
              </Link>
            ) : (
              <Link href="/compte?mode=inscription" className="btn btn-primary btn-sm">
                Créer un compte <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </header>

        {!user ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-spark-amber/30 bg-spark-amber/[0.06] px-3 py-2 text-[11.5px] text-spark-amber">
            <Lock size={13} /> Connectez-vous pour suivre votre collection — l’aperçu ci-dessous reste consultable.
          </p>
        ) : null}

        {badgesByTier().map((group) => {
          const tier = BADGE_TIERS[group.tier];
          const owned = group.items.filter((badge) => progress?.badges[badge.id]).length;
          return (
            <section key={group.tier} className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: tier.color }} />
                  {group.label}
                  <span className="text-[10.5px] font-normal text-fg-mute">
                    {owned}/{group.items.length}
                  </span>
                </h2>
                <span className="text-[10.5px] text-fg-mute">{Math.round((owned / Math.max(1, group.items.length)) * 100)} %</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {group.items.map((badge) => (
                  <BadgeTile
                    key={badge.id}
                    badge={badge}
                    earnedAt={progress?.badges[badge.id]}
                    locked={!progress?.badges[badge.id]}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section className="panel mt-6 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles size={13} className="text-spark-amber" /> Comment obtenir des badges plus vite
          </h2>
          <ul className="mt-2 grid gap-1.5 text-[11.5px] text-fg-soft sm:grid-cols-2">
            <li className="rounded-lg border border-line/50 p-2.5">
              Une leçon rapporte 40 XP ; enchaîner deux leçons et un quiz suffit pour « Étincelle ».
            </li>
            <li className="rounded-lg border border-line/50 p-2.5">
              Le premier quiz parfait débloque « Sans faute » : lisez les explications, elles sont conçues pour ça.
            </li>
            <li className="rounded-lg border border-line/50 p-2.5">
              Ouvrir un montage depuis la bibliothèque crédite un gabarit : six suffisent pour « Explorateur ».
            </li>
            <li className="rounded-lg border border-line/50 p-2.5">
              La série se joue au jour : revenir même cinq minutes maintient la flamme.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
