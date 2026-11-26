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
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

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

-- Lecture publique des profils limitée aux colonnes non sensibles
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles
  for select using (true);

-- Le serveur utilise la clé service_role, qui contourne ces politiques.
-- Si vous exposez l'API Supabase directement au navigateur, ajoutez des
-- politiques basées sur auth.uid() après avoir mappé vos comptes sur
-- Supabase Auth, ou passez exclusivement par les routes /api de cette app.

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
