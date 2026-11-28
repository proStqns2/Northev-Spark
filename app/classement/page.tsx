import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Flame, Medal, Trophy } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { leaderboard, rankOf } from '@/lib/db/progress';
import { levelOf } from '@/lib/learning/xp';
import { Avatar } from '@/components/ui/Avatar';

export const metadata: Metadata = {
  title: 'Classement',
  description: 'Classement de l’Académie : XP, séries et badges des apprenants Northev Spark.',
};

export const dynamic = 'force-dynamic';

const MEDALS = ['🥇', '🥈', '🥉'];

export default async function ClassementPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const [rows, rank] = await Promise.all([leaderboard(50), user ? rankOf(user.id) : Promise.resolve(null)]);

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">
              <Trophy size={12} /> Classement
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Les plus réguliers</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
              Classement par XP — leçons, quiz, défis et jours de série. {rank ? `Vous êtes ${rank.rank}ᵉ sur ${rank.total}.` : 'Connectez-vous pour apparaître au classement.'}
            </p>
          </div>
          <Link href="/academie" className="btn btn-sm border-line/60">
            Gagner de l’XP <ArrowRight size={12} />
          </Link>
        </header>

        {rows.length === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="text-[13px] font-medium">Le classement est vide</p>
            <p className="mt-1 text-[11.5px] text-fg-soft">
              Terminez une première leçon pour ouvrir le tableau.
            </p>
            <Link href="/academie" className="btn btn-primary btn-sm mt-3">
              Commencer l’académie <ArrowRight size={12} />
            </Link>
          </div>
        ) : (
          <ol className="mt-5 space-y-1.5">
            {rows.map((row, index) => {
              const level = levelOf(row.xp);
              const isMe = user?.id === row.userId;
              return (
                <li
                  key={row.userId}
                  className="panel flex items-center gap-3 px-3 py-2"
                  style={isMe ? { borderColor: '#38e1e655', boxShadow: 'inset 0 0 28px rgba(56,225,230,0.07)' } : undefined}
                >
                  <span className="w-6 text-center text-[12px] font-semibold text-fg-mute">
                    {index < 3 ? MEDALS[index] : index + 1}
                  </span>
                  <Avatar name={row.name} avatar={row.avatar} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">
                      {row.name}
                      {isMe ? <span className="ml-1.5 chip text-[9px]">vous</span> : null}
                    </p>
                    <p className="text-[10px] text-fg-mute">
                      Niv. {level.index} · {level.title} · {row.lessons} leçon(s) · {row.quizzes} quiz · {row.badges} badge(s)
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-spark-amber">
                    {row.streak >= 3 ? <Flame size={11} /> : null}
                    {row.xp} XP
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <section className="panel mt-5 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Medal size={13} className="text-spark-amber" /> Barème
          </h2>
          <ul className="mt-2 grid gap-1.5 text-[11.5px] text-fg-soft sm:grid-cols-2">
            <li className="rounded-lg border border-line/50 p-2.5">Leçon terminée : 40 XP (+10 si le quiz suit dans la journée).</li>
            <li className="rounded-lg border border-line/50 p-2.5">Quiz : jusqu’à ~90 XP selon le score, +30 XP si sans faute.</li>
            <li className="rounded-lg border border-line/50 p-2.5">Défi quotidien : 60 XP, plus le bonus de série de 15 XP par jour actif.</li>
            <li className="rounded-lg border border-line/50 p-2.5">Montage découvert : 5 XP — la curiosité compte.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
