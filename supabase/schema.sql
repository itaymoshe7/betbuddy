-- BetBuddy Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- NOTE: In Supabase Dashboard → Auth → Settings → disable "Confirm email" for dev

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid        primary key references auth.users on delete cascade,
  first_name text        not null,
  last_name  text        not null default '',
  phone      text        not null default '',
  email      text        not null,
  avatar_id  int         not null default 0,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- ── Friends ───────────────────────────────────────────────────────────────────
create table if not exists public.friends (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references public.profiles(id) on delete cascade,
  name       text        not null,
  phone      text        not null default '',
  avatar     text        not null,
  profile_id uuid        references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.friends enable row level security;

create policy "Users manage own friends"
  on public.friends for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ── Wagers ────────────────────────────────────────────────────────────────────
create table if not exists public.wagers (
  id         uuid        primary key default gen_random_uuid(),
  creator_id uuid        not null references public.profiles(id) on delete cascade,
  title      text        not null,
  condition  text        not null,
  stake      text        not null,
  deadline   text        not null,
  status     text        not null default 'pending',
  result     text,
  friends    jsonb       not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.wagers enable row level security;

-- ── Wager Participants (for shared realtime visibility) ───────────────────────
create table if not exists public.wager_participants (
  wager_id   uuid not null references public.wagers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (wager_id, profile_id)
);

alter table public.wager_participants enable row level security;

-- Wager RLS: creator or registered participant can see/update
create policy "Users see own and participant wagers"
  on public.wagers for select to authenticated using (
    auth.uid() = creator_id or
    exists (
      select 1 from public.wager_participants wp
      where wp.wager_id = id and wp.profile_id = auth.uid()
    )
  );

create policy "Users insert own wagers"
  on public.wagers for insert to authenticated with check (auth.uid() = creator_id);

create policy "Participants can update wagers"
  on public.wagers for update to authenticated using (
    auth.uid() = creator_id or
    exists (
      select 1 from public.wager_participants wp
      where wp.wager_id = id and wp.profile_id = auth.uid()
    )
  );

create policy "Creators delete own wagers"
  on public.wagers for delete to authenticated using (auth.uid() = creator_id);

-- wager_participants RLS
create policy "View own participant records"
  on public.wager_participants for select to authenticated
  using (
    auth.uid() = profile_id or
    exists (select 1 from public.wagers w where w.id = wager_id and w.creator_id = auth.uid())
  );

create policy "Creators manage participants"
  on public.wager_participants for insert to authenticated
  with check (
    exists (select 1 from public.wagers w where w.id = wager_id and w.creator_id = auth.uid())
  );

create policy "Creators delete participants"
  on public.wager_participants for delete to authenticated
  using (
    exists (select 1 from public.wagers w where w.id = wager_id and w.creator_id = auth.uid())
  );

-- ── Global Leaderboard Function (security definer = bypasses RLS) ─────────────
create or replace function public.get_leaderboard()
returns table(
  id         uuid,
  first_name text,
  last_name  text,
  avatar_id  int,
  wins       bigint,
  decided    bigint,
  total      bigint
)
security definer
set search_path = public
language sql stable as $$
  select
    p.id, p.first_name, p.last_name, p.avatar_id,
    count(w.id) filter (where w.result = 'won')         as wins,
    count(w.id) filter (where w.result is not null)     as decided,
    count(w.id)                                          as total
  from public.profiles p
  left join public.wagers w on w.creator_id = p.id
  group by p.id, p.first_name, p.last_name, p.avatar_id
  order by wins desc, decided desc
  limit 50;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.wagers;
alter publication supabase_realtime add table public.wager_participants;
