"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { loginAdmin, setAdminKey } from "@/lib/api";
import { Btn, Field, FieldError, Input } from "@/components/ui/kit";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function LoginPage() {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const router = useRouter();

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setErr("");
  }, []);

  async function handleLogin() {
    const k = key.trim();
    if (!k) { setErr("Admin key wajib diisi"); return; }
    if (!turnstileVerified) {
      setErr("Selesaikan verifikasi Turnstile / Captcha dulu — Built-in XyVerse anti bot");
      return;
    }
    setLoading(true); setErr("");
    try {
      await loginAdmin(k, turnstileToken);
      setAdminKey(k);
      router.push("/");
    } catch (e: any) {
      setErr(e.message || "Gagal masuk");
      // reset turnstile on fail supaya dapat token baru
      setTurnstileVerified(false);
      setTurnstileToken("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F3FF]"
      style={{ backgroundImage: "radial-gradient(900px 500px at 50% -10%, #E9DFFB 0%, #F5F3FF 60%)" }}>
      <div className="w-full max-w-[460px]">
        <div className="bg-white border border-[#E9E3F5] rounded-[24px] p-7 shadow-[0_24px_60px_rgba(16,0,48,0.12)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] grid place-items-center shrink-0 shadow-[0_10px_20px_rgba(124,58,237,0.3)]">
              <img src="/brand/logo-icon.png" alt="XyCloud" className="w-11 h-11 object-contain" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[#1E1B2E] text-[18px] tracking-tight leading-tight">XyCloud Admin</div>
              <div className="text-[11px] text-[#7C738F] font-semibold tracking-wide mt-0.5">ADMIN.XYCLOUD.MY.ID • CONSOLE • NEXT.JS 16</div>
              <div className="text-[10px] font-bold text-[#7C3AED] mt-1 flex items-center gap-1">
                <Sparkles size={10} /> Built-in XyVerse • Powered by XyVerse
              </div>
            </div>
          </div>

          <h1 className="text-[20px] font-semibold text-[#1E1B2E] tracking-tight">Masuk Dashboard</h1>
          <p className="text-[13px] text-[#7C738F] font-medium leading-[1.5] mt-1.5">
            Dashboard admin sekarang full Next.js terbaru (bukan HTML legacy). Key hanya disimpan selama tab browser ini terbuka dan tidak dimasukkan ke URL.
          </p>

          <div className="mt-5 space-y-4">
            <Field label="Admin Key">
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                  placeholder="xya_xxx atau key utama"
                  className="pr-10"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg bg-[#F3F0FF] hover:bg-[#E9E3F5]">
                  {show ? <EyeOff size={16} className="text-[#7C738F]" /> : <Eye size={16} className="text-[#7C738F]" />}
                </button>
              </div>
            </Field>

            {/* Turnstile Captcha — anti bot login */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#7C738F]">
                <ShieldCheck size={12} className="text-[#7C3AED]" /> Verifikasi Keamanan (Turnstile / hCaptcha)
              </div>
              <TurnstileWidget
                onVerify={handleTurnstileVerify}
                onError={() => setErr("Turnstile error — coba refresh atau pakai dev bypass")}
                onExpire={() => { setTurnstileVerified(false); setTurnstileToken(""); }}
              />
              {turnstileVerified && (
                <div className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                  <ShieldCheck size={12} /> Terverifikasi — siap login
                </div>
              )}
            </div>

            <FieldError msg={err} />

            <Btn onClick={handleLogin} disabled={loading || !turnstileVerified} className="w-full !h-[46px] !text-[14px]">
              {loading ? "Memeriksa..." : <><LogIn size={16} /> Masuk</>}
            </Btn>

            <div className="h-px bg-[#E9E3F5] my-1" />

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#7C738F]">Tautan Cepat</div>
              <a href="https://www.xycloud.my.id" className="flex items-center gap-3 p-3 rounded-[16px] border border-[#E9E3F5] bg-[#F5F3FF] hover:border-[#7C3AED] hover:bg-[#F3F0FF] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#E9E3F5] grid place-items-center"><ExternalLink size={16} className="text-[#7C3AED]" /></div>
                <div className="flex-1"><div className="text-[13px] font-semibold text-[#1E1B2E]">www.xycloud.my.id</div><div className="text-[11px] text-[#7C738F]">Situs utama</div></div>
              </a>
              <a href="https://api.xycloud.my.id" className="flex items-center gap-3 p-3 rounded-[16px] border border-[#E9E3F5] bg-[#F5F3FF] hover:border-[#7C3AED] hover:bg-[#F3F0FF] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#E9E3F5] grid place-items-center"><ExternalLink size={16} className="text-[#7C3AED]" /></div>
                <div className="flex-1"><div className="text-[13px] font-semibold text-[#1E1B2E]">api.xycloud.my.id</div><div className="text-[11px] text-[#7C738F]">API Worker — redirect ke dashboard</div></div>
              </a>
            </div>

            {/* Branding harga mati */}
            <div className="rounded-[16px] bg-gradient-to-br from-[#7C3AED]/10 to-[#5B21B6]/10 border border-[#E9E3F5] p-3 mt-2">
              <div className="text-[11px] font-bold text-[#5B21B6] flex items-center gap-1.5"><Sparkles size={12} /> Built-in XyVerse • Powered by XyVerse • Made in XyVerse By Kall</div>
              <div className="text-[10px] text-[#7C738F] mt-1 leading-[1.4]">Dashboard admin Next.js 16 terbaru — migrasi penuh dari HTML legacy. Keamanan Turnstile/hCaptcha aktif.</div>
            </div>

            {/* JUGA DARI XYVERSE ecosystem */}
            <div className="rounded-[16px] bg-white border border-[#E9E3F5] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#7C738F] mb-2">JUGA DARI XYVERSE</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <a href="https://www.xycloud.my.id" className="p-2 rounded-xl bg-[#F5F3FF] hover:bg-[#E9E3F5] font-medium text-[#1E1B2E]">XyCloudStore</a>
                <a href="https://xydesk.my.id" className="p-2 rounded-xl bg-[#F5F3FF] hover:bg-[#E9E3F5] font-medium text-[#1E1B2E]">XyDesk</a>
                <a href="https://xyverse.my.id" className="p-2 rounded-xl bg-[#F5F3FF] hover:bg-[#E9E3F5] font-medium text-[#1E1B2E]">XyVerse</a>
                <a href="https://admin.xycloud.my.id" className="p-2 rounded-xl bg-[#F5F3FF] hover:bg-[#E9E3F5] font-medium text-[#1E1B2E]">Admin Console</a>
              </div>
              <div className="text-[10px] text-[#7C738F] mt-2">Logo pack: filebin.net/xyverse-logo-pack-9f3k2 — Built-in XyVerse ecosystem</div>
            </div>

            <div className="text-center text-[11px] text-[#7C738F] font-medium pt-1">
              Next.js 16.3.5 • React 18 • Tailwind • Lucide • Turnstile • No Emoji • XyVerse 10X
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
