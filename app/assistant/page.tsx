import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bot, CircuitBoard, ShieldCheck } from 'lucide-react';
import { AssistantClient } from './AssistantClient';

export const metadata: Metadata = {
  title: 'Assistant',
  description:
    'Assistant IA séparé du compte et du studio : désactivé par défaut, activé à la demande, sans jamais bloquer le calcul ni la construction.',
};

export const dynamic = 'force-dynamic';

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
            <Bot size={12} /> Zone séparée
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Assistant facultatif</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
            Le compte, le studio, l’académie et le laboratoire n’appellent aucune IA. Cet espace est le seul
            endroit d’où partent des requêtes vers un modèle, et il reste éteint tant que vous ne l’avez pas
            activé.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className="btn btn-primary btn-sm">
            <CircuitBoard size={12} /> Retour au studio
          </Link>
          <Link href="/compte" className="btn btn-sm border-line/60">
            <ShieldCheck size={12} /> Mon compte <ArrowRight size={12} />
          </Link>
        </div>
      </header>

      <div className="mt-5">
        <AssistantClient />
      </div>
    </div>
  );
}
