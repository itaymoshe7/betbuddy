import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Beer, TrendingUp, Plus, Users, Bell, BellOff,
  UserPlus, CheckCircle, AlertCircle, ChevronDown, Search, Globe, X,
  Wallet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Wager, Friend, LeaderboardEntry } from '../types';
import { AVATARS } from '../avatars';

type Toast = { msg: string; type: 'success' | 'error' | 'info' };

interface Props {
  wagers:              Wager[];
  friends:             Friend[];
  leaderboard:         LeaderboardEntry[];
  currentProfileId:    string;
  onAddWager:          (wager: Wager) => void;
  onAddFriend:         (name: string, phone?: string, profileId?: string) => Promise<'added' | 'duplicate' | 'empty'>;
  onRemoveFriend:      (id: string) => Promise<void>;
  notificationsEnabled: boolean;
  onToggleNotifications: () => Promise<void>;
}

interface ProfileResult {
  id: string; firstName: string; lastName: string; email: string; phone: string;
}

// ── Monthly chart helper ────────────────────────────────────────────────────

function buildMonthlyChart(wagers: Wager[]) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    const inMonth = wagers.filter((w) => {
      if (w.stakeType !== 'money' || !w.monetaryValue || !w.result) return false;
      const dd = new Date(w.deadline);
      return dd.getFullYear() === year && dd.getMonth() === month;
    });
    const won  = inMonth.filter((w) => w.result === 'won') .reduce((s, w) => s + (w.monetaryValue ?? 0), 0);
    const lost = inMonth.filter((w) => w.result === 'lost').reduce((s, w) => s + (w.monetaryValue ?? 0), 0);
    return { label, won, lost };
  });
}

export default function Sidebar({
  wagers, friends, leaderboard, currentProfileId,
  onAddWager, onAddFriend, onRemoveFriend, notificationsEnabled, onToggleNotifications,
}: Props) {
  // ── Add-friend form ──────────────────────────────────────────────────────
  const [friendInput, setFriendInput] = useState('');
  const [phoneInput,  setPhoneInput]  = useState('');
  const [addMode,     setAddMode]     = useState<'manual' | 'search'>('manual');

  // ── Social search ────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── New-wager form ───────────────────────────────────────────────────────
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [pickerOpen,      setPickerOpen]      = useState(false);
  const [condition,       setCondition]       = useState('');
  const [stakeType,       setStakeType]       = useState<'money' | 'other'>('money');
  const [monetaryValue,   setMonetaryValue]   = useState('');
  const [stake,           setStake]           = useState('');
  const [deadline,        setDeadline]        = useState('');
  const [wagerError,      setWagerError]      = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close picker on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Guard: ensure wagers/friends are always arrays before any array operation
  const safeWagers  = Array.isArray(wagers)  ? wagers  : [];
  const safeFriends = Array.isArray(friends) ? friends : [];

  // ── Stats ────────────────────────────────────────────────────────────────
  const activeBets = safeWagers.filter((w) => w.status === 'pending' || w.status === 'active' || w.status === 'overdue' || w.status === 'awaiting_payment').length;
  const decided    = safeWagers.filter((w) => w.result !== undefined);
  const wonCount   = safeWagers.filter((w) => w.result === 'won').length;
  const winRate    = decided.length > 0 ? Math.round((wonCount / decided.length) * 100) : 0;
  const beerCount  = safeWagers.filter((w) => w.stake && /beer|pint/i.test(w.stake)).length;

  // ── Financial ────────────────────────────────────────────────────────────
  const moneyWagers  = safeWagers.filter((w) => w.stakeType === 'money' && w.monetaryValue && w.result);
  const totalWon     = moneyWagers.filter((w) => w.result === 'won') .reduce((s, w) => s + (w.monetaryValue ?? 0), 0);
  const totalLost    = moneyWagers.filter((w) => w.result === 'lost').reduce((s, w) => s + (w.monetaryValue ?? 0), 0);
  const netBalance   = totalWon - totalLost;
  const chartData    = buildMonthlyChart(safeWagers);
  const chartMax     = Math.max(...chartData.map((d) => Math.max(d.won, d.lost)), 1);
  const hasMoneyData = moneyWagers.length > 0;

  // ── Local leaderboard (friends) ──────────────────────────────────────────
  const friendStats = safeFriends
    .map((fr) => ({
      ...fr,
      wins:   safeWagers.filter((w) => Array.isArray(w.friends) && w.friends.includes(fr.name) && w.result === 'won').length,
      losses: safeWagers.filter((w) => Array.isArray(w.friends) && w.friends.includes(fr.name) && w.result === 'lost').length,
      total:  safeWagers.filter((w) => Array.isArray(w.friends) && w.friends.includes(fr.name)).length,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleAddFriendManual(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = friendInput.trim();
    const result  = await onAddFriend(trimmed, phoneInput.trim() || undefined);
    if (result === 'added') {
      setToast({ msg: `${trimmed} added to your crew!`, type: 'success' });
      setFriendInput(''); setPhoneInput('');
    } else if (result === 'duplicate') {
      setToast({ msg: `${trimmed} is already in your list.`, type: 'error' });
    } else {
      setToast({ msg: 'Please enter a name.', type: 'error' });
    }
  }

  async function handleAddFromSearch(p: ProfileResult) {
    if (friends.some((f) => f.profileId === p.id)) {
      setToast({ msg: `${p.firstName} is already in your list.`, type: 'error' }); return;
    }
    const name   = `${p.firstName} ${p.lastName}`.trim();
    const result = await onAddFriend(name, p.phone || undefined, p.id);
    if (result === 'added') {
      setToast({ msg: `${name} added to your crew!`, type: 'success' });
      setSearchQuery(''); setSearchResults([]);
    } else if (result === 'duplicate') {
      setToast({ msg: `${name} is already in your list.`, type: 'error' });
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 3) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const term = q.trim().replace(/[%_]/g, '\\$&'); // escape LIKE special chars
        const { data } = await supabase.from('profiles').select('id,first_name,last_name,email,phone')
          .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
          .neq('id', currentProfileId).limit(8);
        setSearchResults((data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string, firstName: r.first_name as string,
          lastName: r.last_name as string, email: r.email as string, phone: r.phone as string,
        })));
      } finally { setSearching(false); }
    }, 400);
  }

  function toggleFriend(name: string) {
    setSelectedFriends((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
    setWagerError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFriends.length === 0) { setWagerError('Select at least one friend.'); return; }
    if (!condition.trim())            { setWagerError('Enter a bet condition.');       return; }
    if (stakeType === 'money' && (!monetaryValue || Number(monetaryValue) <= 0)) {
      setWagerError('Enter a valid amount in ₪.'); return;
    }
    if (stakeType === 'other' && !stake.trim()) { setWagerError("Enter what's at stake."); return; }
    if (!deadline) { setWagerError('Set a deadline (date & time).'); return; }
    setWagerError('');

    const nameList = selectedFriends.length === 1
      ? selectedFriends[0]
      : selectedFriends.slice(0, -1).join(', ') + ' & ' + selectedFriends[selectedFriends.length - 1];

    onAddWager({
      id:             crypto.randomUUID(),
      creatorId:      '',
      creatorName:    '',
      title:          condition.slice(0, 45).toUpperCase(),
      friends:        selectedFriends,
      stake:          stake.trim() || (stakeType === 'money' ? '' : stake.trim()),
      stakeType,
      monetaryValue:  stakeType === 'money' ? Number(monetaryValue) : undefined,
      status:         'pending',
      deadline,
      condition:      condition.trim(),
    });

    setToast({ msg: `Wager with ${nameList} placed!`, type: 'success' });
    setCondition(''); setStake(''); setMonetaryValue(''); setDeadline(''); setSelectedFriends([]);
  }

  async function handleNotifToggle() {
    await onToggleNotifications();
    if (!notificationsEnabled) {
      if ('Notification' in window && Notification.permission === 'denied') {
        setToast({ msg: 'Notifications blocked — check browser site settings.', type: 'error' });
      } else {
        setToast({ msg: 'Desktop alerts enabled!', type: 'success' });
      }
    } else {
      setToast({ msg: 'Desktop alerts disabled.', type: 'info' });
    }
  }

  const pickerLabel = selectedFriends.length === 0 ? 'Select friends...'
    : selectedFriends.length === 1 ? selectedFriends[0]
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
           : toast.type === 'error'  ? <AlertCircle className="w-4 h-4 shrink-0" />
           :                           <Bell className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ── My Summary ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-4">My Summary</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<TrendingUp className="text-sky-400 w-5 h-5" />}  value={activeBets}    label="Active" />
          <StatTile icon={<Trophy className="text-emerald-400 w-5 h-5" />}  value={`${winRate}%`} label="Win Rate"    />
          <StatTile icon={<Beer className="text-orange-400 w-5 h-5" />}     value={beerCount}     label="🍻 Count"    />
        </div>
      </div>

      {/* ── Financial Balance ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="text-violet-400 w-4 h-4" />
          <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Financial Balance</h2>
        </div>

        {hasMoneyData ? (
          <>
            {/* Net balance */}
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className={`text-2xl font-extrabold ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {netBalance >= 0 ? '+' : ''}₪{Math.abs(netBalance).toLocaleString()}
              </span>
              <span className="text-slate-500 text-xs">net balance</span>
            </div>

            {/* Won / Lost bars */}
            <div className="flex flex-col gap-2 mb-4">
              {[
                { label: 'Won', value: totalWon,  color: 'bg-emerald-500', textColor: 'text-emerald-400' },
                { label: 'Lost', value: totalLost, color: 'bg-rose-500',    textColor: 'text-rose-400'    },
              ].map(({ label, value, color, textColor }) => {
                const pct = totalWon + totalLost > 0
                  ? Math.round((value / (totalWon + totalLost)) * 100) : 0;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-6">{label}</span>
                    <div className="flex-1 h-2 bg-[#0F172A] rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-semibold ${textColor} w-16 text-right`}>₪{value.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            {/* Monthly mini-chart */}
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Monthly Trend (₪)</p>
            <div className="flex items-end gap-1 h-12">
              {chartData.map(({ label, won, lost }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex items-end gap-px w-full">
                    <div className="flex-1 bg-emerald-500/70 rounded-t-sm min-h-[2px] transition-all"
                      style={{ height: `${Math.max(2, Math.round((won  / chartMax) * 44))}px` }} />
                    <div className="flex-1 bg-rose-500/70 rounded-t-sm min-h-[2px] transition-all"
                      style={{ height: `${Math.max(2, Math.round((lost / chartMax) * 44))}px` }} />
                  </div>
                  <span className="text-[9px] text-slate-600">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/70" /><span className="text-[10px] text-slate-500">Won</span></div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500/70" /><span className="text-[10px] text-slate-500">Lost</span></div>
            </div>
          </>
        ) : (
          <p className="text-slate-600 text-xs text-center py-2">
            Place a monetary wager to track your balance.
          </p>
        )}
      </div>

      {/* ── New Wager Form ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="text-emerald-400 w-4 h-4" />
          <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">New Wager</h2>
        </div>

        {safeFriends.length === 0 ? (
          <div className="flex items-center gap-2 bg-slate-800/50 border border-[#334155] rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-slate-500 text-xs">Add a friend below to place a wager.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Friend picker */}
            <Field label="Friends (select one or more)">
              <div ref={pickerRef} className="relative">
                <button type="button" onClick={() => setPickerOpen((o) => !o)}
                  className="w-full flex items-center justify-between bg-[#0F172A] border border-[#334155] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-sky-500 cursor-pointer transition-colors hover:border-slate-500">
                  <span className={selectedFriends.length === 0 ? 'text-slate-600' : 'text-slate-100'}>{pickerLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {pickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#0F172A] border border-[#334155] rounded-lg shadow-xl overflow-hidden">
                    {safeFriends.map((f) => {
                      const checked = selectedFriends.includes(f.name);
                      return (
                        <button key={f.id} type="button" onClick={() => toggleFriend(f.name)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 transition-colors cursor-pointer">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                            {checked && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {f.avatar}
                          </div>
                          <div className="text-left min-w-0">
                            <span className="text-slate-100 text-sm">{f.name}</span>
                            {f.profileId && <span className="ml-1.5 text-[10px] text-emerald-500">● registered</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedFriends.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedFriends.map((name) => (
                    <span key={name} onClick={() => toggleFriend(name)}
                      className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full cursor-pointer hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 transition-colors"
                      title="Click to remove">
                      {name} ×
                    </span>
                  ))}
                </div>
              )}
            </Field>

            {/* Condition */}
            <Field label="Condition">
              <input type="text" value={condition}
                onChange={(e) => { setCondition(e.target.value); setWagerError(''); }}
                placeholder="e.g. Arsenal keeps a clean sheet"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </Field>

            {/* Stake type toggle */}
            <Field label="Stake Type">
              <div className="flex gap-2">
                {(['money', 'other'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => { setStakeType(t); setWagerError(''); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      stakeType === t
                        ? t === 'money' ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'border-[#334155] text-slate-500 hover:text-slate-300'
                    }`}>
                    {t === 'money' ? '💰 Money (₪)' : '🍺 Other'}
                  </button>
                ))}
              </div>
            </Field>

            {/* Money amount */}
            {stakeType === 'money' && (
              <Field label="Amount (₪) *">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₪</span>
                  <input type="number" min="1" step="any" value={monetaryValue}
                    onChange={(e) => { setMonetaryValue(e.target.value); setWagerError(''); }}
                    placeholder="0"
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-7 pr-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </Field>
            )}

            {/* Stake description */}
            <Field label={stakeType === 'money' ? 'Description (optional)' : 'Stake *'}>
              <input type="text" value={stake}
                onChange={(e) => { setStake(e.target.value); setWagerError(''); }}
                placeholder={stakeType === 'money' ? 'e.g. "World Cup Final bet"' : '"Dinner at Taizu", "A week of coffee"'}
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </Field>

            {/* Deadline */}
            <Field label="Deadline (date & time)">
              <input type="datetime-local" value={deadline}
                onChange={(e) => { setDeadline(e.target.value); setWagerError(''); }}
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-sky-500 [color-scheme:dark]"
              />
            </Field>

            {wagerError && (
              <p className="text-rose-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {wagerError}
              </p>
            )}

            <button type="submit" disabled={!deadline}
              className="mt-1 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors cursor-pointer">
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

        {/* Add mode tabs */}
        <div className="flex gap-1 mb-3">
          {(['manual', 'search'] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => { setAddMode(m); setSearchQuery(''); setSearchResults([]); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                addMode === m ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {m === 'manual' ? <><UserPlus className="w-3 h-3" /> Add Manually</> : <><Search className="w-3 h-3" /> Find User</>}
            </button>
          ))}
        </div>

        {addMode === 'manual' ? (
          <form onSubmit={handleAddFriendManual} className="flex flex-col gap-2 mb-4">
            <div className="flex gap-2">
              <input type="text" value={friendInput} onChange={(e) => setFriendInput(e.target.value)}
                placeholder="Friend's name..."
                className="flex-1 bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-sky-500 min-w-0"
              />
              <button type="submit" disabled={!friendInput.trim()}
                className="shrink-0 p-2 bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-sky-400 border border-sky-500/30 rounded-lg transition-colors cursor-pointer"
                title="Add friend">
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
            <input type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Phone (optional, e.g. +972 50 000 0000)"
              className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-sky-500"
            />
          </form>
        ) : (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by name, email or phone..."
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            {searching && <p className="text-slate-500 text-xs mt-1.5 text-center">Searching…</p>}
            {!searching && searchResults.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {searchResults.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-slate-100 text-sm font-semibold truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-slate-500 text-[10px] truncate">{p.email}</p>
                    </div>
                    <button onClick={() => void handleAddFromSearch(p)}
                      className="shrink-0 text-xs text-sky-400 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer">
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!searching && searchQuery.trim().length >= 3 && searchResults.length === 0 && (
              <p className="text-slate-600 text-xs mt-1.5 text-center">No users found.</p>
            )}
            {!searching && searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
              <p className="text-slate-600 text-xs mt-1.5 text-center">Enter at least 3 characters.</p>
            )}
          </div>
        )}

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
                    <div className="flex items-center gap-1">
                      <p className="text-slate-100 text-sm font-semibold truncate">{fr.name}</p>
                      {fr.profileId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Registered user" />}
                    </div>
                    {fr.phone && <p className="text-slate-600 text-[10px] truncate">{fr.phone}</p>}
                    <div className="h-1 bg-[#0F172A] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${winPct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="text-emerald-400 font-semibold">{fr.wins}W</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-rose-400 font-semibold">{fr.losses}L</span>
                    <button onClick={() => void onRemoveFriend(fr.id)}
                      className="ml-0.5 p-1 rounded text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Remove friend">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Global Rankings ── */}
      {leaderboard.length > 0 && (
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="text-violet-400 w-4 h-4" />
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Global Rankings</h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {leaderboard.slice(0, 8).map((entry, i) => {
              const av     = AVATARS[entry.avatarId] ?? AVATARS[0];
              const winPct = entry.decided > 0 ? Math.round((entry.wins / entry.decided) * 100) : 0;
              const isMe   = entry.id === currentProfileId;
              return (
                <div key={entry.id} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${isMe ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}`}>
                  <span className={`text-xs font-bold w-4 shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-slate-600'}`}>
                    {i + 1}
                  </span>
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm shrink-0 ${av.bg} ${av.border}`}>
                    {av.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isMe ? 'text-emerald-400' : 'text-slate-100'}`}>
                      {entry.firstName} {entry.lastName}{isMe ? ' (you)' : ''}
                    </p>
                    <p className="text-slate-600 text-[10px]">{entry.total} bet{entry.total !== 1 ? 's' : ''} · {winPct}% win rate</p>
                  </div>
                  <span className="text-emerald-400 text-xs font-bold shrink-0">{entry.wins}W</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Desktop Alerts Toggle ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notificationsEnabled ? <Bell className="text-emerald-400 w-4 h-4" /> : <BellOff className="text-slate-500 w-4 h-4" />}
            <div>
              <p className="text-slate-300 text-xs font-semibold">Desktop Alerts</p>
              <p className="text-slate-600 text-[10px]">{notificationsEnabled ? 'Notifying on results' : 'Click to enable'}</p>
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
