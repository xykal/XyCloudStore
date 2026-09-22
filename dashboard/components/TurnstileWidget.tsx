"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// Cloudflare Turnstile widget — Built-in XyVerse
// sitekey via env NEXT_PUBLIC_TURNSTILE_SITE_KEY, fallback dev
const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAE6jQZaig7vJKhQs"; // dari kuncikerjasama.txt XYDESK ADMIN, reuse buat XyCloud admin

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: any) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
      getResponse: (id?: string) => string;
    };
    onTurnstileCallback?: (token: string) => void;
  }
}

type Props = {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
};

export default function TurnstileWidget({ onVerify, onError, onExpire, theme = "light", size = "normal" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadScript = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.turnstile) {
      setLoaded(true);
      return;
    }
    const existing = document.querySelector('script[src*="turnstile"]');
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => setLoaded(true);
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    loadScript();
  }, [loadScript]);

  useEffect(() => {
    if (!loaded || !ref.current || !window.turnstile) return;
    if (widgetId.current) {
      try { window.turnstile.remove(widgetId.current); } catch {}
      widgetId.current = null;
    }
    try {
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITEKEY,
        theme,
        size,
        callback: (token: string) => onVerify(token),
        "error-callback": () => {
          setFailed(true);
          onError?.();
        },
        "expired-callback": () => {
          onExpire?.();
        },
      });
    } catch (e) {
      console.warn("[turnstile] render gagal", e);
      setFailed(true);
    }
    return () => {
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
      }
    };
  }, [loaded, theme, size, onVerify, onError, onExpire]);

  if (failed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
        Turnstile gagal dimuat — mode dev bypass aktif. Pastikan NEXT_PUBLIC_TURNSTILE_SITE_KEY di-set untuk produksi.
        <div className="mt-2">
          <button
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              loadScript();
              // dev bypass: kirim token dummy
              onVerify("dev-bypass-token");
            }}
            className="text-[11px] font-semibold underline"
          >
            Lanjut tanpa captcha (dev)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-2">
      <div ref={ref} className="min-h-[65px] min-w-[300px] grid place-items-center bg-[#F8F6FF] rounded-xl border border-[#E9E3F5]">
        {!loaded && <span className="text-[11px] text-[#7C738F] animate-pulse">Memuat Turnstile...</span>}
      </div>
    </div>
  );
}

// hCaptcha alternative component (optional, bisa dipakai jika Turnstile down)
export function HCaptchaWidget({ onVerify, sitekey }: { onVerify: (t: string) => void; sitekey?: string }) {
  const key = sitekey || process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || "";
  if (!key) return null;
  return (
    <div className="flex justify-center py-2">
      <div className="text-[11px] text-[#7C738F]">hCaptcha: sitekey {key.slice(0, 8)}... (implementasi full butuh script hcaptcha.com/1/api.js)</div>
    </div>
  );
}
