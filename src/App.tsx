import { useState, useEffect, useRef } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { Zap, Swords, Menu, X, LogOut, UserCog, Bell, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import WagerCard from './components/WagerCard';
import Welcome from './components/Welcome';
import type { Wager, WagerStatus, Friend, UserProfile, LeaderboardEntry } from './types';
import { AVATARS } from './avatars';
import { requestPermission, isPermissionGranted, sendNotification } from './notifications';
import './index.css';

const NOTIF_KEY  = 'betbuddy_notifications';
const MIGR_KEY   = 'betbuddy_migrated_v1';
const FILTERS    = ['All', 'Pending', 'Won', 'Lost', 'Settled'] as const;
type Filter = (typeof FILTERS)[number];

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
  };
}

function mapWager(row: Record<string, unknown>): Wager {
  const raw = row.friends as string[] | null;
  const friends: string[] = Array.isArray(raw) ? raw : [];
  return {
    id:            (row.id            as string) ?? '',
    creatorId:     (row.creator_id    as string) ?? '',
    title:         (row.title         as string) ?? '',
    condition:     (row.condition     as string) ?? '',
    stake:         (row.stake         as string) ?? '',
    stakeType:     (row.stake_type    as 'money' | 'other') ?? 'other',
    monetaryValue: (row.monetary_value as number | null) ?? undefined,
    deadline:      (row.deadline      as string) ?? '',
    status:        (row.status        as WagerStatus) ?? 'pending',
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
  const [globalToast,    setGlobalToast]    = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  // Tracks wagers this user already approved in the current session (so they vanish from Pending Approvals immediately)
  const [approvedByMe,   setApprovedByMe]   = useState<Set<string>>(new Set());

  const profileMenuRef   = useRef<HTMLDivElement>(null);
  const realtimeRef      = useRef<RealtimeChannel | null>(null);
  const notifEnabledRef  = useRef(notificationsEnabled);
  // Prevents double loadUserData from getSession() + onAuthStateChange(INITIAL_SESSION)
  const loadedRef        = useRef(false);

  // Keep notifEnabledRef in sync so realtime callbacks see current value
  useEffect(() => { notifEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);

  // Auto-dismiss global toast after 4 s
  useEffect(() => {
    if (!globalToast) return;
    const t = setTimeout(() => setGlobalToast(null), 4000);
    return () => clearTimeout(t);
  }, [globalToast]);

  // ── Auth bootstrap ────────────────────────────────────────────────────────

  useEffect(() => {
    console.log('[Auth] Bootstrap: checking session…');

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession result:', s ? `user=${s.user.id}` : 'none');
      setSession(s);
      if (s && !loadedRef.current) {
        loadedRef.current = true;
        loadUserData(s.user.id);
      } else if (!s) {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[Auth] onAuthStateChange event:', event, s ? `user=${s.user.id}` : 'none');
      setSession(s);
      if (s && !loadedRef.current) {
        // Only fires if getSession() didn't already trigger loadUserData
        loadedRef.current = true;
        loadUserData(s.user.id);
      } else if (!s) {
        // Signed out
        loadedRef.current = false;
        setProfile(null);
        setWagers([]);
        setFriends([]);
        setLeaderboard([]);
        setApprovedByMe(new Set());
        setLoading(false);
        realtimeRef.current?.unsubscribe();
        realtimeRef.current = null;
      }
    });

    return () => { subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUserData(userId: string) {
    console.log('[loadUserData] Starting for user:', userId);
    setLoading(true);
    try {
      const [{ data: pRow, error: pErr }, { data: wRows, error: wErr }, { data: fRows, error: fErr }, { data: lb, error: lbErr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('wagers').select('*').order('created_at', { ascending: false }),
        supabase.from('friends').select('*').eq('owner_id', userId).order('created_at'),
        supabase.rpc('get_leaderboard'),
      ]);
      if (pErr)  console.error('[loadUserData] profiles error:', pErr);
      if (wErr)  console.error('[loadUserData] wagers error:', wErr);
      if (fErr)  console.error('[loadUserData] friends error:', fErr);
      if (lbErr) console.error('[loadUserData] leaderboard error:', lbErr);

      console.log('[loadUserData] Got profile:', !!pRow, '| wagers:', wRows?.length ?? 0, '| friends:', fRows?.length ?? 0);

      if (pRow) setProfile(mapProfile(pRow as Record<string, unknown>));
      setWagers((wRows ?? []).map((r) => mapWager(r as Record<string, unknown>)));
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
          const w = mapWager(payload.new as Record<string, unknown>);
          setWagers((prev) => {
            if (prev.some((x) => x.id === w.id)) return prev;
            // Notify when a wager from someone else appears (we're a participant)
            if (w.creatorId !== userId) void handleIncomingWager(w);
            return [w, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const w = mapWager(payload.new as Record<string, unknown>);
          setWagers((prev) => prev.map((x) => (x.id === w.id ? w : x)));
        } else if (payload.eventType === 'DELETE') {
          setWagers((prev) => prev.filter((x) => x.id !== (payload.old as { id: string }).id));
        }
      })
      // ── Participant link created (another user added us to a wager) ───────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wager_participants' }, async (payload) => {
        const row = payload.new as { wager_id: string; profile_id: string };
        if (row.profile_id !== userId) return;
        const { data: wRow } = await supabase.from('wagers').select('*').eq('id', row.wager_id).single();
        if (!wRow) return;
        const w = mapWager(wRow as Record<string, unknown>);
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

    setWagers((prev) => [{ ...wager, creatorId: profile!.id, status }, ...prev]);
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
    const id     = crypto.randomUUID();
    const avatar = trimmed.slice(0, 2).toUpperCase();
    const { error } = await supabase.from('friends').insert({
      id, owner_id: profile!.id, name: trimmed,
      phone: phone?.trim() ?? '', avatar,
      profile_id: profileId ?? null,
    });
    if (error) { console.error('addFriend:', error); return 'empty'; }
    setFriends((prev) => [...prev, { id, name: trimmed, avatar, phone: phone?.trim() || undefined, profileId }]);
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
    const { error } = await supabase.from('wagers').delete().eq('id', id);
    if (error) {
      console.error('deleteWager:', error);
      // Roll back on failure by re-fetching
      const { data: wRows } = await supabase.from('wagers').select('*').order('created_at', { ascending: false });
      setWagers((wRows ?? []).map((r) => mapWager(r as Record<string, unknown>)));
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

  const filterMap: Record<Filter, WagerStatus | null> = {
    All: null, Pending: 'pending', Won: 'won', Lost: 'lost', Settled: 'settled',
  };
  // Wagers awaiting MY approval (not the creator, not already actioned this session)
  const pendingApprovalWagers = wagers.filter(
    (w) => w.status === 'pending_approval'
        && w.creatorId !== profile.id
        && !approvedByMe.has(w.id)
  );
  // Main grid: exclude wagers sitting in my Pending Approvals section
  const gridWagers = wagers.filter(
    (w) => !(w.status === 'pending_approval' && w.creatorId !== profile.id && !approvedByMe.has(w.id))
  );
  const visibleWagers =
    activeFilter === 'All' ? gridWagers : gridWagers.filter((w) => w.status === filterMap[activeFilter]);

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
            <div>
              <h1 className="text-slate-100 font-bold text-xl md:text-2xl tracking-tight">Active & Recent Wagers</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {visibleWagers.length} wager{visibleWagers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeFilter === filter
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-[#1E293B]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {visibleWagers.length === 0 ? (
            <EmptyState filter={activeFilter} hasFriends={friends.length > 0} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
              {visibleWagers.map((wager) => (
                <WagerCard
                  key={wager.id}
                  wager={wager}
                  friends={friends}
                  isOwner={wager.creatorId === profile.id}
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
