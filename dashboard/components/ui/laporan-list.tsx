"use client";
import { useState } from "react";
import { adminFetch } from "@/lib/api";
import { CheckCheck, Eye, Trash2 } from "lucide-react";
import {
  Btn, Chip, EmptyBox, ErrBox, Load, SearchBox, jam, toneStatus, useAdminList,
} from "@/components/ui/kit";
import { konfirm, toast } from "@/components/ui/dialog";

/** Antrean laporan konten/pengguna — dipakai /laporan dan tab laporan /moderasi. */
export default function LaporanList({ tampilCari = true }: { tampilCari?: boolean }) {
  const { rows, loading, err, setErr, reload } = useAdminList("/api/admin/laporan");
  const [busy, setBusy] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState("semua");

  async function selesai(id: string) {
    setBusy(id); setErr("");
    try {
      await adminFetch(`/api/admin/laporan/${id}`, { method: "PATCH", body: { status: "selesai" } });
      toast("Laporan ditandai selesai.");
      await reload();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function hapusKonten(l: any) {
    const jenis = String(l.jenis || l.tipe || "");
    const ref = l.ref_id || l.target_id;
    const yakin = await konfirm({
      judul: "Hapus konten terlapor?",
      pesan: jenis === "pengguna"
        ? `Laporan ini tentang PENGGUNA (id: ${ref}). Tandai selesai lalu tindak lewat menu Pengguna (peringatan/blokir).`
        : `Konten ${jenis} (id: ${ref}) akan dihapus permanen dan laporan ditandai selesai.`,
      okLabel: "Hapus & selesaikan", bahaya: true,
    });
    if (!yakin) return;
    setBusy(l.id); setErr("");
    try {
      if (jenis.includes("balasan")) await adminFetch(`/api/admin/forum/balasan/${ref}`, { method: "DELETE" });
      else if (jenis.includes("forum") || jenis.includes("post")) await adminFetch(`/api/admin/forum/${ref}`, { method: "DELETE" });
      else if (jenis.includes("ulasan")) await adminFetch(`/api/admin/ulasan/${ref}`, { method: "DELETE" });
      else if (l.konten_path) await adminFetch(`/api/admin/konten/${l.konten_path}`, { method: "DELETE" });
      await adminFetch(`/api/admin/laporan/${l.id}`, { method: "PATCH", body: { status: "selesai" } });
      toast("Konten dihapus & laporan selesai.");
      await reload();
    } catch (e: any) { setErr(e.message || "Gagal menghapus konten."); }
    finally { setBusy(null); }
  }

  async function tandaiSensitif(l: any) {
    const jenis = String(l.jenis || l.tipe || "");
    const ref = l.ref_id || l.target_id;
    if (!ref) { setErr("Laporan ini tidak punya referensi konten."); return; }
    const tabel = jenis.includes("ulasan") ? "ulasan" : "forum";
    setBusy(l.id); setErr("");
    try {
      await adminFetch(`/api/admin/konten/${tabel}/${ref}`, { method: "PATCH", body: { sensitif: true } });
      await adminFetch(`/api/admin/laporan/${l.id}`, { method: "PATCH", body: { status: "selesai" } });
      toast("Konten ditandai sensitif & laporan selesai.");
      await reload();
    } catch (e: any) { setErr(e.message || "Gagal."); }
    finally { setBusy(null); }
  }

  const q = cari.trim().toLowerCase();
  const daftar = rows.filter((l: any) =>
    (status === "semua" || (l.status || "baru") === status) &&
    (!q || `${l.jenis} ${l.alasan || ""} ${l.pelapor || ""} ${l.ref_id || ""}`.toLowerCase().includes(q)));
  const terbuka = rows.filter((r: any) => !["selesai", "ditutup", "closed"].includes(String(r.status || "").toLowerCase())).length;

  const bisaSensitif = (l: any) => {
    const j = String(l.jenis || l.tipe || "");
    return (j.includes("forum") || j.includes("post") || j.includes("ulasan")) && (l.ref_id || l.target_id);
  };
  const bisaHapus = (l: any) => {
    const j = String(l.jenis || l.tipe || "");
    return j.includes("balasan") || j.includes("forum") || j.includes("post") || j.includes("ulasan") || Boolean(l.konten_path);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 font-semibold">{terbuka} terbuka</span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-[#F3F0FF] border border-[#E9E3F5] font-medium">{rows.length} total</span>
        {tampilCari && (
          <div className="flex items-center gap-2 ml-auto">
            <SearchBox value={cari} onChange={setCari} placeholder="Cari alasan / pelapor…" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="xy-select-trigger !w-auto !min-h-9 text-[12.5px]">
              <option value="semua">Semua status</option>
              <option value="baru">Baru</option>
              <option value="selesai">Selesai</option>
            </select>
          </div>
        )}
      </div>
      {err && <ErrBox msg={err} onRetry={reload} />}
      {loading ? <Load /> : daftar.length === 0 ? (
        <EmptyBox msg="Tidak ada laporan pada filter ini." sub="Komunitas aman." />
      ) : (
        <div className="space-y-3">
          {daftar.map((l: any) => (
            <div key={l.id} className="xy-card rounded-[16px] p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#1E1B2E]">{l.judul || l.jenis || l.id}</span>
                    <Chip tone={toneStatus(l.status)}>{l.status || "baru"}</Chip>
                    {l.jenis === "pengguna" && <Chip tone="info">antar-pengguna</Chip>}
                  </div>
                  <div className="text-[11px] text-[#7C738F] mt-0.5">
                    {l.pelapor || l.nama_pelapor || "anon"} · {l.jenis} · {jam(l.dibuat || l.created_at)}
                  </div>
                </div>
                {(l.status || "baru") !== "selesai" && (
                  <div className="flex gap-1.5 flex-wrap">
                    <Btn tone="ok" className="!h-8" disabled={busy === l.id} onClick={() => selesai(l.id)}>
                      <CheckCheck size={12} /> Tutup
                    </Btn>
                    {bisaSensitif(l) && (
                      <Btn tone="ghost" className="!h-8" disabled={busy === l.id} onClick={() => tandaiSensitif(l)} title="Blur konten di aplikasi, tanpa menghapus">
                        <Eye size={12} /> Sensitif
                      </Btn>
                    )}
                    {l.jenis !== "pengguna" && bisaHapus(l) && (
                      <Btn tone="bahaya" className="!h-8" disabled={busy === l.id} onClick={() => hapusKonten(l)}>
                        <Trash2 size={12} /> Hapus konten
                      </Btn>
                    )}
                  </div>
                )}
              </div>
              {l.alasan && <div className="text-[12px] text-[#4B445F] bg-[#F5F3FF] border border-[#E9E3F5] rounded-xl px-3 py-2">{l.alasan}</div>}
              <div className="text-[10.5px] text-[#7C738F] font-mono break-all">ref: {l.ref_id || l.target_id || "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
