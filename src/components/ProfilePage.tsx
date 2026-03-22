import {
  ArrowLeft, UserCog, Trophy, TrendingUp, Target,
  Calendar, Users, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import type { Wager, Friend, UserProfile, LeaderboardEntry } from '../types';
import { getPersonalResult, isDecided, isActiveForUser } from '../lib/wagerUtils';
import { AVATARS } from '../avatars';

interface Props {
  profile:     UserProfile;
  wagers:      Wager[];
  friends:     Friend[];
  leaderboard: LeaderboardEntry[];
  onBack:      () => void;
  onEditProfile: () => void;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function fmtMonth(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

export default function ProfilePage({ profile, wagers, friends, leaderboard, onBack, onEditProfile }: Props) {
  const avatar = AVATARS[profile.avatarId] ?? AVATARS[0];
  const uid    = profile.id;

  // ── Stats — all use getPersonalResult so participant wagers count correctly ──
  const totalWagers = wagers.length;
  const wins        = wagers.filter((w) => getPersonalResult(w, uid) === 'won').length;
  const losses      = wagers.filter((w) => getPersonalResult(w, uid) === 'lost').length;
  const decided     = wins + losses;
  const winRate     = decided > 0 ? Math.round((wins / decided) * 100) : 0;
  const activeBets  = wagers.filter((w) => isActiveForUser(w, uid)).length;

  const rankIndex  = leaderboard.findIndex((e) => e.id === uid);
  const ranking    = rankIndex >= 0 ? rankIndex + 1 : null;

  // ── Recent settled activity (last 5 decided wagers, personal perspective) ───
  const recentActivity = [...wagers]
    .filter((w) => isDecided(w, uid))
    .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0F172A]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Header bar ── */}
      <header className="border-b border-[#1E293B] px-4 md:px-8 py-3 flex items-center gap-3 sticky top-0 z-30 bg-[#0F172A]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col gap-6">

        {/* ── Identity card ── */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="shrink-0">
            {profile.profilePicture ? (
              <img
                src={profile.profilePicture}
                alt="avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500/50"
              />
            ) : (
              <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center text-3xl ${avatar.bg} ${avatar.border}`}>
                {avatar.emoji}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-slate-100 font-extrabold text-2xl tracking-tight">
              {profile.firstName} {profile.lastName}
            </h1>
            {profile.email && (
              <p className="text-slate-400 text-sm mt-0.5 truncate">{profile.email}</p>
            )}
            {profile.phone && (
              <p className="text-slate-500 text-xs mt-0.5">{profile.phone}</p>
            )}
            {profile.memberSince && (
              <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-2 text-slate-600 text-xs">
                <Calendar className="w-3 h-3" />
                Member since {fmtMonth(profile.memberSince)}
              </div>
            )}
          </div>

          <button
            onClick={onEditProfile}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-[#334155] transition-colors cursor-pointer"
          >
            <UserCog className="w-3.5 h-3.5" /> Edit Profile
          </button>
        </div>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Target className="w-5 h-5 text-sky-400" />}
            value={totalWagers}
            label="Total Wagers"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
            value={activeBets}
            label="Active Now"
          />
          <StatCard
            icon={<Trophy className="w-5 h-5 text-yellow-400" />}
            value={`${winRate}%`}
            label="Win Rate"
          />
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4 flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold text-xl">{wins}W</span>
              <span className="text-slate-600">|</span>
              <span className="text-rose-400 font-bold text-xl">{losses}L</span>
            </div>
            <span className="text-slate-500 text-xs text-center">Win / Loss Record</span>
          </div>
          {ranking && (
            <StatCard
              icon={<span className="text-xl">{ranking === 1 ? '🥇' : ranking === 2 ? '🥈' : ranking === 3 ? '🥉' : `#${ranking}`}</span>}
              value={ranking === 1 ? '1st' : ranking === 2 ? '2nd' : ranking === 3 ? '3rd' : `#${ranking}`}
              label="Global Rank"
            />
          )}
          <StatCard
            icon={<span className="text-xl">🍺</span>}
            value={wagers.filter((w) => w.stake && /beer|pint/i.test(w.stake)).length}
            label="Beer Bets"
          />
        </div>

        {/* ── Recent activity ── */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Recent Activity</h2>
          </div>

          {recentActivity.length === 0 ? (
            <p className="text-slate-600 text-xs text-center py-3">No settled wagers yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#334155]">
              {recentActivity.map((w) => {
                // Use personal perspective — not raw DB result which is creator-centric
                const personalWon = getPersonalResult(w, uid) === 'won';
                return (
                  <div key={w.id} className="flex items-center gap-3 py-3">
                    {personalWon ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-100 text-sm font-semibold truncate">{w.title || w.condition}</p>
                      <p className="text-slate-500 text-xs truncate">
                        vs. {w.friends.join(', ') || '—'} · {fmtDate(w.deadline)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                      personalWon
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {personalWon ? 'WON' : 'LOST'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Friends list ── */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">My Friends</h2>
            <span className="bg-sky-500/10 text-sky-400 text-[10px] font-bold px-2 py-px rounded-full border border-sky-500/20">
              {friends.length}
            </span>
          </div>

          {friends.length === 0 ? (
            <p className="text-slate-600 text-xs text-center py-3">No friends added yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {friends.map((fr) => {
                // Mutual wagers: wagers where this friend is a participant (their name in the list)
                // OR where the friend is the creator (registered friends with a profileId).
                const friendWagers = wagers.filter((w) => {
                  const friendIsParticipant = Array.isArray(w.friends) && w.friends.includes(fr.name);
                  const friendIsCreator     = !!fr.profileId && w.creatorId === fr.profileId;
                  return friendIsParticipant || friendIsCreator;
                });
                // Count MY wins/losses vs this friend using the personal-perspective helper
                const friendWins   = friendWagers.filter((w) => getPersonalResult(w, uid) === 'won').length;
                const friendLosses = friendWagers.filter((w) => getPersonalResult(w, uid) === 'lost').length;
                return (
                  <div key={fr.id} className="flex items-center gap-3 bg-[#0F172A] rounded-xl px-3 py-2.5">
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
                      {fr.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-slate-100 text-sm font-semibold truncate">{fr.name}</p>
                        {fr.profileId && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Registered user" />
                        )}
                      </div>
                      <p className="text-slate-600 text-[10px]">
                        {friendWagers.length} bet{friendWagers.length !== 1 ? 's' : ''}
                        {(friendWins > 0 || friendLosses > 0) && ` · ${friendWins}W / ${friendLosses}L`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Leaderboard position ── */}
        {leaderboard.length > 0 && ranking && (
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Your Standing</h2>
            </div>
            <div className="flex flex-col gap-2">
              {leaderboard.slice(Math.max(0, rankIndex - 2), rankIndex + 3).map((entry) => {
                const pos   = leaderboard.indexOf(entry) + 1;
                const av    = AVATARS[entry.avatarId] ?? AVATARS[0];
                const isMe  = entry.id === profile.id;
                const pct   = entry.decided > 0 ? Math.round((entry.wins / entry.decided) * 100) : 0;
                return (
                  <div key={entry.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isMe ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[#0F172A]'}`}>
                    <span className={`text-xs font-bold w-5 shrink-0 ${pos === 1 ? 'text-yellow-400' : pos === 2 ? 'text-slate-300' : pos === 3 ? 'text-orange-400' : 'text-slate-600'}`}>
                      {pos}
                    </span>
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm shrink-0 ${av.bg} ${av.border}`}>
                      {av.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMe ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {entry.firstName} {entry.lastName}{isMe ? ' (you)' : ''}
                      </p>
                      <p className="text-slate-600 text-[10px]">{entry.total} bets · {pct}% win rate</p>
                    </div>
                    <span className="text-emerald-400 text-xs font-bold shrink-0">{entry.wins}W</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4 flex flex-col items-center gap-1.5">
      {icon}
      <span className="text-slate-100 font-bold text-xl">{value}</span>
      <span className="text-slate-500 text-xs text-center">{label}</span>
    </div>
  );
}
