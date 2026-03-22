import type { Wager, Friend } from '../types';
import { getPersonalResult } from '../lib/wagerUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFriends(list: string[]): string {
  if (list.length === 0) return 'someone';
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' & ' + list[list.length - 1];
}

function fmtRelative(iso: string | undefined): string {
  if (!iso) return '';
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtStake(w: Wager): string {
  return w.stakeType === 'money' && w.monetaryValue
    ? `₪${w.monetaryValue.toLocaleString()}`
    : w.stake || '—';
}

// ── Activity item model ───────────────────────────────────────────────────────

type ActivityType = 'win' | 'loss' | 'active' | 'pending' | 'overdue' | 'awaiting' | 'settled' | 'declined';

interface ActivityItem {
  id:        string;
  timestamp: string;
  emoji:     string;
  headline:  string;
  sub:       string;
  type:      ActivityType;
}

const borderColor: Record<ActivityType, string> = {
  win:      'border-l-emerald-400',
  loss:     'border-l-rose-400',
  active:   'border-l-sky-400',
  pending:  'border-l-amber-400',
  overdue:  'border-l-rose-500',
  awaiting: 'border-l-orange-400',
  settled:  'border-l-slate-500',
  declined: 'border-l-slate-600',
};

const bgColor: Record<ActivityType, string> = {
  win:      'bg-emerald-500/5',
  loss:     'bg-rose-500/5',
  active:   'bg-sky-500/5',
  pending:  'bg-amber-500/5',
  overdue:  'bg-rose-500/5',
  awaiting: 'bg-orange-500/5',
  settled:  'bg-slate-500/5',
  declined: 'bg-slate-700/5',
};

// ── Build activity items ──────────────────────────────────────────────────────

function buildItems(wagers: Wager[], uid: string): ActivityItem[] {
  return wagers.map((w): ActivityItem => {
    const personal  = getPersonalResult(w, uid);
    const isOwner   = w.creatorId === uid;
    const opponent  = isOwner ? fmtFriends(w.friends) : (w.creatorName || 'Your friend');
    const condition = w.title || w.condition || '—';
    const stake     = fmtStake(w);
    const ts        = w.createdAt ?? w.deadline;

    switch (personal) {
      case 'won':
        return {
          id: w.id, timestamp: ts, emoji: '🏆', type: 'win',
          headline: `You WON against ${opponent}!`,
          sub: `${condition} — ${stake}`,
        };
      case 'lost':
        return {
          id: w.id, timestamp: ts, emoji: '💸', type: 'loss',
          headline: `You LOST against ${opponent}`,
          sub: `${condition} — ${stake}`,
        };
      case 'awaiting_payment':
        return isOwner
          ? { id: w.id, timestamp: ts, emoji: '💰', type: 'awaiting',
              headline: `${opponent} owes you ${stake}`, sub: condition }
          : { id: w.id, timestamp: ts, emoji: '💸', type: 'loss',
              headline: `You owe ${opponent} ${stake}`, sub: condition };
      case 'overdue':
        return {
          id: w.id, timestamp: ts, emoji: '⏰', type: 'overdue',
          headline: `Overdue bet with ${opponent}`,
          sub: `Declare a winner! — ${condition}`,
        };
      case 'pending':
      case 'active':
        return isOwner
          ? { id: w.id, timestamp: ts, emoji: '⚡', type: 'active',
              headline: `Active bet with ${opponent}`,
              sub: `${condition} — ${stake}` }
          : { id: w.id, timestamp: ts, emoji: '⚡', type: 'active',
              headline: `${w.creatorName || 'Your friend'} challenged you`,
              sub: `${condition} — ${stake}` };
      case 'pending_approval':
        return isOwner
          ? { id: w.id, timestamp: ts, emoji: '🎲', type: 'pending',
              headline: `You challenged ${opponent}`,
              sub: `Waiting for approval — ${stake}` }
          : { id: w.id, timestamp: ts, emoji: '🔔', type: 'pending',
              headline: `${opponent} challenged you`,
              sub: `${condition} — ${stake}` };
      case 'settled':
        return {
          id: w.id, timestamp: ts, emoji: '✅', type: 'settled',
          headline: `Settled with ${opponent}`,
          sub: condition,
        };
      case 'declined':
        return {
          id: w.id, timestamp: ts, emoji: '❌', type: 'declined',
          headline: `Wager with ${opponent} was declined`,
          sub: condition,
        };
      default:
        return {
          id: w.id, timestamp: ts, emoji: '🎲', type: 'pending',
          headline: `Wager with ${opponent}`,
          sub: condition,
        };
    }
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  wagers:        Wager[];
  friends:       Friend[];
  currentUserId: string;
}

export default function NewsFeed({ wagers, currentUserId }: Props) {
  const items = buildItems(wagers, currentUserId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#1E293B] border border-[#334155] flex items-center justify-center text-3xl">
          📰
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-semibold text-base">No activity yet</p>
          <p className="text-slate-600 text-sm mt-1">Create your first wager to see the feed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-slate-100 font-bold text-xl md:text-2xl tracking-tight">Activity Feed</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {items.length} event{items.length !== 1 ? 's' : ''} · updates in real-time
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-4 rounded-xl border border-[#334155] border-l-4 ${borderColor[item.type]} ${bgColor[item.type]}`}
          >
            <span className="text-2xl shrink-0 mt-0.5 select-none">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-semibold text-sm leading-snug">{item.headline}</p>
              <p className="text-slate-500 text-xs mt-0.5 truncate">{item.sub}</p>
            </div>
            <span className="text-slate-600 text-[10px] shrink-0 mt-0.5 whitespace-nowrap">
              {fmtRelative(item.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
