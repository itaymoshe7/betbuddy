import { useState } from 'react';
import {
  CheckCircle, XCircle, MessageCircle, Trash2,
  CalendarPlus, ChevronDown,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Wager, WagerStatus, Friend } from '../types';
import { sendNotification } from '../notifications';
import { buildGoogleCalendarUrl, downloadICS } from '../lib/calendar';

const statusConfig: Record<WagerStatus, { label: string; badgeClass: string; dotClass: string }> = {
  pending_approval: { label: 'AWAITING APPROVAL', badgeClass: 'bg-amber-400/10 text-amber-400 border border-amber-400/30',   dotClass: 'bg-amber-400'   },
  pending:          { label: 'PENDING',            badgeClass: 'bg-sky-400/10 text-sky-400 border border-sky-400/30',         dotClass: 'bg-sky-400'     },
  won:              { label: 'WON',                badgeClass: 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30', dotClass: 'bg-emerald-400' },
  awaiting_payment: { label: 'AWAITING PAYMENT',  badgeClass: 'bg-orange-400/10 text-orange-400 border border-orange-400/30', dotClass: 'bg-orange-400'  },
  lost:             { label: 'LOST',               badgeClass: 'bg-rose-400/10 text-rose-400 border border-rose-400/30',      dotClass: 'bg-rose-400'    },
  settled:          { label: 'SETTLED',            badgeClass: 'bg-slate-400/10 text-slate-400 border border-slate-400/30',   dotClass: 'bg-slate-400'   },
  declined:         { label: 'DECLINED',           badgeClass: 'bg-slate-500/10 text-slate-500 border border-slate-500/20',   dotClass: 'bg-slate-500'   },
};

const statusLine: Record<WagerStatus, string> = {
  pending_approval: 'WAITING FOR APPROVAL',
  pending:          'IN PROGRESS',
  awaiting_payment: 'SETTLED — AWAITING PAYMENT',
  won:              'SETTLED — WON',
  lost:             'SETTLED — LOST',
  settled:          'DEBT PAID — CLOSED',
  declined:         'DECLINED BY PARTICIPANT',
};

const actionLabel: Record<WagerStatus, string> = {
  pending_approval: 'Waiting for Approval',
  pending:          'Declare Result',
  won:              'Claim Payout',
  awaiting_payment: 'Mark as Received',
  lost:             'Pay Up',
  settled:          'Closed',
  declined:         'Declined',
};

const actionClass: Record<WagerStatus, string> = {
  pending_approval: 'bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-not-allowed',
  pending:          'bg-slate-600 hover:bg-slate-500 text-slate-100 font-semibold',
  won:              'bg-emerald-500 hover:bg-emerald-400 text-white font-semibold',
  awaiting_payment: 'bg-orange-500 hover:bg-orange-400 text-white font-semibold',
  lost:             'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-semibold border border-rose-500/30',
  settled:          'bg-slate-700/50 text-slate-500 font-semibold cursor-not-allowed',
  declined:         'bg-slate-700/50 text-slate-500 font-semibold cursor-not-allowed',
};

interface Props {
  wager: Wager;
  friends: Friend[];
  isOwner: boolean;
  notificationsEnabled: boolean;
  onUpdate: (id: string, updates: Partial<Wager>) => void;
  onDelete: () => void;
}

function formatFriends(friends: string[]): string {
  if (friends.length === 0) return '—';
  if (friends.length === 1) return friends[0];
  return friends.slice(0, -1).join(', ') + ' & ' + friends[friends.length - 1];
}

function formatDeadline(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fireConfetti() {
  confetti({
    particleCount: 140, spread: 80, origin: { y: 0.55 },
    colors: ['#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24', '#f59e0b', '#ffffff'],
  });
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? '972' + digits.slice(1) : digits;
}

function buildWhatsAppUrl(wagerFriendNames: string[], allFriends: Friend[], condition: string, stake: string): string {
  const greeting = wagerFriendNames.length === 1
    ? `Hey ${wagerFriendNames[0]}`
    : `Hey ${formatFriends(wagerFriendNames)}`;
  const msg = `${greeting}, our bet "${condition}" is settled! You owe me ${stake}. Pay up! Sent via BetBuddy.`;
  if (wagerFriendNames.length === 1) {
    const friend = allFriends.find((f) => f.name === wagerFriendNames[0]);
    if (friend?.phone?.trim()) {
      return `https://wa.me/${formatPhone(friend.phone.trim())}?text=${encodeURIComponent(msg)}`;
    }
  }
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export default function WagerCard({ wager, friends, isOwner, notificationsEnabled, onUpdate, onDelete }: Props) {
  const [declaringResult, setDeclaringResult] = useState(false);
  const [calOpen,         setCalOpen]         = useState(false);

  const { label, badgeClass, dotClass } = statusConfig[wager.status];
  const isAwaitingPayment = wager.status === 'awaiting_payment';
  const friendsText       = formatFriends(wager.friends);
  const showCalendar      = wager.status === 'pending' || wager.status === 'pending_approval';
  const isInactive        = wager.status === 'settled' || wager.status === 'declined' || wager.status === 'pending_approval';
  const stakeDisplay      = wager.stakeType === 'money' && wager.monetaryValue
    ? `₪${wager.monetaryValue.toLocaleString()}${wager.stake ? ` — ${wager.stake}` : ''}`
    : wager.stake;

  function handleAction() {
    switch (wager.status) {
      case 'pending':          setDeclaringResult(true);                           break;
      case 'won':              onUpdate(wager.id, { status: 'awaiting_payment' }); break;
      case 'awaiting_payment': onUpdate(wager.id, { status: 'settled' });          break;
      case 'lost':             onUpdate(wager.id, { status: 'settled' });          break;
    }
  }

  function handleDeclare(result: 'won' | 'lost') {
    onUpdate(wager.id, { status: result, result });
    setDeclaringResult(false);
    if (result === 'won') {
      fireConfetti();
      if (notificationsEnabled) sendNotification('🏆 Wager Settled!', `Collect your ${wager.stake} from ${friendsText}!`);
    } else {
      if (notificationsEnabled) sendNotification('💸 Wager Settled', `You owe ${friendsText} — ${wager.stake}.`);
    }
  }

  return (
    <div className={`flex flex-col bg-[#1E293B] border rounded-xl overflow-hidden transition-all ${
      isAwaitingPayment    ? 'border-orange-400/40 awaiting-glow'
      : wager.status === 'pending_approval' ? 'border-amber-400/30'
      : wager.status === 'declined'         ? 'border-slate-700/50 opacity-60'
      : 'border-[#334155]'
    }`}>
      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 p-5 pb-4">
        {isOwner && !isInactive && (
          <button
            onClick={() => { if (window.confirm('Delete this wager? This cannot be undone.')) onDelete(); }}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer z-10"
            title="Delete wager"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-slate-100 font-bold text-sm tracking-wider leading-snug uppercase truncate">
            {wager.title || wager.condition}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            {wager.friends.slice(0, 4).map((name) => (
              <div key={name} title={name}
                className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">
                {name.slice(0, 2).toUpperCase()}
              </div>
            ))}
            {wager.friends.length > 4 && <span className="text-slate-500 text-xs">+{wager.friends.length - 4}</span>}
            <span className="text-slate-500 text-xs truncate">
              {wager.friends.length > 0 ? `vs. ${friendsText}` : ''}
            </span>
          </div>
        </div>
        <span className={`shrink-0 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${badgeClass} ${isOwner && !isInactive ? 'mr-7' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          {label}
        </span>
      </div>

      <div className="mx-5 border-t border-[#334155]" />

      {/* Details */}
      <div className="p-5 pt-4 flex flex-col gap-2 flex-1">
        <Row label={wager.friends.length > 1 ? 'Friends' : 'Friend'} value={friendsText} />
        <Row label="Stake"    value={stakeDisplay} />
        <Row label="Deadline" value={formatDeadline(wager.deadline)} />
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Status</span>
          <span className="text-slate-300 font-medium text-right text-xs">{statusLine[wager.status]}</span>
        </div>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{wager.condition}</p>
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 flex flex-col gap-2">
        {declaringResult ? (
          <>
            <p className="text-slate-400 text-xs text-center">Who won this bet?</p>
            <div className="flex gap-2">
              <button onClick={() => handleDeclare('won')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-semibold border border-emerald-500/30 transition-colors cursor-pointer">
                <CheckCircle className="w-4 h-4" /> I Won
              </button>
              <button onClick={() => handleDeclare('lost')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-semibold border border-rose-500/30 transition-colors cursor-pointer">
                <XCircle className="w-4 h-4" /> I Lost
              </button>
            </div>
            <button onClick={() => setDeclaringResult(false)}
              className="text-slate-600 hover:text-slate-400 text-xs text-center transition-colors cursor-pointer">
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* Main action */}
            <button
              onClick={handleAction}
              disabled={isInactive || !isOwner}
              className={`w-full py-3 rounded-lg text-sm transition-colors ${actionClass[wager.status]} ${(!isOwner && !isInactive) ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={!isOwner && !isInactive ? 'Only the bet creator can update this wager' : undefined}
            >
              {actionLabel[wager.status]}
            </button>

            {/* WhatsApp remind */}
            {isAwaitingPayment && (
              <a href={buildWhatsAppUrl(wager.friends, friends, wager.condition, wager.stake)}
                target="_blank" rel="noopener noreferrer"
                className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 transition-colors">
                <MessageCircle className="w-4 h-4" />
                {wager.friends.length > 1 ? 'Remind All via WhatsApp' : 'Remind via WhatsApp'}
              </a>
            )}

            {/* Add to Calendar — shown on active wagers */}
            {showCalendar && (
              <div className="relative">
                <button
                  onClick={() => setCalOpen((o) => !o)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 border border-[#334155] transition-colors cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Add to Calendar
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${calOpen ? 'rotate-180' : ''}`} />
                </button>
                {calOpen && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#0F172A] border border-[#334155] rounded-lg shadow-xl overflow-hidden z-20">
                    <a href={buildGoogleCalendarUrl(wager)} target="_blank" rel="noopener noreferrer"
                      onClick={() => setCalOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-slate-300 hover:bg-slate-800 text-xs transition-colors cursor-pointer">
                      <span className="text-base">📅</span> Google Calendar
                    </a>
                    <button onClick={() => { downloadICS(wager); setCalOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-slate-300 hover:bg-slate-800 text-xs transition-colors cursor-pointer border-t border-[#334155]">
                      <span className="text-base">📁</span> Download .ics
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-100 font-medium text-right truncate">{value}</span>
    </div>
  );
}
