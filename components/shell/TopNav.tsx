'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Award,
  Beaker,
  BookOpen,
  ChevronDown,
  Dumbbell,
  FolderKanban,
  Shapes,
  CircuitBoard,
  FlaskConical,
  GraduationCap,
  ListChecks,
  LogOut,
  Menu,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  User,
  Users,
  Wrench,
  X,
  Zap,
  Crown,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Navigation principale.
 *
 * Avant : quatorze entrées à plat dans la barre du haut. Sur un écran normal,
 * la moitié était masquée derrière « … » ; sur téléphone, il fallait faire
 * défiler une liste interminable, et certaines pages semblaient inaccessibles.
 *
 * Maintenant : quatre accès directs (Studio, Académie, Projets, Multiwork) et
 * trois menus thématiques regroupés par intention — apprendre, s'entraîner,
 * outils. Chaque menu s'ouvre au clic comme au clavier, et la version mobile
 * reprend exactement la même arborescence.
 */

const PRIMARY = [
  { href: '/studio', label: 'Studio', icon: CircuitBoard },
  { href: '/academie', label: 'Académie', icon: GraduationCap },
  { href: '/projets', label: 'Projets', icon: FolderKanban },
  { href: '/multiwork', label: 'Multiwork', icon: Users },
] as const;

interface NavItem {
  href: string;
  label: string;
  icon: typeof BookOpen;
  hint: string;
  badge?: string;
}

const GROUPS: Array<{ id: string; label: string; icon: typeof BookOpen; items: NavItem[] }> = [
  {
    id: 'apprendre',
    label: 'Apprendre',
    icon: BookOpen,
    items: [
      { href: '/bibliotheque', label: 'Bibliothèque', icon: BookOpen, hint: 'Cours, fiches et méthodes' },
      { href: '/symboles', label: 'Symboles', icon: Shapes, hint: 'Les dipôles et leur contrat 2D' },
      { href: '/formules', label: 'Formules', icon: ListChecks, hint: 'Thévenin, Norton, diviseurs' },
      { href: '/glossaire', label: 'Glossaire', icon: Sparkles, hint: 'Le vocabulaire de l’électronicien' },
    ],
  },
  {
    id: 'entrainer',
    label: 'S’entraîner',
    icon: Dumbbell,
    items: [
      { href: '/exercices', label: 'Exercices', icon: Dumbbell, hint: 'Guidés, corrigés pas à pas' },
      { href: '/quiz', label: 'Quiz', icon: ListChecks, hint: 'Vérifier un point précis' },
      { href: '/defis', label: 'Défis', icon: Target, hint: 'Un objectif, un schéma à trouver' },
      { href: '/progression', label: 'Progression', icon: TrendingUp, hint: 'Vos résultats dans le temps' },
      { href: '/classement', label: 'Classement', icon: Trophy, hint: 'Comparer avec les autres' },
      { href: '/badges', label: 'Badges', icon: Award, hint: 'Les jalons déjà franchis' },
    ],
  },
  {
    id: 'outils',
    label: 'Outils',
    icon: Wrench,
    items: [
      { href: '/agents', label: 'Agents', icon: Sparkles, hint: 'Théo, Nora, Impéda, Volt…' },
      { href: '/labo', label: 'Labo', icon: Beaker, hint: 'Mesures et expériences' },
      { href: '/export', label: 'Export', icon: FlaskConical, hint: 'Rapport, SPICE, JSON' },
      { href: '/express', label: 'Service R·C·L', icon: SlidersHorizontal, hint: 'API de calcul', badge: 'API' },
      { href: '/assistant', label: 'Assistant IA', icon: Wrench, hint: 'Réglages de l’IA (opt-in)' },
      { href: '/premium', label: 'Premium', icon: Crown, hint: 'Les agents avancés', badge: 'IA' },
    ],
  },
];

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setGroup(null);
  }, [pathname]);

  // clic ailleurs ou Échap : on referme le menu ouvert
  useEffect(() => {
    if (!group) return;
    const onPointer = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setGroup(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGroup(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [group]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groupActive = (items: NavItem[]) => items.some((item) => isActive(item.href));

  return (
    <header
      className={cn(
        'sticky top-0 z-50 overflow-x-clip border-b transition duration-300',
        scrolled
          ? 'border-line/70 bg-ink-950/85 backdrop-blur-xl'
          : 'border-transparent bg-ink-950/40 backdrop-blur',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          href="/"
          className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
          aria-label="Northev Spark — accueil"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line/60 bg-[#ececeb] shadow-glow-sm transition group-hover:border-spark-cyan/50 sm:h-9 sm:w-9">
            <Image
              src="/brand/logo-192.png"
              alt=""
              width={36}
              height={36}
              className="h-[30px] w-[30px] object-contain transition group-hover:scale-[1.06] sm:h-[34px] sm:w-[34px]"
              priority
            />
          </span>
          <span className="hidden min-w-0 flex-col leading-none min-[380px]:flex">
            <span className="truncate text-[15px] font-semibold tracking-tight">
              Northev<span className="text-spark-cyan"> Spark</span>
            </span>
            <span className="mt-0.5 hidden truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-mute sm:block">
              équivalents T · N
            </span>
          </span>
        </Link>

        <div ref={navRef} className="ml-3 hidden items-center gap-0.5 lg:flex">
          {PRIMARY.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition xl:text-[13px]',
                  active ? 'bg-ink-800/90 text-fg' : 'text-fg-soft hover:bg-ink-850 hover:text-fg',
                )}
              >
                <Icon size={15} className={active ? 'text-spark-cyan' : ''} />
                {link.label}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-spark-cyan to-transparent" />
                ) : null}
              </Link>
            );
          })}

          {GROUPS.map((entry) => {
            const Icon = entry.icon;
            const active = groupActive(entry.items);
            const opened = group === entry.id;
            return (
              <div key={entry.id} className="relative">
                <button
                  type="button"
                  onClick={() => setGroup((current) => (current === entry.id ? null : entry.id))}
                  aria-expanded={opened}
                  aria-haspopup="true"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition xl:text-[13px]',
                    active || opened
                      ? 'bg-ink-800/90 text-fg'
                      : 'text-fg-soft hover:bg-ink-850 hover:text-fg',
                  )}
                >
                  <Icon size={15} className={active ? 'text-spark-cyan' : ''} />
                  {entry.label}
                  <ChevronDown
                    size={12}
                    className={cn('text-fg-mute transition', opened && 'rotate-180 text-spark-cyan')}
                  />
                </button>

                {opened ? (
                  <div className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-xl border border-line/70 bg-ink-950/98 p-1.5 shadow-panel backdrop-blur-xl">
                    {entry.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-start gap-2 rounded-lg px-2 py-1.5 transition',
                            isActive(item.href) ? 'bg-spark-cyan/10' : 'hover:bg-ink-850',
                          )}
                        >
                          <ItemIcon
                            size={14}
                            className={cn('mt-0.5 shrink-0', isActive(item.href) ? 'text-spark-cyan' : 'text-fg-mute')}
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                              {item.label}
                              {item.badge ? (
                                <span className="rounded-full border border-spark-violet/40 bg-spark-violet/15 px-1 py-px font-mono text-[8.5px] uppercase tracking-wider text-spark-violet">
                                  {item.badge}
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-[10.5px] text-fg-mute">{item.hint}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href={user ? '/studio' : '/compte?mode=inscription'}
            className="btn btn-primary btn-sm shrink-0 px-2 sm:px-3"
            aria-label={user ? 'Ouvrir le studio' : 'Créer un compte'}
            title={user ? 'Ouvrir le studio' : 'Créer un compte'}
          >
            <Zap size={14} />
            <span className="hidden sm:inline">{user ? 'Ouvrir le studio' : 'Créer un compte'}</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/compte"
                className="flex items-center gap-2 rounded-xl border border-line/60 bg-ink-900/80 p-1 transition hover:border-spark-cyan/50 sm:py-1.5 sm:pl-1.5 sm:pr-3"
                title={user.name}
              >
                <Avatar name={user.name} avatar={user.avatar} size={26} />
                <span className="hidden max-w-[110px] truncate text-xs font-medium md:block">{user.name}</span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="btn btn-ghost btn-sm w-8 shrink-0 px-0 sm:w-auto sm:px-2"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link href="/compte" className="btn btn-ghost btn-sm shrink-0 px-2">
              <User size={15} />
              <span className="hidden sm:inline">Connexion</span>
            </Link>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm w-8 shrink-0 px-0 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-line/60 bg-ink-950/95 px-3 py-3 backdrop-blur-xl sm:px-4 lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {PRIMARY.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-[13px]',
                    active ? 'bg-ink-800 text-fg' : 'text-fg-soft hover:bg-ink-850',
                  )}
                >
                  <Icon size={16} className={active ? 'text-spark-cyan' : ''} />
                  {link.label}
                </Link>
              );
            })}
          </div>

          {GROUPS.map((entry) => (
            <div key={entry.id} className="mt-3">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-mute">
                <entry.icon size={11} /> {entry.label}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {entry.items.map((item) => {
                  const ItemIcon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px]',
                        active ? 'bg-spark-cyan/10 text-fg' : 'text-fg-soft hover:bg-ink-850',
                      )}
                    >
                      <ItemIcon size={14} className={active ? 'text-spark-cyan' : 'text-fg-mute'} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <Link
            href="/compte"
            className="mt-3 flex items-center gap-2.5 rounded-lg border border-line/60 px-3 py-2.5 text-sm text-fg-soft hover:bg-ink-850"
          >
            <User size={16} /> Mon compte
          </Link>
        </div>
      ) : null}
    </header>
  );
}
