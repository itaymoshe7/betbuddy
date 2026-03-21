-- BetBuddy Migration v2
-- Run this in Supabase SQL Editor AFTER the original schema.sql

-- ── Add monetary fields to wagers ─────────────────────────────────────────────
alter table public.wagers
  add column if not exists stake_type     text    not null default 'other',
  add column if not exists monetary_value numeric;

-- ── Wager Approvals ───────────────────────────────────────────────────────────
-- Tracks per-participant approval status for new wagers
create table if not exists public.wager_approvals (
  id         uuid        primary key default gen_random_uuid(),
  wager_id   uuid        not null references public.wagers(id)  on delete cascade,
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  status     text        not null default 'pending', -- 'pending' | 'approved' | 'declined'
  created_at timestamptz not null default now(),
  unique(wager_id, profile_id)
);

alter table public.wager_approvals enable row level security;

-- Participants see their own approvals; creators see all for their wagers
create policy "View relevant approvals"
  on public.wager_approvals for select to authenticated using (
    auth.uid() = profile_id or
    exists (select 1 from public.wagers w where w.id = wager_id and w.creator_id = auth.uid())
  );

create policy "Creators insert approvals"
  on public.wager_approvals for insert to authenticated
  with check (
    exists (select 1 from public.wagers w where w.id = wager_id and w.creator_id = auth.uid())
  );

create policy "Participants update own approval"
  on public.wager_approvals for update to authenticated
  using (auth.uid() = profile_id);

-- Enable realtime for approval notifications
alter publication supabase_realtime add table public.wager_approvals;
