-- BetBuddy Migration v3
-- Run this in Supabase SQL Editor AFTER migration_v2.sql

-- ── Add approved column to wager_participants ────────────────────────────────
alter table public.wager_participants
  add column if not exists approved boolean not null default false;

-- ── Allow participants to mark themselves as approved ────────────────────────
-- Drop if already exists to keep idempotent
drop policy if exists "Participants update own row" on public.wager_participants;

create policy "Participants update own row"
  on public.wager_participants for update to authenticated
  using  (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ── Atomic approve_wager RPC ─────────────────────────────────────────────────
-- Uses SECURITY DEFINER so it can read all participant rows regardless of RLS,
-- then activates the wager once everyone has approved.
create or replace function public.approve_wager(p_wager_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_count int;
begin
  -- Mark this participant as approved
  update wager_participants
     set approved = true
   where wager_id   = p_wager_id
     and profile_id = auth.uid();

  if not found then
    return 'not_participant';
  end if;

  -- Count remaining unapproved participants
  select count(*) into v_pending_count
    from wager_participants
   where wager_id = p_wager_id
     and approved = false;

  if v_pending_count = 0 then
    -- Everyone approved — activate the wager
    update wagers
       set status = 'pending'
     where id = p_wager_id;
    return 'activated';
  end if;

  return 'approved';
end;
$$;

-- ── Atomic decline_wager RPC ─────────────────────────────────────────────────
create or replace function public.decline_wager(p_wager_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller is a participant
  if not exists (
    select 1 from wager_participants
     where wager_id = p_wager_id and profile_id = auth.uid()
  ) then
    return 'not_participant';
  end if;

  -- Mark the whole wager as declined
  update wagers
     set status = 'declined'
   where id = p_wager_id;

  return 'declined';
end;
$$;
