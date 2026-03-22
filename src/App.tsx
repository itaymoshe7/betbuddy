import { useState, useEffect, useRef } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { Zap, Swords, Menu, X, LogOut, UserCog, Bell, CheckCircle, XCircle, RefreshCw, LayoutDashboard } from 'lucide-react';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import WagerCard from './components/WagerCard';
import Welcome from './components/Welcome';
import ResetPassword from './components/ResetPassword';
import ProfilePage from './components/ProfilePage';
import NewsFeed from './components/NewsFeed';
import type { Wager, WagerStatus, Friend, UserProfile, LeaderboardEntry } from './types';
import { getPersonalResult, isActiveForUser } from './lib/wagerUtils';
import { AVATARS } from './avatars';
import { requestPermission, isPermissionGranted, sendNotification } from './notifications';
import './index.css';

const NOTIF_KEY  = 'betbuddy_notifications';
const MIGR_KEY   = 'betbuddy_migrated_v1';
// 'Pending' tab → pending_approval wagers; 'Active' tab → in-progress (pending) wagers
const FILTERS    = ['All', 'Pending', 'Active', 'Won', 'Lost', 'Settled', 'News'] as const;
type Filter = (typeof FILTERS)[number];

// ── Wager fetcher: RPC with manual fallback ─────────────────────────────────
// Tries get_my_wagers() first (SECURITY DEFINER, bypasses RLS).
// If the migration hasn't been run yet the RPC will error — falls back to
// a two-query approach that fetches creator wagers + participant wagers separately.

async function fetchAllWagers(userId: string): Promise<Record<string, unknown>[]> {
  // ── Primary: SECURITY DEFINER RPC ───────────────────────────────────────
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_wagers');
  if (!rpcError && Array.isArray(rpcData)) {
    console.log('[fetchAllWagers] RPC ok, rows:', rpcData.length);
    console.log('Fetched Wagers:', (rpcData as Record<string, unknown>[]).map((r) => ({
      id: (r.id as string)?.slice(0, 8),
      status: r.status,
      creator: (r.creator_id as string)?.slice(0, 8),
    })));
    return rpcData as Record<string, unknown>[];
  }
  if (rpcError) {
    console.warn('[fetchAllWagers] RPC unavailable, falling back to manual fetch:', rpcError.message);
  }

  // ── Fallback: two-query join ─────────────────────────────────────────────
  const [{ data: creatorRows, error: cErr }, { data: participations, error: pErr }] = await Promise.all([
    supabase
      .from('wagers')
      .select('*, creator:profiles!creator_id(first_name,last_name)')
      .eq('creator_id', userId),
    supabase
      .from('wager_participants')
      .select('wager_id')
      .eq('profile_id', userId),
  ]);
  if (cErr) console.error('[fetchAllWagers] creator wagers error:', cErr);
  if (pErr) console.error('[fetchAllWagers] wager_participants error:', pErr);

  const participantWagerIds = (participations ?? []).map((p: { wager_id: string }) => p.wager_id);

  let participantRows: Record<string, unknown>[] = [];
  if (participantWagerIds.length > 0) {
    const { data: pWagers, error: pwErr } = await supabase
      .from('wagers')
      .select('*, creator:profiles!creator_id(first_name,last_name)')
      .in('id', participantWagerIds);
    if (pwErr) console.error('[fetchAllWagers] participant wagers error:', pwErr);
    participantRows = (pWagers ?? []) as Record<string, unknown>[];
  }

  // Deduplicate (a wager may be both created by and participated in by the user)
  const seen = new Set<string>();
  const merged = [...(creatorRows ?? []), ...participantRows].filter((r) => {
    const id = (r as Record<string, unknown>).id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }) as Record<string, unknown>[];

  console.log('[fetchAllWagers] Fallback result — creator:', (creatorRows ?? []).length,
    '| participant-only:', participantRows.length, '| merged:', merged.length);
  console.log('Fetched Wagers:', merged.map((r) => ({
    id: (r.id as string)?.slice(0, 8), status: r.status, creator: (r.creator_id as string)?.slice(0, 8),
  })));
  return merged;
}

// ── DB row helpers ──────────────────────────────────────────────────────────

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id:             row.id as string,
    firstName:      row.first_name as string,
    lastName:       (row.last_name  as string) ?? '',
    phone:          (row.phone      as string) ?? '',
    email:          (row.email      as string) ?? '',
    avatarId:       (row.avatar_id  as number) ?? 0,
    profilePicture: (row.avatar_url as string | null) ?? undefined,
    memberSince:    (row.created_at as string | null) ?? undefined,
  };
}

// Marks an active wager as 'overdue' when its deadline has passed (client-side only)
function applyOverdue(w: Wager): Wager {
  if ((w.status === 'pending' || w.status === 'active') && w.deadline && new Date(w.deadline) < new Date()) {
    return { ...w, status: 'overdue' };
  }
  return w;
}

function mapWager(row: Record<string, unknown>): Wager {
  const raw     = row.friends as string[] | null;
  const friends: string[] = Array.isArray(raw) ? raw : [];

  // Handle both JOIN format (row.creator = {first_name, last_name})
  // and flat RPC format (row.creator_first_name, row.creator_last_name)
  let creatorName = '';
  if (row.creator && typeof row.creator === 'object') {
    const c = row.creator as { first_name?: string; last_name?: string };
    creatorName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  } else if (row.creator_first_name) {
    creatorName = `${row.creator_first_name ?? ''} ${row.creator_last_name ?? ''}`.trim();
  }

  // Normalise 'active' → keep as-is; it is now a valid WagerStatus value
  const rawStatus = (row.status as string) ?? 'pending';
  const status: WagerStatus = (
    rawStatus === 'active' || rawStatus === 'pending' || rawStatus === 'pending_approval' ||
    rawStatus === 'overdue' || rawStatus === 'awaiting_payment' || rawStatus === 'won' ||
    rawStatus === 'lost' || rawStatus === 'settled' || rawStatus === 'declined'
  ) ? rawStatus as WagerStatus : 'pending';

  return {
    id:            (row.id            as string) ?? '',
    creatorId:     (row.creator_id    as string) ?? '',
    creatorName,
    title:         (row.title         as string) ?? '',
    condition:     (row.condition     as string) ?? '',
    stake:         (row.stake         as string) ?? '',
    stakeType:     (row.stake_type    as 'money' | 'other') ?? 'other',
    monetaryValue: (row.monetary_value as number | null) ?? undefined,
    deadline:      (row.deadline      as string) ?? '',
    createdAt:     (row.created_at    as string | null) ?? undefined,
    status,
    result:        (row.result        as 'won' | 'lost' | null) ?? undefined,
    friends,
  };
}


function mapFriend(row: Record<string, unknown>): Friend {
  return {
    id:        row.id         as string,
    name:      row.name       as string,
    avatar:    row.avatar     as string,
    phone:     (row.phone     as string | null) || undefined,
    profileId: (row.profile_id as string | null) || undefined,
  };
}

// ── LocalStorage migration (runs once on first login) ──────────────────────

async function migrateLocalStorage(userId: string) {
  if (localStorage.getItem(MIGR_KEY)) return;
  try {
    const rawFriends = localStorage.getItem('betbuddy_friends_v2');
    if (rawFriends) {
      const lf = JSON.parse(rawFriends) as Array<{ id?: string; name: string; phone?: string; avatar?: string }>;
      if (lf.length > 0) {
        await supabase.from('friends').upsert(
          lf.map((f) => ({
            id:       f.id ?? crypto.randomUUID(),
            owner_id: userId,
            name:     f.name,
            phone:    f.phone ?? '',
            avatar:   f.avatar ?? f.name.slice(0, 2).toUpperCase(),
          })),
          { onConflict: 'id' }
        );
      }
    }
    const rawWagers = localStorage.getItem('betbuddy_wagers_v3');
    if (rawWagers) {
      const lw = JSON.parse(rawWagers) as Array<Record<string, unknown>>;
      if (lw.length > 0) {
        await supabase.from('wagers').upsert(
          lw.map((w) => ({
            id:         w.id ?? crypto.randomUUID(),
            creator_id: userId,
            title:      w.title,
            condition:  w.condition,
            stake:      w.stake,
            deadline:   w.deadline,
            status:     w.status ?? 'pending',
            result:     w.result ?? null,
            friends:    Array.isArray(w.friends) ? w.friends : (w.friend ? [w.friend] : []),
          })),
          { onConflict: 'id' }
        );
      }
    }
  } catch (err) {
    console.warn('Migration error:', err);
  } finally {
    localStorage.setItem(MIGR_KEY, 'true');
  }
}

export default function App() {
  const [session,            setSession]            = useState<Session | null>(null);
  const [profile,            setProfile]            = useState<UserProfile | null>(null);
  const [wagers,             setWagers]             = useState<Wager[]>([]);
  const [friends,            setFriends]            = useState<Friend[]>([]);
  const [leaderboard,        setLeaderboard]        = useState<LeaderboardEntry[]>([]);
  const [loading,            setLoading]            = useState(true);
  const [editingProfile,     setEditingProfile]     = useState(false);
  const [activeFilter,       setActiveFilter]       = useState<Filter>('All');
  const [profileMenuOpen,    setProfileMenuOpen]    = useState(false);
  const [sidebarOpen,        setSidebarOpen]        = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIF_KEY) === 'true' && isPermissionGranted()
  );
  const [globalToast,     setGlobalToast]     = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [refreshing,      setRefreshing]      = useState(false);
  const [passwordRecovery,  setPasswordRecovery]  = useState(false);
  const [viewingProfile,    setViewingProfile]    = useState(false);
  // Tracks wagers this user already approved in the current session (so they vanish from Pending Approvals immediately)
  const [approvedByMe,    setApprovedByMe]    = useState<Set<string>>(new Set());

  const profileMenuRef   = useRef<HTMLDivElement>(null);
  const realtimeRef      = useRef<RealtimeChannel | null>(null);
  const notifEnabledRef  = useRef(notificationsEnabled);

  // Keep notifEnabledRef in sync so realtime callbacks see current value
  useEffect(() => { notifEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);

  // Auto-dismiss global toast after 4 s
  useEffect(() => {
    if (!globalToast) return;
    const t = setTimeout(() => setGlobalToast(null), 4000);
    return () => clearTimeout(t);
  }, [globalToast]);

  // ── Auth bootstrap ────────────────────────────────────────────────────────
  // Only onAuthStateChange — no getSession() call.
  // Supabase v2 fires INITIAL_SESSION immediately with the persisted session,
  // which avoids the double-load race that happens when both getSession and
  // INITIAL_SESSION are used together.  loadedRef was removed for the same
  // reason: it persists across React StrictMode remounts, preventing the
  // second mount from ever calling setLoading(false) → blank screen.

  useEffect(() => {
    console.log('[Auth] Bootstrap: subscribing to onAuthStateChange');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[Auth] event:', event, s ? `user=${s.user.id}` : 'none');
      setSession(s);

      if (event === 'INITIAL_SESSION') {
        // Fires once on mount with the persisted session (or null if logged out)
        if (s) {
          loadUserData(s.user.id);
        } else {
          setLoading(false);
        }
      } else if (event === 'SIGNED_IN') {
        // Fires when the user completes login/signup from the Welcome screen
        loadUserData(s!.user.id);
      } else if (event === 'PASSWORD_RECOVERY') {
        // User clicked the recovery link from email — show the set-new-password screen
        setPasswordRecovery(true);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setWagers([]);
        setFriends([]);
        setLeaderboard([]);
        setApprovedByMe(new Set());
        setPasswordRecovery(false);
        setLoading(false);
        realtimeRef.current?.unsubscribe();
        realtimeRef.current = null;
      }
      // TOKEN_REFRESHED, USER_UPDATED etc. don't reload data
    });

    return () => {
      console.log('[Auth] Cleanup: unsubscribing');
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUserData(userId: string) {
    console.log('[loadUserData] Starting for user:', userId);
    setLoading(true);
    try {
      const [{ data: pRow, error: pErr }, allWagerRows, { data: fRows, error: fErr }, { data: lb, error: lbErr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        // fetchAllWagers: tries get_my_wagers() RPC (SECURITY DEFINER, bypasses RLS)
        // then falls back to a manual two-query join if the migration hasn't run yet.
        fetchAllWagers(userId),
        supabase.from('friends').select('*').eq('owner_id', userId).order('created_at'),
        supabase.rpc('get_leaderboard'),
      ]);
      if (pErr)  console.error('[loadUserData] profiles error:', pErr);
      if (fErr)  console.error('[loadUserData] friends error:', fErr);
      if (lbErr) console.error('[loadUserData] leaderboard error:', lbErr);

      console.log('[loadUserData] Got profile:', !!pRow, '| wagers:', allWagerRows.length, '| friends:', fRows?.length ?? 0);

      if (pRow) setProfile(mapProfile(pRow as Record<string, unknown>));
      setWagers(allWagerRows.map((r: Record<string, unknown>) => applyOverdue(mapWager(r))));
      setFriends((fRows ?? []).map((r) => mapFriend(r as Record<string, unknown>)));
      setLeaderboard((lb ?? []).map((r: Record<string, unknown>) => ({
        id:        r.id        as string,
        firstName: r.first_name as string,
        lastName:  r.last_name  as string,
        avatarId:  r.avatar_id  as number,
        wins:      Number(r.wins),
        decided:   Number(r.decided),
        total:     Number(r.total),
      })));
      setupRealtime(userId);
      await migrateLocalStorage(userId);
      console.log('[loadUserData] Done.');
    } catch (err) {
      console.error('[loadUserData] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }

  function setupRealtime(userId: string) {
    console.log('[Realtime] Setting up channel for user:', userId);
    realtimeRef.current?.unsubscribe();

    async function handleIncomingWager(w: Wager) {
      const { data: creator } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', w.creatorId)
        .single();
      const name = creator
        ? `${creator.first_name as string} ${creator.last_name as string}`.trim()
        : 'A friend';
      setGlobalToast({ msg: `🎲 New bet from ${name}! Stake: ${w.stake}`, type: 'info' });
      if (notifEnabledRef.current) {
        sendNotification(`New Wager from ${name}!`, `Stake: ${w.stake}. Check it out now!`);
      }
    }

    const channel = supabase
      .channel(`betbuddy-${userId}`)
      // ── Wager changes (INSERT / UPDATE / DELETE) ──────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, (payload) => {
        console.log('[Realtime] wagers event:', payload.eventType, (payload.new as Record<string, unknown>)?.id ?? (payload.old as Record<string, unknown>)?.id);
        if (payload.eventType === 'INSERT') {
          const w = applyOverdue(mapWager(payload.new as Record<string, unknown>));
          setWagers((prev) => {
            if (prev.some((x) => x.id === w.id)) return prev;
            if (w.creatorId !== userId) void handleIncomingWager(w);
            return [w, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = applyOverdue(mapWager(payload.new as Record<string, unknown>));
          setWagers((prev) => prev.map((x) => {
            if (x.id !== updated.id) return x;
            // Realtime payload has no JOIN — keep existing creatorName
            return { ...updated, creatorName: x.creatorName || updated.creatorName };
          }));
        } else if (payload.eventType === 'DELETE') {
          setWagers((prev) => prev.filter((x) => x.id !== (payload.old as { id: string }).id));
        }
      })
      // ── Friend added reciprocally by another user ─────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends' }, (payload) => {
        const row = payload.new as { id: string; owner_id: string; name: string; avatar: string; phone: string; profile_id: string | null };
        if (row.owner_id !== userId) return; // only our own friends-list rows
        setFriends((prev) => {
          if (prev.some((f) => f.id === row.id)) return prev;
          return [...prev, { id: row.id, name: row.name, avatar: row.avatar, phone: row.phone || undefined, profileId: row.profile_id || undefined }];
        });
      })
      // ── Participant link created (another user added us to a wager) ───────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wager_participants' }, async (payload) => {
        const row = payload.new as { wager_id: string; profile_id: string };
        if (row.profile_id !== userId) return;
        const { data: wRow } = await supabase.from('wagers').select('*, creator:profiles!creator_id(first_name,last_name)').eq('id', row.wager_id).single();
        if (!wRow) return;
        const w = applyOverdue(mapWager(wRow as Record<string, unknown>));
        setWagers((prev) => {
          if (prev.some((x) => x.id === w.id)) return prev;
          void handleIncomingWager(w);
          return [w, ...prev];
        });
      })
      .subscribe((status, err) => {
        if (err) console.error('[Realtime] Subscribe error:', err);
        else console.log('[Realtime] Channel status:', status);
      });

    realtimeRef.current = channel;
  }

  // ── Auto-request notifications ────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return;
    if ('Notification' in window && Notification.permission === 'default') {
      requestPermission().then((granted) => {
        if (granted) { setNotificationsEnabled(true); localStorage.setItem(NOTIF_KEY, 'true'); }
      });
    }
  }, [profile]);

  // ── Close profile menu on outside click ───────────────────────────────────

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node))
        setProfileMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Body scroll lock on mobile sidebar ───────────────────────────────────

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleProfileComplete(p: UserProfile) {
    setProfile(p);
    setEditingProfile(false);
  }

  async function handleLogout() {
    if (!confirm('Sign out? Your data is saved in the cloud.')) return;
    realtimeRef.current?.unsubscribe();
    await supabase.auth.signOut();
    setProfileMenuOpen(false);
  }

  async function handleToggleNotifications() {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIF_KEY, 'false');
    } else {
      const granted = await requestPermission();
      setNotificationsEnabled(granted);
      localStorage.setItem(NOTIF_KEY, String(granted));
    }
  }

  async function refreshWagers() {
    if (!profile || refreshing) return;
    setRefreshing(true);
    try {
      const rows = await fetchAllWagers(profile.id);
      setWagers(rows.map((r) => applyOverdue(mapWager(r))));
    } finally {
      setRefreshing(false);
    }
  }

  async function addWager(wager: Wager) {
    // Detect registered participants to decide on approval flow
    const participantIds = wager.friends
      .map((name) => friends.find((f) => f.name === name)?.profileId)
      .filter(Boolean) as string[];
    const needsApproval = participantIds.length > 0;
    const status = needsApproval ? 'pending_approval' : 'pending';

    const { data, error } = await supabase.from('wagers').insert({
      id:             wager.id,
      creator_id:     profile!.id,
      title:          wager.title,
      condition:      wager.condition,
      stake:          wager.stake,
      stake_type:     wager.stakeType,
      monetary_value: wager.monetaryValue ?? null,
      deadline:       wager.deadline,
      status,
      result:         wager.result ?? null,
      friends:        wager.friends,
    }).select().single();

    if (error) { console.error('addWager:', error); return; }

    // Link registered friends as participants (approved=false by default)
    if (participantIds.length > 0) {
      await supabase.from('wager_participants').insert(
        participantIds.map((pid) => ({ wager_id: data.id, profile_id: pid, approved: false }))
      );
    }

    setWagers((prev) => [applyOverdue({ ...wager, creatorId: profile!.id, status }), ...prev]);
  }

  async function approveWager(wagerId: string) {
    console.log('[approveWager] Calling RPC for wager:', wagerId);
    const { data: result, error } = await supabase.rpc('approve_wager', { p_wager_id: wagerId });
    if (error) {
      console.error('[approveWager] RPC error:', error);
      setGlobalToast({ msg: `Approval failed: ${error.message}`, type: 'error' });
      return;
    }
    console.log('[approveWager] RPC result:', result);
    if (result === 'not_participant') {
      setGlobalToast({ msg: 'You are not a participant of this wager.', type: 'error' });
      return;
    }
    // Hide from Pending Approvals immediately regardless of activation state
    setApprovedByMe((prev) => new Set([...prev, wagerId]));
    if (result === 'activated') {
      // All participants approved — move wager to active grid right away
      setWagers((prev) => prev.map((w) => w.id === wagerId ? { ...w, status: 'pending' } : w));
      setGlobalToast({ msg: '🎲 Wager approved and now active!', type: 'success' });
    } else {
      setGlobalToast({ msg: '✅ Approved! Waiting for other participants.', type: 'info' });
    }
  }

  async function declineWager(wagerId: string) {
    console.log('[declineWager] Calling RPC for wager:', wagerId);
    const { data: result, error } = await supabase.rpc('decline_wager', { p_wager_id: wagerId });
    if (error) {
      console.error('[declineWager] RPC error:', error);
      setGlobalToast({ msg: `Decline failed: ${error.message}`, type: 'error' });
      return;
    }
    if (result === 'not_participant') {
      setGlobalToast({ msg: 'You are not a participant of this wager.', type: 'error' });
      return;
    }
    // Optimistically remove from the pending section and mark declined in main grid
    setWagers((prev) => prev.map((w) => w.id === wagerId ? { ...w, status: 'declined' } : w));
  }

  async function addFriend(name: string, phone?: string, profileId?: string): Promise<'added' | 'duplicate' | 'empty'> {
    const trimmed = name.trim();
    if (!trimmed) return 'empty';
    if (friends.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) return 'duplicate';

    const avatar = trimmed.slice(0, 2).toUpperCase();

    if (profileId) {
      // Registered user — use RPC to create the friendship both ways (bypasses RLS)
      const { error } = await supabase.rpc('add_reciprocal_friend', {
        p_friend_profile_id: profileId,
        p_friend_name:       trimmed,
        p_friend_avatar:     avatar,
        p_friend_phone:      phone?.trim() ?? '',
      });
      if (error) { console.error('addFriend (RPC):', error); return 'empty'; }
      // Optimistically add to local state; the actual id will come via realtime INSERT
      const id = crypto.randomUUID();
      setFriends((prev) => [...prev, { id, name: trimmed, avatar, phone: phone?.trim() || undefined, profileId }]);
    } else {
      // Non-registered friend — plain direct insert
      const id = crypto.randomUUID();
      const { error } = await supabase.from('friends').insert({
        id, owner_id: profile!.id, name: trimmed,
        phone: phone?.trim() ?? '', avatar,
        profile_id: null,
      });
      if (error) { console.error('addFriend:', error); return 'empty'; }
      setFriends((prev) => [...prev, { id, name: trimmed, avatar, phone: phone?.trim() || undefined }]);
    }
    return 'added';
  }

  async function updateWager(id: string, updates: Partial<Wager>) {
    const dbUpdates: Record<string, unknown> = {};
    if ('status' in updates) dbUpdates.status = updates.status;
    if ('result' in updates) dbUpdates.result = updates.result ?? null;
    const { error } = await supabase.from('wagers').update(dbUpdates).eq('id', id);
    if (error) { console.error('updateWager:', error); return; }
    setWagers((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));

    // Refresh leaderboard when a result is declared
    if ('result' in updates) {
      supabase.rpc('get_leaderboard').then(({ data: lb }) => {
        if (lb) setLeaderboard((lb as Record<string, unknown>[]).map((r) => ({
          id: r.id as string, firstName: r.first_name as string,
          lastName: r.last_name as string, avatarId: r.avatar_id as number,
          wins: Number(r.wins), decided: Number(r.decided), total: Number(r.total),
        })));
      });
    }
  }

  async function deleteWager(id: string) {
    // Optimistic remove
    setWagers((prev) => prev.filter((w) => w.id !== id));
    // Delete participants first (handles pending_approval wagers with linked participants)
    await supabase.from('wager_participants').delete().eq('wager_id', id);
    const { error } = await supabase.from('wagers').delete().eq('id', id);
    if (error) {
      console.error('deleteWager:', error);
      // Roll back on failure by re-fetching
      const rows = await fetchAllWagers(profile!.id);
      setWagers(rows.map((r) => applyOverdue(mapWager(r))));
    }
  }

  async function removeFriend(id: string) {
    // Optimistic remove
    setFriends((prev) => prev.filter((f) => f.id !== id));
    const { error } = await supabase.from('friends').delete().eq('id', id);
    if (error) {
      console.error('removeFriend:', error);
      const { data: fRows } = await supabase.from('friends').select('*').order('created_at');
      setFriends((fRows ?? []).map((r) => mapFriend(r as Record<string, unknown>)));
    }
  }

  // ── Loading screen ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Zap className="text-emerald-400 w-6 h-6 animate-pulse" fill="currentColor" />
          <span className="text-slate-300 text-sm font-semibold">Loading BetBuddy…</span>
        </div>
      </div>
    );
  }

  // ── Password recovery screen (triggered by magic link from email) ─────────

  if (passwordRecovery) {
    return <ResetPassword />;
  }

  // ── Profile Page ──────────────────────────────────────────────────────────

  if (viewingProfile && profile) {
    return (
      <ProfilePage
        profile={profile}
        wagers={wagers}
        friends={friends}
        leaderboard={leaderboard}
        onBack={() => setViewingProfile(false)}
        onEditProfile={() => { setViewingProfile(false); setEditingProfile(true); }}
      />
    );
  }

  // ── Show Welcome (signup / login / edit) ──────────────────────────────────

  if (!session || !profile || editingProfile) {
    return (
      <Welcome
        onComplete={handleProfileComplete}
        initialValues={editingProfile ? profile ?? undefined : undefined}
      />
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  // Wagers awaiting MY approval (not created by me, not yet actioned this session)
  const pendingApprovalWagers = wagers.filter(
    (w) => w.status === 'pending_approval'
        && w.creatorId !== profile.id
        && !approvedByMe.has(w.id)
  );
  // Main grid: everything except wagers sitting in the Pending Approvals section
  const gridWagers = wagers.filter(
    (w) => !(w.status === 'pending_approval' && w.creatorId !== profile.id && !approvedByMe.has(w.id))
  );

  // All tab filters use getPersonalResult so Won/Lost/Active reflect this user's outcome,
  // not the raw DB value (which is from the creator's perspective).
  const uid = profile.id;
  const visibleWagers = activeFilter === 'All'     ? gridWagers
    : activeFilter === 'Active'  ? gridWagers.filter((w) => isActiveForUser(w, uid))
    : activeFilter === 'Pending' ? gridWagers.filter((w) => w.status === 'pending_approval')
    : activeFilter === 'Won'     ? gridWagers.filter((w) => getPersonalResult(w, uid) === 'won')
    : activeFilter === 'Lost'    ? gridWagers.filter((w) => getPersonalResult(w, uid) === 'lost')
    : activeFilter === 'Settled' ? gridWagers.filter((w) => w.status === 'settled' || w.status === 'awaiting_payment')
    : gridWagers;

  // Badge counts — same helpers for consistency
  const filterCounts: Record<Filter, number> = {
    All:     gridWagers.length,
    Pending: gridWagers.filter((w) => w.status === 'pending_approval').length,
    Active:  gridWagers.filter((w) => isActiveForUser(w, uid)).length,
    Won:     gridWagers.filter((w) => getPersonalResult(w, uid) === 'won').length,
    Lost:    gridWagers.filter((w) => getPersonalResult(w, uid) === 'lost').length,
    Settled: gridWagers.filter((w) => w.status === 'settled' || w.status === 'awaiting_payment').length,
    News:    wagers.length, // all events, including pending-approval wagers not in the main grid
  };

  const avatar = AVATARS[profile.avatarId] ?? AVATARS[0];

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Global Toast (real-time notifications) ── */}
      {globalToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold border transition-all animate-pulse-once ${
          globalToast.type === 'success' ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-200'
          : globalToast.type === 'error'  ? 'bg-rose-900/95 border-rose-500/50 text-rose-200'
          :                                  'bg-violet-900/95 border-violet-500/50 text-violet-200'
        }`}>
          <Bell className="w-4 h-4 shrink-0" />
          <span>{globalToast.msg}</span>
          <button onClick={() => setGlobalToast(null)} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Top Nav ── */}
      <header className="border-b border-[#1E293B] px-4 md:px-8 py-3 md:py-4 flex items-center justify-between sticky top-0 z-30 bg-[#0F172A]">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            className="md:hidden p-2 text-slate-400 hover:text-slate-100 cursor-pointer"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Zap className="text-emerald-400 w-6 h-6" fill="currentColor" />
          <span className="text-slate-100 font-extrabold text-lg md:text-xl tracking-tight">BetBuddy</span>
        </div>

        <div className="flex items-center gap-2 md:gap-3" ref={profileMenuRef}>
          <span className="text-slate-400 text-sm hidden sm:block">Hi, {profile.firstName}</span>

          <button
            onClick={() => setProfileMenuOpen((o) => !o)}
            className="relative cursor-pointer focus:outline-none"
            aria-label="Profile menu"
          >
            {profile.profilePicture ? (
              <img
                src={profile.profilePicture}
                alt="avatar"
                className="w-9 h-9 rounded-full object-cover border-2 border-emerald-500/50 hover:border-emerald-400 transition-colors"
              />
            ) : (
              <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg transition-colors hover:opacity-90 ${avatar.bg} ${avatar.border}`}>
                {avatar.emoji}
              </div>
            )}
          </button>

          {profileMenuOpen && (
            <div className="absolute top-14 right-4 w-64 bg-[#1E293B] border border-[#334155] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-[#334155]">
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-emerald-500/40" />
                ) : (
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-xl ${avatar.bg} ${avatar.border}`}>
                    {avatar.emoji}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-slate-100 font-semibold text-sm truncate">{profile.firstName} {profile.lastName}</p>
                  {profile.email && <p className="text-slate-500 text-xs truncate">{profile.email}</p>}
                </div>
              </div>
              <div className="p-1.5 flex flex-col gap-0.5">
                <button
                  onClick={() => { setViewingProfile(true); setProfileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700/50 text-sm transition-colors cursor-pointer"
                >
                  <LayoutDashboard className="w-4 h-4 text-slate-400" /> My Profile
                </button>
                <button
                  onClick={() => { setEditingProfile(true); setProfileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700/50 text-sm transition-colors cursor-pointer"
                >
                  <UserCog className="w-4 h-4 text-slate-400" /> Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-rose-400 hover:bg-rose-500/10 text-sm transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile Sidebar Drawer ── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed top-0 left-0 h-full w-[85vw] max-w-sm z-50 bg-[#0F172A] border-r border-[#1E293B] overflow-y-auto md:hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E293B]">
              <div className="flex items-center gap-2">
                <Zap className="text-emerald-400 w-5 h-5" fill="currentColor" />
                <span className="text-slate-100 font-extrabold tracking-tight">BetBuddy</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-100 cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <Sidebar
                wagers={wagers}
                friends={friends}
                leaderboard={leaderboard}
                currentProfileId={profile.id}
                onAddWager={(w) => { void addWager(w); setSidebarOpen(false); }}
                onAddFriend={addFriend}
                onRemoveFriend={removeFriend}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={handleToggleNotifications}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Main Layout ── */}
      <main className="flex flex-col md:flex-row gap-6 p-4 md:p-6 flex-1 max-w-[1400px] mx-auto w-full">
        <div className="hidden md:block">
          <Sidebar
            wagers={wagers}
            friends={friends}
            leaderboard={leaderboard}
            currentProfileId={profile.id}
            onAddWager={(w) => { void addWager(w); }}
            onAddFriend={addFriend}
            onRemoveFriend={removeFriend}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
          />
        </div>

        <section className="flex-1 flex flex-col gap-4 md:gap-5 min-w-0">
          {/* ── Pending Requests ── */}
          {pendingApprovalWagers.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 font-bold text-sm tracking-wider uppercase">Pending Approvals</span>
                <span className="bg-amber-400/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-400/30">
                  {pendingApprovalWagers.length}
                </span>
              </div>
              <p className="text-slate-500 text-xs -mt-1">A friend challenged you — accept or decline below.</p>
              <div className="flex flex-col gap-3">
                {pendingApprovalWagers.map((w) => (
                  <div key={w.id} className="bg-[#1E293B] border border-amber-400/30 rounded-xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-100 font-bold text-sm uppercase tracking-wide truncate">{w.title || w.condition}</p>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed line-clamp-2">{w.condition}</p>
                        <p className="text-slate-500 text-xs mt-2">
                          Stake: <span className="text-amber-300 font-semibold">
                            {w.stakeType === 'money' && w.monetaryValue
                              ? `₪${w.monetaryValue.toLocaleString()}${w.stake ? ` — ${w.stake}` : ''}`
                              : w.stake}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => void approveWager(w.id)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 transition-colors cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve ✅
                        </button>
                        <button
                          onClick={() => void declineWager(w.id)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold border border-rose-500/30 transition-colors cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" /> Decline ❌
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#1E293B]" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-slate-100 font-bold text-xl md:text-2xl tracking-tight">My Wagers</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {visibleWagers.length} wager{visibleWagers.length !== 1 ? 's' : ''}
                  {activeFilter !== 'All' && ` · ${activeFilter}`}
                </p>
              </div>
              <button
                onClick={() => void refreshWagers()}
                disabled={refreshing}
                title="Refresh wagers"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#1E293B] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {FILTERS.map((filter) => {
                const count = filterCounts[filter];
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeFilter === filter
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-300 hover:bg-[#1E293B]'
                    }`}
                  >
                    {filter}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${
                        activeFilter === filter ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {activeFilter === 'News' ? (
            <NewsFeed wagers={wagers} friends={friends} currentUserId={profile.id} />
          ) : refreshing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
              {[1, 2, 3, 4].map((i) => <WagerSkeleton key={i} />)}
            </div>
          ) : visibleWagers.length === 0 ? (
            <EmptyState filter={activeFilter} hasFriends={friends.length > 0} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
              {visibleWagers.map((wager) => (
                <WagerCard
                  key={wager.id}
                  wager={wager}
                  friends={friends}
                  isOwner={wager.creatorId === profile.id}
                  currentUserId={profile.id}
                  notificationsEnabled={notificationsEnabled}
                  onUpdate={(id, updates) => { void updateWager(id, updates); }}
                  onDelete={() => { void deleteWager(wager.id); }}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function WagerSkeleton() {
  return (
    <div className="flex flex-col bg-[#1E293B] border border-[#334155] rounded-xl overflow-hidden animate-pulse">
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-slate-700 rounded w-3/4" />
          <div className="flex gap-1.5 mt-2">
            <div className="w-5 h-5 rounded-full bg-slate-700" />
            <div className="h-3 bg-slate-800 rounded w-28 mt-1" />
          </div>
        </div>
        <div className="h-6 w-28 bg-slate-700 rounded-full shrink-0" />
      </div>
      <div className="mx-5 border-t border-[#334155]" />
      <div className="p-5 pt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="h-3 bg-slate-800 rounded w-12" />
            <div className="h-3 bg-slate-700 rounded w-28" />
          </div>
        ))}
      </div>
      <div className="px-5 pb-5">
        <div className="h-10 bg-slate-700/50 rounded-lg" />
      </div>
    </div>
  );
}

function EmptyState({ filter, hasFriends }: { filter: string; hasFriends: boolean }) {
  const isFiltered = filter !== 'All';
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 md:py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center">
        <Swords className="w-8 h-8 text-slate-600" />
      </div>
      <div className="text-center px-4">
        <p className="text-slate-300 font-semibold text-base">
          {isFiltered ? `No ${filter.toLowerCase()} wagers` : 'No active bets'}
        </p>
        <p className="text-slate-600 text-sm mt-1 max-w-xs mx-auto">
          {isFiltered ? 'Try a different filter.'
            : !hasFriends ? 'Add a friend in the sidebar, then place your first wager!'
            : 'Start a wager with a friend to begin!'}
        </p>
      </div>
    </div>
  );
}
