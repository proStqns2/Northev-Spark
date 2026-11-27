'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Beaker,
  BookOpen,
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
  User,
  Users,
  X,
  Zap,
  Crown,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/auth/session';

const LINKS = [
  { href: '/academie', label: 'Académie', icon: GraduationCap, badge: 'NEW' },
  { href: '/studio', label: 'Studio', icon: CircuitBoard },
  { href: '/projets', label: 'Projets', icon: FolderKanban },
  { href: '/symboles', label: 'Symboles', icon: Shapes },
  { href: '/bibliotheque', label: 'Bibliothèque', icon: BookOpen },
  { href: '/multiwork', label: 'Multiwork', icon: Users },
  { href: '/labo', label: 'Labo', icon: Beaker },
  { href: '/quiz', label: 'Quiz', icon: ListChecks },
  { href: '/exercices', label: 'Exercices', icon: Dumbbell },
  { href: '/defis', label: 'Défis', icon: Target },
  { href: '/agents', label: 'Agents', icon: Sparkles },
  { href: '/premium', label: 'Premium', icon: Crown, badge: 'IA' },
  { href: '/export', label: 'Export', icon: FlaskConical },
  { href: '/express', label: 'Service R·C·L', icon: SlidersHorizontal, badge: 'API' },
];

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

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
            {/* monogramme isométrique officiel */}
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

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium transition',
                  'xl:gap-2 xl:px-2.5 xl:text-[13px]',
                  active
                    ? 'bg-ink-800/90 text-fg'
                    : 'text-fg-soft hover:bg-ink-850 hover:text-fg',
                )}
              >
                <Icon size={15} className={active ? 'text-spark-cyan' : ''} />
                <span className="hidden xl:inline">{link.label}</span>
                {link.badge ? (
                  <span className="hidden rounded-full border border-spark-violet/40 bg-spark-violet/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-spark-violet 2xl:inline">
                    {link.badge}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-spark-cyan to-transparent" />
                ) : null}
              </Link>
            );
          })}
        </nav>

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
                <span className="hidden max-w-[110px] truncate text-xs font-medium md:block">
                  {user.name}
                </span>
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
          <div className="grid gap-1">
            {LINKS.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm',
                    active ? 'bg-ink-800 text-fg' : 'text-fg-soft hover:bg-ink-850',
                  )}
                >
                  <Icon size={16} className={active ? 'text-spark-cyan' : ''} />
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/compte"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-fg-soft hover:bg-ink-850"
            >
              <User size={16} />
              Mon compte
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
