import { useState, useEffect, useRef } from 'react';
import { Zap, Swords, Menu, X, LogOut, UserCog } from 'lucide-react';
import Sidebar from './components/Sidebar';
import WagerCard from './components/WagerCard';
import Welcome from './components/Welcome';
import type { Wager, WagerStatus, Friend, UserProfile } from './types';
import { AVATARS } from './avatars';
import { requestPermission, isPermissionGranted } from './notifications';
import './index.css';

const PROFILE_KEY = 'betbuddy_profile_v1';
const WAGERS_KEY  = 'betbuddy_wagers_v3';
const FRIENDS_KEY = 'betbuddy_friends_v2';
const NOTIF_KEY   = 'betbuddy_notifications';
const FILTERS = ['All', 'Pending', 'Won', 'Lost', 'Settled'] as const;
type Filter = (typeof FILTERS)[number];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

function migrateWager(w: Record<string, unknown>): Wager {
  if (Array.isArray(w.friends)) return w as unknown as Wager;
  return { ...w, friends: w.friend ? [w.friend as string] : [] } as unknown as Wager;
}

function loadWagers(): Wager[] {
  try {
    const raw = localStorage.getItem(WAGERS_KEY);
    if (raw) return (JSON.parse(raw) as Record<string, unknown>[]).map(migrateWager);
  } catch { /* ignore */ }
  return [];
}

export default function App() {
  const [profile,   setProfile]   = useState<UserProfile | null>(() => load<UserProfile | null>(PROFILE_KEY, null));
  const [wagers,    setWagers]    = useState<Wager[]>(loadWagers);
  const [friends,   setFriends]   = useState<Friend[]>(() => load<Friend[]>(FRIENDS_KEY, []));
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeFilter,   setActiveFilter]   = useState<Filter>('All');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIF_KEY) === 'true' && isPermissionGranted()
  );

  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(WAGERS_KEY,  JSON.stringify(wagers));  }, [wagers]);
  useEffect(() => { localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends)); }, [friends]);

  // Auto-request notifications after profile is set
  useEffect(() => {
    if (!profile) return;
    if ('Notification' in window && Notification.permission === 'default') {
      requestPermission().then((granted) => {
        if (granted) { setNotificationsEnabled(true); localStorage.setItem(NOTIF_KEY, 'true'); }
      });
    }
  }, [profile]);

  // Close profile menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node))
        setProfileMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleProfileComplete(p: UserProfile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setProfile(p);
    setEditingProfile(false);
  }

  function handleLogout() {
    if (!confirm('Clear your profile and all data? This cannot be undone.')) return;
    [PROFILE_KEY, WAGERS_KEY, FRIENDS_KEY, NOTIF_KEY].forEach((k) => localStorage.removeItem(k));
    setProfile(null); setWagers([]); setFriends([]); setProfileMenuOpen(false);
  }

  function handleEditProfile() {
    setEditingProfile(true);
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

  function addWager(wager: Wager) { setWagers((prev) => [wager, ...prev]); }

  function addFriend(name: string, phone?: string): 'added' | 'duplicate' | 'empty' {
    const trimmed = name.trim();
    if (!trimmed) return 'empty';
    if (friends.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) return 'duplicate';
    setFriends((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed, avatar: trimmed.slice(0, 2).toUpperCase(), phone: phone?.trim() || undefined }]);
    return 'added';
  }

  function updateWager(id: string, updates: Partial<Wager>) {
    setWagers((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  }

  // ── Routing ───────────────────────────────────────────────────────────────

  if (!profile || editingProfile) {
    return <Welcome onComplete={handleProfileComplete} initialValues={editingProfile ? profile ?? undefined : undefined} />;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  const filterMap: Record<Filter, WagerStatus | null> = {
    All: null, Pending: 'pending', Won: 'won', Lost: 'lost', Settled: 'settled',
  };
  const visibleWagers =
    activeFilter === 'All' ? wagers : wagers.filter((w) => w.status === filterMap[activeFilter]);

  const avatar = AVATARS[profile.avatarId] ?? AVATARS[0];

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Top Nav ── */}
      <header className="border-b border-[#1E293B] px-4 md:px-8 py-3 md:py-4 flex items-center justify-between sticky top-0 z-30 bg-[#0F172A]">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile hamburger */}
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

          {/* Avatar button */}
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

          {/* Profile dropdown */}
          {profileMenuOpen && (
            <div className="absolute top-14 right-4 w-64 bg-[#1E293B] border border-[#334155] rounded-xl shadow-2xl z-50 overflow-hidden">
              {/* User info */}
              <div className="flex items-center gap-3 p-4 border-b border-[#334155]">
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-emerald-500/40" />
                ) : (
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-xl ${avatar.bg} ${avatar.border}`}>
                    {avatar.emoji}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-slate-100 font-semibold text-sm truncate">
                    {profile.firstName} {profile.lastName}
                  </p>
                  {profile.email && <p className="text-slate-500 text-xs truncate">{profile.email}</p>}
                </div>
              </div>
              {/* Actions */}
              <div className="p-1.5 flex flex-col gap-0.5">
                <button
                  onClick={handleEditProfile}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700/50 text-sm transition-colors cursor-pointer"
                >
                  <UserCog className="w-4 h-4 text-slate-400" /> Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-rose-400 hover:bg-rose-500/10 text-sm transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Switch User / Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile Sidebar Drawer ── */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
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
                onAddWager={(w) => { addWager(w); setSidebarOpen(false); }}
                onAddFriend={addFriend}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={handleToggleNotifications}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Main Layout ── */}
      <main className="flex flex-col md:flex-row gap-6 p-4 md:p-6 flex-1 max-w-[1400px] mx-auto w-full">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar
            wagers={wagers}
            friends={friends}
            onAddWager={addWager}
            onAddFriend={addFriend}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
          />
        </div>

        {/* Main content */}
        <section className="flex-1 flex flex-col gap-4 md:gap-5 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
            <div>
              <h1 className="text-slate-100 font-bold text-xl md:text-2xl tracking-tight">Active & Recent Wagers</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {visibleWagers.length} wager{visibleWagers.length !== 1 ? 's' : ''}
              </p>
            </div>
            {/* Filter tabs — horizontally scrollable on mobile */}
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
                  notificationsEnabled={notificationsEnabled}
                  onUpdate={updateWager}
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
            : !hasFriends ? 'Tap the menu to add a friend, then place your first wager!'
            : 'Start a wager with a friend to begin!'}
        </p>
      </div>
    </div>
  );
}
