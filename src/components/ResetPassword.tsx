import { useState } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, Zap, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // After password update the user is fully signed in — reload to trigger INITIAL_SESSION
      setTimeout(() => window.location.replace('/'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-2xl shadow-2xl overflow-hidden">

        <div className="bg-gradient-to-br from-emerald-900/40 to-[#1E293B] px-6 md:px-8 pt-8 pb-6 text-center border-b border-[#334155]">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="text-emerald-400 w-7 h-7" fill="currentColor" />
            <span className="text-slate-100 font-extrabold text-2xl tracking-tight">BetBuddy</span>
          </div>
          <h1 className="text-slate-100 font-bold text-xl mb-1">Set New Password</h1>
          <p className="text-slate-400 text-sm">Enter and confirm your new password below.</p>
        </div>

        <div className="px-6 md:px-8 py-6">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
              <p className="text-slate-100 font-semibold">Password updated!</p>
              <p className="text-slate-400 text-sm text-center">Redirecting to your dashboard…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div className="flex items-start gap-2 bg-rose-900/30 border border-rose-500/30 text-rose-300 text-xs rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">New Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="Min. 6 characters"
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">Confirm Password</label>
                <input
                  type="password" value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  placeholder="Repeat your password"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                />
              </div>

              <button type="submit" disabled={loading}
                className="mt-1 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm min-h-[48px]"
              >
                <Lock className="w-4 h-4" />
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
