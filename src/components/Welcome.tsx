import { useState, useRef } from 'react';
import {
  Zap, ArrowRight, User, Phone, Mail, Camera, X,
  LogIn, Eye, EyeOff, AlertCircle, CheckCircle, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';
import { AVATARS } from '../avatars';

interface Props {
  onComplete: (profile: UserProfile) => void;
  initialValues?: UserProfile;
}

// ── Phone prefix data ────────────────────────────────────────────────────────

const PHONE_PREFIXES = [
  { label: '🇮🇱 +972', value: '+972' },
  { label: '🇺🇸 +1',   value: '+1'   },
  { label: '🇬🇧 +44',  value: '+44'  },
  { label: '🇩🇪 +49',  value: '+49'  },
  { label: '🇫🇷 +33',  value: '+33'  },
  { label: '🇪🇸 +34',  value: '+34'  },
  { label: '🇮🇹 +39',  value: '+39'  },
  { label: '🇦🇺 +61',  value: '+61'  },
  { label: '🇨🇦 +1',   value: '+1'   },
  { label: '🇮🇳 +91',  value: '+91'  },
  { label: '🇧🇷 +55',  value: '+55'  },
  { label: '🇹🇷 +90',  value: '+90'  },
  { label: '🇵🇱 +48',  value: '+48'  },
  { label: '🇳🇱 +31',  value: '+31'  },
  { label: '🇷🇺 +7',   value: '+7'   },
];

/** Parse a full E.164 phone into prefix + local.  Falls back to (+972, stripped). */
function parsePhone(full: string): { prefix: string; local: string } {
  if (!full) return { prefix: '+972', local: '' };
  if (!full.startsWith('+')) return { prefix: '+972', local: full.replace(/^0+/, '') };
  const sorted = [...PHONE_PREFIXES].sort((a, b) => b.value.length - a.value.length);
  for (const p of sorted) {
    if (full.startsWith(p.value)) return { prefix: p.value, local: full.slice(p.value.length) };
  }
  return { prefix: '+972', local: full.replace(/^\+\d{1,4}/, '') };
}

/** Resize & center-crop to 200×200, return base64 JPEG ≤ ~60 KB */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img  = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const sx   = (img.width  - size) / 2;
      const sy   = (img.height - size) / 2;
      const canvas = document.createElement('canvas');
      canvas.width  = 200;
      canvas.height = 200;
      canvas.getContext('2d')!.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Welcome({ onComplete, initialValues }: Props) {
  const isEditing = !!initialValues;
  const [mode,         setMode]         = useState<'signup' | 'login' | 'forgot'>(isEditing ? 'signup' : 'signup');
  const [authError,    setAuthError]    = useState('');
  const [loading,      setLoading]      = useState(false);

  // ── Signup / Edit state ──────────────────────────────────────────────────
  const [firstName,      setFirstName]      = useState(initialValues?.firstName      ?? '');
  const [lastName,       setLastName]       = useState(initialValues?.lastName       ?? '');
  const [email,          setEmail]          = useState(initialValues?.email          ?? '');
  const [password,       setPassword]       = useState('');
  const [showPassword,   setShowPassword]   = useState(false);
  const [avatarId,       setAvatarId]       = useState(initialValues?.avatarId       ?? 0);
  const [profilePicture, setProfilePicture] = useState<string | undefined>(initialValues?.profilePicture);
  const [uploading,      setUploading]      = useState(false);
  const [errors,         setErrors]         = useState<Partial<Record<string, string>>>({});

  // Phone split into prefix + local number
  const parsed = parsePhone(initialValues?.phone ?? '');
  const [phonePrefix, setPhonePrefix] = useState(parsed.prefix);
  const [phoneLocal,  setPhoneLocal]  = useState(parsed.local);

  // ── Login state ──────────────────────────────────────────────────────────
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPwd,  setShowLoginPwd]  = useState(false);

  // ── Forgot password state ────────────────────────────────────────────────
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotSent,    setForgotSent]    = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  /** Full E.164 phone — strips any leading zero from the local part */
  const fullPhone = phoneLocal.trim()
    ? phonePrefix + phoneLocal.trim().replace(/^0+/, '')
    : '';

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try   { setProfilePicture(await resizeImage(file)); }
    catch { /* ignore bad files */ }
    finally { setUploading(false); }
    e.target.value = '';
  }

  function validateSignup() {
    const e: typeof errors = {};
    if (!firstName.trim()) e.firstName = 'First name is required.';
    if (!email.trim())     e.email     = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!isEditing && password.length < 6) e.password = 'Password must be at least 6 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSignup(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validateSignup()) return;
    setLoading(true);
    setAuthError('');
    try {
      if (isEditing) {
        const { error } = await supabase.from('profiles').update({
          first_name: firstName.trim(),
          last_name:  lastName.trim(),
          phone:      fullPhone,
          email:      email.trim(),
          avatar_id:  avatarId,
          avatar_url: profilePicture ?? null,
        }).eq('id', initialValues!.id);
        if (error) throw error;
        onComplete({
          ...initialValues!,
          firstName: firstName.trim(), lastName: lastName.trim(),
          phone: fullPhone,            email: email.trim(),
          avatarId, profilePicture,
        });
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.user) throw new Error('Sign-up failed — please try again.');

        const { error: profileError } = await supabase.from('profiles').insert({
          id:         data.user.id,
          first_name: firstName.trim(),
          last_name:  lastName.trim(),
          phone:      fullPhone,
          email:      email.trim(),
          avatar_id:  avatarId,
          avatar_url: profilePicture ?? null,
        });
        if (profileError) throw profileError;

        onComplete({
          id:        data.user.id,
          firstName: firstName.trim(), lastName: lastName.trim(),
          phone:     fullPhone,        email:    email.trim(),
          avatarId,  profilePicture,
        });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email:    loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      if (!data.user) throw new Error('Login failed.');

      const { data: pRow, error: pErr } = await supabase
        .from('profiles').select('*').eq('id', data.user.id).single();
      if (pErr) throw pErr;

      onComplete({
        id:             pRow.id,
        firstName:      pRow.first_name,
        lastName:       pRow.last_name  ?? '',
        phone:          pRow.phone      ?? '',
        email:          pRow.email,
        avatarId:       pRow.avatar_id  ?? 0,
        profilePicture: pRow.avatar_url ?? undefined,
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(ev: React.FormEvent) {
    ev.preventDefault();
    if (!forgotEmail.trim()) { setAuthError('Enter your email address.'); return; }
    setForgotLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  const selectedAvatar = AVATARS[avatarId];

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4 md:p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-900/40 to-[#1E293B] px-6 md:px-8 pt-8 pb-6 text-center border-b border-[#334155]">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="text-emerald-400 w-7 h-7" fill="currentColor" />
            <span className="text-slate-100 font-extrabold text-2xl tracking-tight">BetBuddy</span>
          </div>
          <h1 className="text-slate-100 font-bold text-xl mb-1">
            {isEditing ? 'Edit Profile'
              : mode === 'login'  ? 'Welcome back!'
              : mode === 'forgot' ? 'Reset Password'
              : 'Welcome aboard!'}
          </h1>
          <p className="text-slate-400 text-sm">
            {isEditing ? 'Update your details below.'
              : mode === 'login'  ? 'Sign in to your account.'
              : mode === 'forgot' ? 'We\'ll email you a recovery link.'
              : 'Create an account to start wagering.'}
          </p>

          {/* Mode tabs — only for non-edit, non-forgot */}
          {!isEditing && mode !== 'forgot' && (
            <div className="flex items-center justify-center gap-1 mt-5">
              {(['signup', 'login'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setAuthError(''); setErrors({}); }}
                  className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    mode === m
                      ? m === 'signup'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {m === 'signup' ? 'Sign Up' : 'Log In'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Login form ── */}
        {mode === 'login' && !isEditing ? (
          <form onSubmit={handleLogin} className="px-6 md:px-8 py-6 flex flex-col gap-5">
            {authError && <AuthError msg={authError} />}

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="email" value={loginEmail}
                  onChange={(e) => { setLoginEmail(e.target.value); setAuthError(''); }}
                  placeholder="itay@example.com"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-sky-500 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showLoginPwd ? 'text' : 'password'} value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setAuthError(''); }}
                  placeholder="Your password"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:border-sky-500 placeholder-slate-600"
                />
                <button type="button" onClick={() => setShowLoginPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer">
                  {showLoginPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setAuthError(''); setForgotSent(false); }}
                className="self-end text-[11px] text-sky-400 hover:text-sky-300 transition-colors cursor-pointer mt-0.5"
              >
                Forgot Password?
              </button>
            </div>

            <button type="submit" disabled={loading}
              className="mt-1 w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm min-h-[48px]"
            >
              {loading ? 'Signing in…' : 'Log In'} <LogIn className="w-4 h-4" />
            </button>
            <p className="text-slate-600 text-xs text-center">Your data is stored securely in the cloud.</p>
          </form>

        ) : mode === 'forgot' && !isEditing ? (

          /* ── Forgot Password form ── */
          <div className="px-6 md:px-8 py-6 flex flex-col gap-5">
            {authError && <AuthError msg={authError} />}

            {forgotSent ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
                <div>
                  <p className="text-slate-100 font-semibold">Check your inbox!</p>
                  <p className="text-slate-400 text-sm mt-1">
                    We sent a recovery link to <span className="text-sky-400">{forgotEmail}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setForgotSent(false); setForgotEmail(''); }}
                  className="text-sky-400 hover:text-sky-300 text-sm transition-colors cursor-pointer"
                >
                  ← Back to Log In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-medium">Your Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="email" value={forgotEmail}
                      onChange={(e) => { setForgotEmail(e.target.value); setAuthError(''); }}
                      placeholder="itay@example.com"
                      autoFocus
                      className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-sky-500 placeholder-slate-600"
                    />
                  </div>
                </div>

                <button type="submit" disabled={forgotLoading}
                  className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm min-h-[48px]"
                >
                  {forgotLoading ? 'Sending…' : 'Send Recovery Link'}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('login'); setAuthError(''); }}
                  className="text-slate-500 hover:text-slate-300 text-xs text-center transition-colors cursor-pointer"
                >
                  ← Back to Log In
                </button>
              </form>
            )}
          </div>

        ) : (

        /* ── Signup / Edit form ── */
        <form onSubmit={handleSignup} className="px-6 md:px-8 py-6 flex flex-col gap-5">
          {authError && <AuthError msg={authError} />}

          {/* Profile Picture + Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {profilePicture ? (
                <div className="relative">
                  <img src={profilePicture} alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500/50" />
                  <button type="button" onClick={() => setProfilePicture(undefined)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center cursor-pointer"
                    title="Remove photo">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center text-3xl ${selectedAvatar.bg} ${selectedAvatar.border}`}>
                  {selectedAvatar.emoji}
                </div>
              )}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 text-xs text-sky-400 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
              <Camera className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : profilePicture ? 'Change Photo' : 'Upload Photo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {!profilePicture && (
            <div>
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-3 text-center">— or pick an avatar —</label>
              <div className="flex gap-2 justify-center flex-wrap">
                {AVATARS.map((av) => (
                  <button key={av.id} type="button" onClick={() => setAvatarId(av.id)} title={av.label}
                    className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl transition-all cursor-pointer ${av.bg} ${av.border} ${
                      avatarId === av.id ? `ring-2 ring-offset-2 ring-offset-[#1E293B] ${av.ring} scale-110` : 'opacity-55 hover:opacity-90 hover:scale-105'
                    }`}>
                    {av.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name Row */}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">First Name <span className="text-rose-400">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input type="text" value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: undefined })); }}
                  placeholder="Itay"
                  className={`w-full bg-[#0F172A] border text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 ${errors.firstName ? 'border-rose-500' : 'border-[#334155]'}`}
                />
              </div>
              {errors.firstName && <p className="text-rose-400 text-xs">{errors.firstName}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Cohen"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
              />
            </div>
          </div>

          {/* Phone with country prefix */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">
              <Phone className="w-3 h-3 inline mr-1 mb-px" />
              Phone Number
            </label>
            <div className="flex gap-2">
              {/* Prefix dropdown */}
              <div className="relative shrink-0">
                <select
                  value={phonePrefix}
                  onChange={(e) => setPhonePrefix(e.target.value)}
                  className="appearance-none bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-3 pr-7 py-2.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {PHONE_PREFIXES.map((p) => (
                    <option key={p.label} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              </div>
              {/* Local number input */}
              <input
                type="tel"
                value={phoneLocal}
                onChange={(e) => {
                  // Strip any leading zeros automatically when a prefix is selected
                  const val = e.target.value.replace(/^0+/, '');
                  setPhoneLocal(val);
                }}
                placeholder="501234567"
                className="flex-1 bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 min-w-0"
              />
            </div>
            {fullPhone && (
              <p className="text-slate-600 text-[10px] mt-0.5">Stored as: {fullPhone}</p>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Email <span className="text-rose-400">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="itay@example.com"
                className={`w-full bg-[#0F172A] border text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 ${errors.email ? 'border-rose-500' : 'border-[#334155]'}`}
              />
            </div>
            {errors.email && <p className="text-rose-400 text-xs">{errors.email}</p>}
          </div>

          {/* Password — only for new signup */}
          {!isEditing && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Password <span className="text-rose-400">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder="Min. 6 characters"
                  className={`w-full bg-[#0F172A] border text-slate-100 text-sm rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 ${errors.password ? 'border-rose-500' : 'border-[#334155]'}`}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-rose-400 text-xs">{errors.password}</p>}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="mt-1 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm min-h-[48px]"
          >
            {loading ? 'Please wait…' : isEditing ? 'Save Changes' : 'Create Account'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-slate-600 text-xs text-center">Your data is stored securely in the cloud.</p>
        </form>
        )}
      </div>
    </div>
  );
}

function AuthError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-rose-900/30 border border-rose-500/30 text-rose-300 text-xs rounded-lg px-3 py-2.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {msg}
    </div>
  );
}
