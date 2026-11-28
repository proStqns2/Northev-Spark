import Link from 'next/link';
import { CircuitBoard, Compass, Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-spark-cyan/40 bg-spark-cyan/[0.07] text-spark-cyan shadow-glow-sm">
        <CircuitBoard size={24} />
      </span>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.25em] text-fg-mute">Erreur 404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Circuit ouvert : cette page n’existe pas.
      </h1>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-fg-soft">
        Le chemin demandé ne mène à aucun nœud du site. Reprenez depuis le studio, ou explorez la bibliothèque de
        montages.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn">
          <Home size={15} /> Accueil
        </Link>
        <Link href="/studio" className="btn btn-primary">
          <Compass size={15} /> Ouvrir le studio
        </Link>
        <Link href="/bibliotheque" className="btn btn-ghost">
          <Search size={15} /> Bibliothèque
        </Link>
      </div>
    </div>
  );
}
