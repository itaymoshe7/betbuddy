-- ============================================================
-- BetBuddy Migration v4
-- Run in: Supabase SQL Editor
-- ============================================================

-- ── get_my_wagers ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS so participants see wagers they are linked to
-- via wager_participants even when the RLS policy only exposes creator wagers.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_wagers()
returns table (
  id                 uuid,
  creator_id         uuid,
  title              text,
  condition          text,
  stake              text,
  stake_type         text,
  monetary_value     numeric,
  deadline           timestamptz,
  status             text,
  result             text,
  friends            text[],
  created_at         timestamptz,
  creator_first_name text,
  creator_last_name  text
)
language plpgsql security definer set search_path = public
as $$
begin
  return query
    select
      w.id,
      w.creator_id,
      w.title,
      w.condition,
      w.stake,
      w.stake_type,
      w.monetary_value,
      w.deadline,
      w.status,
      w.result,
      w.friends,
      w.created_at,
      p.first_name,
      p.last_name
    from wagers w
    join profiles p on p.id = w.creator_id
    where
      w.creator_id = auth.uid()
      or exists (
        select 1 from wager_participants wp
        where wp.wager_id = w.id and wp.profile_id = auth.uid()
      )
    order by w.created_at desc;
end;
$$;

-- ── add_reciprocal_friend ────────────────────────────────────────────────────
-- Creates the friendship in BOTH directions so both users see each other
-- in "My Friends" immediately without a manual add-back.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.add_reciprocal_friend(
  p_friend_profile_id uuid,
  p_friend_name       text,
  p_friend_avatar     text,
  p_friend_phone      text
)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_my_id     uuid := auth.uid();
  v_my_name   text;
  v_my_avatar text;
  v_my_phone  text;
begin
  -- Fetch the current user's display info for the reverse entry
  select
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')),
    upper(left(coalesce(first_name, '?'), 2)),
    coalesce(phone, '')
  into v_my_name, v_my_avatar, v_my_phone
  from profiles where id = v_my_id;

  -- A → B  (insert into current user's friends list)
  if not exists (
    select 1 from friends
    where owner_id = v_my_id and profile_id = p_friend_profile_id
  ) then
    insert into friends (id, owner_id, name, phone, avatar, profile_id)
    values (gen_random_uuid(), v_my_id, p_friend_name, p_friend_phone, p_friend_avatar, p_friend_profile_id);
  end if;

  -- B → A  (insert into friend's friends list — they see us automatically)
  if not exists (
    select 1 from friends
    where owner_id = p_friend_profile_id and profile_id = v_my_id
  ) then
    insert into friends (id, owner_id, name, phone, avatar, profile_id)
    values (gen_random_uuid(), p_friend_profile_id, v_my_name, v_my_phone, v_my_avatar, v_my_id);
  end if;

  return 'ok';
end;
$$;
