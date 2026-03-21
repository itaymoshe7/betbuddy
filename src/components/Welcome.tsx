import { useState, useRef } from 'react';
import { Zap, ArrowRight, User, Phone, Mail, Camera, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { AVATARS } from '../avatars';

interface Props {
  onComplete: (profile: UserProfile) => void;
  initialValues?: UserProfile;      // passed when editing existing profile
}

/** Resize & center-crop an image file to 200×200, return base64 JPEG ≤ ~60 KB */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
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
  const [firstName,      setFirstName]      = useState(initialValues?.firstName      ?? '');
  const [lastName,       setLastName]        = useState(initialValues?.lastName       ?? '');
  const [phone,          setPhone]           = useState(initialValues?.phone          ?? '');
  const [email,          setEmail]           = useState(initialValues?.email          ?? '');
  const [avatarId,       setAvatarId]        = useState(initialValues?.avatarId       ?? 0);
  const [profilePicture, setProfilePicture]  = useState<string | undefined>(initialValues?.profilePicture);
  const [uploading,      setUploading]       = useState(false);
  const [errors,         setErrors]          = useState<Partial<Record<'firstName' | 'email', string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await resizeImage(file);
      setProfilePicture(b64);
    } catch { /* ignore bad files */ }
    finally { setUploading(false); }
    // reset input so same file can be re-selected
    e.target.value = '';
  }

  function validate() {
    const e: typeof errors = {};
    if (!firstName.trim()) e.firstName = 'First name is required.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = 'Enter a valid email address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    onComplete({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), email: email.trim(), avatarId, profilePicture });
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
            {initialValues ? 'Edit Profile' : 'Welcome aboard!'}
          </h1>
          <p className="text-slate-400 text-sm">
            {initialValues ? 'Update your details below.' : 'Set up your profile to start wagering with friends.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 md:px-8 py-6 flex flex-col gap-5">
          {/* Profile Picture + Avatar Row */}
          <div className="flex flex-col items-center gap-3">
            {/* Picture preview / upload target */}
            <div className="relative">
              {profilePicture ? (
                <div className="relative">
                  <img
                    src={profilePicture}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setProfilePicture(undefined)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center cursor-pointer"
                    title="Remove photo"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center text-3xl ${selectedAvatar.bg} ${selectedAvatar.border}`}>
                  {selectedAvatar.emoji}
                </div>
              )}
            </div>

            {/* Upload button */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs text-sky-400 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : profilePicture ? 'Change Photo' : 'Upload Photo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Emoji Avatar Picker (shown when no custom photo) */}
          {!profilePicture && (
            <div>
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-3 text-center">
                — or pick an avatar —
              </label>
              <div className="flex gap-2 justify-center flex-wrap">
                {AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setAvatarId(av.id)}
                    title={av.label}
                    className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl transition-all cursor-pointer ${av.bg} ${av.border} ${
                      avatarId === av.id
                        ? `ring-2 ring-offset-2 ring-offset-[#1E293B] ${av.ring} scale-110`
                        : 'opacity-55 hover:opacity-90 hover:scale-105'
                    }`}
                  >
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
                <input
                  type="text" value={firstName}
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

          {/* Phone */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+972 50 000 0000"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Email</label>
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

          <button type="submit"
            className="mt-1 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm min-h-[48px]"
          >
            {initialValues ? 'Save Changes' : 'Start Wagering'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-slate-600 text-xs text-center">Your data is stored locally and never shared.</p>
        </form>
      </div>
    </div>
  );
}
