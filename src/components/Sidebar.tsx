import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Beer, TrendingUp, Plus, Users, Bell, BellOff,
  UserPlus, CheckCircle, AlertCircle, ChevronDown,
} from 'lucide-react';
import type { Wager, Friend } from '../types';

type Toast = { msg: string; type: 'success' | 'error' | 'info' };

interface Props {
  wagers: Wager[];
  friends: Friend[];
  onAddWager: (wager: Wager) => void;
  onAddFriend: (name: string, phone?: string) => 'added' | 'duplicate' | 'empty';
  notificationsEnabled: boolean;
  onToggleNotifications: () => Promise<void>;
}

export default function Sidebar({ wagers, friends, onAddWager, onAddFriend, notificationsEnabled, onToggleNotifications }: Props) {
  // ── Add-friend form ──────────────────────────────────────────────────────
  const [friendInput, setFriendInput] = useState('');
  const [phoneInput,  setPhoneInput]  = useState('');

  // ── New-wager form ───────────────────────────────────────────────────────
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen]           = useState(false);
  const [condition, setCondition]             = useState('');
  const [stake, setStake]                     = useState('');
  const [deadline, setDeadline]               = useState('');
  const [wagerError, setWagerError]           = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close friend-picker on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Dynamic stats ────────────────────────────────────────────────────────
  const activeBets  = wagers.filter((w) => w.status === 'pending' || w.status === 'awaiting_payment').length;
  const decided     = wagers.filter((w) => w.result !== undefined);
  const wonCount    = wagers.filter((w) => w.result === 'won').length;
  const winRate     = decided.length > 0 ? Math.round((wonCount / decided.length) * 100) : 0;
  const beerCount   = wagers.filter((w) => /beer|pint/i.test(w.stake)).length;

  // ── Leaderboard ──────────────────────────────────────────────────────────
  const friendStats = friends
    .map((fr) => ({
      ...fr,
      wins:   wagers.filter((w) => w.friends.includes(fr.name) && w.result === 'won').length,
      losses: wagers.filter((w) => w.friends.includes(fr.name) && w.result === 'lost').length,
      total:  wagers.filter((w) => w.friends.includes(fr.name)).length,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAddFriend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = friendInput.trim();
    const result  = onAddFriend(trimmed, phoneInput.trim() || undefined);
    if (result === 'added') {
      setToast({ msg: `${trimmed} added to your crew!`, type: 'success' });
      setFriendInput('');
      setPhoneInput('');
    } else if (result === 'duplicate') {
      setToast({ msg: `${trimmed} is already in your list.`, type: 'error' });
    } else {
      setToast({ msg: 'Please enter a name.', type: 'error' });
    }
  }

  function toggleFriendSelection(name: string) {
    setSelectedFriends((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
    setWagerError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFriends.length === 0) { setWagerError('Select at least one friend.');  return; }
    if (!condition.trim())             { setWagerError('Enter a bet condition.');        return; }
    if (!stake.trim())                 { setWagerError('Enter what\'s at stake.');       return; }
    if (!deadline)                     { setWagerError('Set a deadline (date & time).'); return; }
    setWagerError('');

    const nameList =
      selectedFriends.length === 1
        ? selectedFriends[0]
        : selectedFriends.slice(0, -1).join(', ') + ' & ' + selectedFriends[selectedFriends.length - 1];

    onAddWager({
      id: crypto.randomUUID(),
      title: `${condition.slice(0, 45).toUpperCase()}`,
      friends: selectedFriends,
      stake: stake.trim(),
      status: 'pending',
      deadline,
      condition: condition.trim(),
    });

    setToast({ msg: `Wager with ${nameList} placed! 🤝`, type: 'success' });
    setCondition('');
    setStake('');
    setDeadline('');
    setSelectedFriends([]);
  }

  async function handleNotifToggle() {
    await onToggleNotifications();
    if (!notificationsEnabled) {
      if ('Notification' in window && Notification.permission === 'denied') {
        setToast({ msg: 'Notifications blocked — check browser site settings.', type: 'error' });
      } else {
        setToast({ msg: 'Desktop alerts enabled! 🔔', type: 'success' });
      }
    } else {
      setToast({ msg: 'Desktop alerts disabled.', type: 'info' });
    }
  }

  // Picker label
  const pickerLabel =
    selectedFriends.length === 0
      ? 'Select friends...'
      : selectedFriends.length === 1
      ? selectedFriends[0]
      : `${selectedFriends.length} friends selected`;

  return (
    <aside className="w-[30%] min-w-[280px] flex flex-col gap-5">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold border ${
          toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-300'
          : toast.type === 'error'  ? 'bg-rose-900/90 border-rose-500/40 text-rose-300'
          :                            'bg-slate-800/90 border-slate-500/40 text-slate-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" />
           : toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" />
           :                          <Bell className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ── My Summary ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-4">My Summary</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<TrendingUp className="text-sky-400 w-5 h-5" />}    value={activeBets}      label="Active Bets" />
          <StatTile icon={<Trophy className="text-emerald-400 w-5 h-5" />}    value={`${winRate}%`}   label="Win Rate"    />
          <StatTile icon={<Beer className="text-orange-400 w-5 h-5" />}       value={beerCount}       label="🍻 Count"    />
        </div>
      </div>

      {/* ── New Wager Form ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="text-emerald-400 w-4 h-4" />
          <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">New Wager</h2>
        </div>

        {friends.length === 0 ? (
          <div className="flex items-center gap-2 bg-slate-800/50 border border-[#334155] rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-slate-500 text-xs">Add a friend below to place a wager.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            {/* Multi-friend picker */}
            <Field label="Friends (select one or more)">
              <div ref={pickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  className="w-full flex items-center justify-between bg-[#0F172A] border border-[#334155] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-sky-500 cursor-pointer transition-colors hover:border-slate-500"
                >
                  <span className={selectedFriends.length === 0 ? 'text-slate-600' : 'text-slate-100'}>
                    {pickerLabel}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {pickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#0F172A] border border-[#334155] rounded-lg shadow-xl overflow-hidden">
                    {friends.map((f) => {
                      const checked = selectedFriends.includes(f.name);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleFriendSelection(f.name)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                          }`}>
                            {checked && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {f.avatar}
                          </div>
                          <span className="text-slate-100 text-sm">{f.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Selected friend pills */}
              {selectedFriends.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedFriends.map((name) => (
                    <span
                      key={name}
                      onClick={() => toggleFriendSelection(name)}
                      className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full cursor-pointer hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 transition-colors"
                      title="Click to remove"
                    >
                      {name} ×
                    </span>
                  ))}
                </div>
              )}
            </Field>

            <Field label="Condition">
              <input
                type="text"
                value={condition}
                onChange={(e) => { setCondition(e.target.value); setWagerError(''); }}
                placeholder="e.g. Arsenal keeps a clean sheet"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </Field>

            <Field label="Stake">
              <input
                type="text"
                value={stake}
                onChange={(e) => { setStake(e.target.value); setWagerError(''); }}
                placeholder='e.g. "Dinner at Taizu", "50 ILS", "A week of coffee"'
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </Field>

            <Field label="Deadline (date & time) *">
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => { setDeadline(e.target.value); setWagerError(''); }}
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-sky-500 [color-scheme:dark]"
              />
            </Field>

            {wagerError && (
              <p className="text-rose-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {wagerError}
              </p>
            )}

            <button
              type="submit"
              disabled={!deadline}
              className="mt-1 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              Place Wager
            </button>
          </form>
        )}
      </div>

      {/* ── My Friends ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="text-sky-400 w-4 h-4" />
          <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">My Friends</h2>
        </div>

        {/* Add Friend */}
        <form onSubmit={handleAddFriend} className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={friendInput}
              onChange={(e) => setFriendInput(e.target.value)}
              placeholder="Friend's name..."
              className="flex-1 bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-sky-500 min-w-0"
            />
            <button
              type="submit"
              disabled={!friendInput.trim()}
              className="shrink-0 p-2 bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-sky-400 border border-sky-500/30 rounded-lg transition-colors cursor-pointer"
              title="Add friend"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="Phone (optional, e.g. +972 50 000 0000)"
            className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-sky-500"
          />
        </form>

        {friendStats.length === 0 ? (
          <p className="text-slate-600 text-xs text-center py-2">No friends added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {friendStats.map((fr, i) => {
              const winPct = fr.total > 0 ? Math.round((fr.wins / fr.total) * 100) : 0;
              return (
                <div key={fr.id} className="flex items-center gap-3">
                  <span className="text-slate-600 text-xs font-bold w-4">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                    {fr.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-100 text-sm font-semibold truncate">{fr.name}</p>
                    {fr.phone && <p className="text-slate-600 text-[10px] truncate">{fr.phone}</p>}
                    <div className="h-1 bg-[#0F172A] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${winPct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="text-emerald-400 font-semibold">{fr.wins}W</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-rose-400 font-semibold">{fr.losses}L</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop Alerts Toggle ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notificationsEnabled
              ? <Bell className="text-emerald-400 w-4 h-4" />
              : <BellOff className="text-slate-500 w-4 h-4" />}
            <div>
              <p className="text-slate-300 text-xs font-semibold">Desktop Alerts</p>
              <p className="text-slate-600 text-[10px]">
                {notificationsEnabled ? 'Notifying on results' : 'Click to enable'}
              </p>
            </div>
          </div>
          <button onClick={handleNotifToggle} className="cursor-pointer" aria-label="Toggle desktop notifications">
            <div className={`relative w-10 h-5 rounded-full transition-colors ${notificationsEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center bg-[#0F172A] rounded-lg p-3 gap-1">
      {icon}
      <span className="text-slate-100 font-bold text-xl">{value}</span>
      <span className="text-slate-500 text-[10px] text-center">{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      {children}
    </div>
  );
}
