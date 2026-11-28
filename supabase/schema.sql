-- ============================================================================
--  Northev Spark — schéma Supabase
--  À exécuter dans l'éditeur SQL du projet Supabase (une seule fois).
--
--  Variables d'environnement attendues côté application :
--    SUPABASE_URL=https://xxxx.supabase.co
--    SUPABASE_SERVICE_ROLE_KEY=...          (serveur uniquement, jamais exposé)
--    NEXT_PUBLIC_SUPABASE_URL=...           (facultatif, même valeur)
--    NEXT_PUBLIC_SUPABASE_ANON_KEY=...      (lecture publique si RLS activée)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ profils
create table if not exists public.profiles (
  id            text primary key,
  email         text unique not null,
  name          text not null,
  avatar        text not null default 'circuit',
  theme         text not null default 'nuit',
  role          text not null default 'user' check (role in ('user', 'pro')),
  -- empreinte scrypt du mot de passe : indispensable pour retrouver un compte
  -- après un redéploiement (le système de fichiers serverless est éphémère).
  password_hash text,
  bio           text,
  institution   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- migration pour les bases créées avant l'ajout de ces colonnes
alter table public.profiles add column if not exists password_hash text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists institution text;

-- ------------------------------------------------------------------ montages
create table if not exists public.circuits (
  id             text primary key,
  owner_id       text not null references public.profiles (id) on delete cascade,
  name           text not null,
  notes          text not null default '',
  doc            jsonb not null,
  template_slug  text,
  status         text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starred        boolean not null default false,
  last_result    jsonb,
  collaborators  text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists circuits_owner_idx on public.circuits (owner_id);
create index if not exists circuits_updated_idx on public.circuits (updated_at desc);

-- ---------------------------------------------------------------- ateliers
create table if not exists public.rooms (
  code           text primary key check (code ~ '^[1-9][0-9]{4}$'),
  owner_id       text not null,
  owner_name     text not null,
  name           text not null,
  circuit_id     text not null references public.circuits (id) on delete cascade,
  doc            jsonb not null,
  revision       integer not null default 1,
  presence       jsonb not null default '{}',
  messages       jsonb not null default '[]',
  closed         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists rooms_open_idx on public.rooms (closed, updated_at desc);

-- ------------------------------------------------------------- événements
create table if not exists public.room_events (
  id          bigserial primary key,
  room_code   text not null,
  kind        text not null,
  user_id     text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists room_events_room_idx on public.room_events (room_code, created_at desc);

-- ------------------------------------------------------ sécurité (RLS)
alter table public.profiles    enable row level security;
alter table public.circuits    enable row level security;
alter table public.rooms       enable row level security;
alter table public.room_events enable row level security;

-- Aucune politique publique : les profils contiennent l'empreinte du mot de
-- passe et les adresses e-mail. L'application n'y accède que par la clé
-- service_role, côté serveur (route handlers Node), qui contourne la RLS.
-- Ne créez jamais de politique `using (true)` ici : la clé anon est publique.
drop policy if exists "profiles_public_read" on public.profiles;

-- Ceignez l'accès direct : même avec une clé anon, aucune ligne ne sort.
revoke all on public.profiles from anon, authenticated;
revoke all on public.circuits from anon, authenticated;
revoke all on public.rooms from anon, authenticated;
revoke all on public.room_events from anon, authenticated;

-- Si vous exposiez un jour l'API Supabase au navigateur, ajoutez des
-- politiques basées sur auth.uid() après avoir mappé vos comptes sur
-- Supabase Auth — ou restez sur les routes /api de cette application.

-- ------------------------------------------------------------------ trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists circuits_touch on public.circuits;
create trigger circuits_touch before update on public.circuits
  for each row execute function public.touch_updated_at();

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();
