import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, Flame, Target, Trophy } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { userProgress } from '@/lib/db/progress';
import { challengeFor, recentChallenges } from '@/lib/learning/challenges';
import { todayIso } from '@/lib/learning/xp';
import { ChallengeCard } from '@/components/learning/ChallengeCard';
import { StatCard } from '@/components/learning/visuals';

export const metadata: Metadata = {
  title: 'Défis quotidiens',
  description:
    'Un défi de calcul par jour, tiré des 15 montages et vérifié par le moteur : trouvez la bonne valeur et gagnez de l’XP.',
};

export const dynamic = 'force-dynamic';

export default async function DefisPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const progress = user ? await userProgress(user.id) : null;

  const today = todayIso();
  const challenge = challengeFor(today);
  const history = recentChallenges(today, 7);
  const solvedToday = progress ? Boolean(progress.challenges[challenge.id]) : false;
  const solvedTotal = progress ? Object.keys(progress.challenges).length : 0;

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">
              <Target size={12} /> Défi quotidien
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Un calcul par jour</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
              Le défi est tiré d’un montage réel et sa cible est calculée par le moteur — impossible de la deviner.
              Tolérance de 5 %, comme sur une copie d’examen.
            </p>
          </div>
          <Link href="/academie" className="btn btn-sm border-line/60">
            Académie <ArrowRight size={12} />
          </Link>
        </header>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <StatCard label="Défis résolus" value={solvedTotal} sub="depuis le début" accent="#ffc266" icon={<Trophy size={15} />} />
          <StatCard label="Série" value={`${progress?.streak ?? 0} j`} sub={`record ${progress?.bestStreak ?? 0} j`} accent="#ff7d6b" icon={<Flame size={15} />} />
          <StatCard label="Aujourd’hui" value={solvedToday ? 'résolu' : 'à faire'} sub={`${challenge.target.unit} · ±${challenge.target.tolerance}`} accent="#46e6a0" icon={<CalendarCheck size={15} />} />
        </div>

        <div className="mt-4">
          <ChallengeCard challenge={challenge} signedIn={Boolean(user)} solved={solvedToday} />
        </div>

        <section className="mt-6">
          <h2 className="text-[13.5px] font-semibold">Les sept derniers défis</h2>
          <p className="text-[11px] text-fg-mute">Chaque jour change de montage et de grandeur demandée.</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {history.map((item) => {
              const solved = progress ? Boolean(progress.challenges[item.id]) : false;
              const isToday = item.date === today;
              return (
                <li key={item.id} className="panel flex items-start gap-3 p-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                    style={{
                      background: solved ? 'rgba(70,230,160,0.14)' : 'rgba(255,255,255,0.04)',
                      color: solved ? '#46e6a0' : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    {new Date(`${item.date}T00:00:00Z`).getUTCDate()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium">
                      {item.title} {isToday ? <span className="chip ml-1 text-[9px]">aujourd’hui</span> : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-fg-soft">{item.brief}</p>
                    <p className="mt-1 text-[10px] text-fg-mute">
                      {item.template} · cible {item.target.value} {item.target.unit}
                      {solved ? ' · résolu' : ''}
                    </p>
                  </div>
                  <Link
                    href={`/studio?template=${item.template}`}
                    className="btn btn-ghost btn-sm shrink-0"
                    title="Ouvrir le montage"
                  >
                    <ArrowRight size={11} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel mt-6 p-4">
          <h2 className="text-[13px] font-semibold">Méthode de résolution</h2>
          <ol className="mt-2 grid gap-1.5 text-[11.5px] text-fg-soft sm:grid-cols-2">
            <li className="rounded-lg border border-line/50 p-2.5">1. Identifiez la grandeur demandée : tension à vide ou résistance équivalente.</li>
            <li className="rounded-lg border border-line/50 p-2.5">2. Éteignez mentalement les sources : source de tension → fil, source de courant → coupure.</li>
            <li className="rounded-lg border border-line/50 p-2.5">3. Réduisez série et parallèle avant de sortir la calculatrice.</li>
            <li className="rounded-lg border border-line/50 p-2.5">4. Vérifiez l’ordre de grandeur : des kΩ donnent des mA sous quelques volts.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
