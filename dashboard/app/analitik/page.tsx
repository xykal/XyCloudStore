"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { BarChart3, Eye, FileText, Globe2, Smartphone } from "lucide-react";
import { Bar, EmptyBox, ErrBox, Header, Load } from "@/components/ui/kit";

export default function AnalitikPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminFetch("/api/admin/analitik")
      .then(setD)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const k = (v: any) => Number(v ?? 0);
  const total = k(d?.total);
  const maxHalaman = Math.max(1, ...(d?.halaman || []).map((h: any) => k(h.n)));

  return (
    <div className="space-y-4 font-[var(--font-inter)]">
      <Header
        icon={Eye}
        title="Analitik Web"
        sub="Kunjungan web & aplikasi 30 hari dari /api/admin/analitik"
      />

      {loading ? <Load /> : err ? <ErrBox msg={err} /> : (
        <>
          <div className="xy-card rounded-[14px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F3F0FF] border border-[#E9E3F5] grid place-items-center"><BarChart3 size={16} className="text-[#7C3AED]" /></div>
            <div>
              <div className="text-[11px] text-[#7C738F] font-medium tracking-wide uppercase">Total Kunjungan (30 hari)</div>
              <div className="text-lg font-semibold text-[#1E1B2E] mt-0.5 tracking-tight">{total.toLocaleString("id-ID")}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="xy-card rounded-[16px] p-5">
              <h3 className="font-semibold text-[#1E1B2E] tracking-tight flex items-center gap-2"><BarChart3 size={15} className="text-[#7C3AED]" /> Tren Kunjungan</h3>
              <div className="mt-4 space-y-1.5 max-h-[280px] overflow-auto pr-1">
                {(d?.harian || []).slice(-14).map((r: any) => (
                  <Bar key={r.d} label={String(r.d).slice(5)} nilai={k(r.n)} total={total || 1} />
                ))}
                {(d?.harian || []).length === 0 && <EmptyBox msg="Belum ada kunjungan tercatat." />}
              </div>
            </div>

            <div className="xy-card rounded-[16px] p-5">
              <h3 className="font-semibold text-[#1E1B2E] tracking-tight flex items-center gap-2"><FileText size={15} className="text-[#7C3AED]" /> Halaman Terpopuler</h3>
              <div className="mt-4 space-y-1.5">
                {(d?.halaman || []).slice(0, 8).map((h: any) => (
                  <Bar key={h.halaman} label={String(h.halaman || "/").slice(0, 26)} nilai={k(h.n)} total={maxHalaman} />
                ))}
                {(d?.halaman || []).length === 0 && <EmptyBox msg="Belum ada data halaman." />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="xy-card rounded-[16px] p-5">
              <h3 className="font-semibold text-[#1E1B2E] tracking-tight flex items-center gap-2"><Smartphone size={15} className="text-[#7C3AED]" /> Perangkat</h3>
              <div className="mt-4 space-y-1.5">
                {(d?.perangkat || []).map((r: any) => (
                  <Bar key={r.perangkat} label={String(r.perangkat || "-").slice(0, 24)} nilai={k(r.n)} total={total || 1} />
                ))}
                {(d?.perangkat || []).length === 0 && <EmptyBox msg="Belum ada data perangkat." />}
              </div>
            </div>
            <div className="xy-card rounded-[16px] p-5">
              <h3 className="font-semibold text-[#1E1B2E] tracking-tight flex items-center gap-2"><Globe2 size={15} className="text-[#7C3AED]" /> Negara Asal</h3>
              <div className="mt-4 space-y-1.5">
                {(d?.negara || []).map((r: any) => (
                  <Bar key={r.negara} label={String(r.negara || "-").toUpperCase()} nilai={k(r.n)} total={total || 1} />
                ))}
                {(d?.negara || []).length === 0 && <EmptyBox msg="Belum ada data negara." />}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
