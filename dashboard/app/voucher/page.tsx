"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Copy, Pencil, Plus, Ticket, Trash2, X } from "lucide-react";
import {
  Btn, Chip, EmptyBox, ErrBox, Field, Header, Input, Load, MsgOk, rupiah, Select, Toggle,
} from "@/components/ui/kit";
import { konfirm, toast } from "@/components/ui/dialog";

type Form = {
  kode: string; untuk: string; jenis: string; nilai: number;
  min_belanja: number; maks_potongan: number; kuota: number;
  berlaku_sampai: string; keterangan: string; aktif: boolean;
};

const AWAL: Form = {
  kode: "", untuk: "semua", jenis: "persen", nilai: 10,
  min_belanja: 0, maks_potongan: 0, kuota: 0,
  berlaku_sampai: "", keterangan: "", aktif: true,
};

function statusVoucher(v: any): { label: string; tone: "ok" | "warn" | "bad" | "netral" }[] {
  const out: { label: string; tone: "ok" | "warn" | "bad" | "netral" }[] = [];
  if (Number(v.aktif) === 0) out.push({ label: "nonaktif", tone: "bad" });
  if (Number(v.kuota) > 0 && Number(v.terpakai) >= Number(v.kuota)) out.push({ label: "kuota habis", tone: "warn" });
  if (v.berlaku_sampai && new Date(v.berlaku_sampai) < new Date()) out.push({ label: "kedaluwarsa", tone: "bad" });
  if (!out.length) out.push({ label: "aktif", tone: "ok" });
  return out;
}

export default function VoucherPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>(AWAL);
  const [ubahKode, setUbahKode] = useState<string | null>(null);

  async function muat() {
    setLoading(true); setErr("");
    try {
      const d = await adminFetch("/api/admin/voucher");
      setRows(Array.isArray(d) ? d : []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void muat(); }, []);

  function mulaiUbah(v: any) {
    setUbahKode(v.kode);
    setForm({
      kode: v.kode || "",
      untuk: v.untuk || "semua",
      jenis: v.jenis === "nominal" ? "nominal" : "persen",
      nilai: Number(v.nilai) || 0,
      min_belanja: Number(v.min_belanja) || 0,
      maks_potongan: Number(v.maks_potongan) || 0,
      kuota: Number(v.kuota) || 0,
      berlaku_sampai: v.berlaku_sampai ? String(v.berlaku_sampai).slice(0, 10) : "",
      keterangan: v.keterangan || "",
      aktif: Number(v.aktif) !== 0,
    });
    setOk(""); setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function batalUbah() {
    setUbahKode(null);
    setForm(AWAL);
  }

  async function simpan() {
    const kode = form.kode.trim().toUpperCase();
    if (kode.length < 3) { setErr("Kode voucher minimal 3 huruf."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      await adminFetch("/api/admin/voucher", {
        method: "POST",
        body: {
          kode,
          untuk: form.untuk,
          jenis: form.jenis,
          nilai: Number(form.nilai) || 0,
          min_belanja: Number(form.min_belanja) || 0,
          maks_potongan: Number(form.maks_potongan) || 0,
          kuota: Number(form.kuota) || 0,
          berlaku_sampai: form.berlaku_sampai || null,
          keterangan: form.keterangan.trim(),
          aktif: form.aktif,
        },
      });
      setOk(ubahKode ? `Voucher ${kode} diperbarui.` : `Voucher ${kode} dibuat.`);
      batalUbah();
      await muat();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function hapus(kode: string) {
    if (!await konfirm({ pesan: `Hapus voucher ${kode}? Kode ini tidak bisa dipakai lagi.`, bahaya: true })) return;
    setBusy(true); setErr(""); setOk("");
    try {
      await adminFetch(`/api/admin/voucher/${encodeURIComponent(kode)}`, { method: "DELETE" });
      setOk(`Voucher ${kode} dihapus.`);
      if (ubahKode === kode) batalUbah();
      await muat();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function salin(kode: string) {
    navigator.clipboard?.writeText(kode)
      .then(() => toast("Kode disalin", "ok"))
      .catch(() => toast(kode, "info"));
  }

  const atur = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 font-[var(--font-inter)]">
      <Header
        icon={Ticket}
        title="Voucher"
        sub="Kode potongan sewa PC, akun digital, atau isi saldo"
        right={<span className="text-xs px-3 py-1.5 rounded-full bg-[#F3F0FF] border border-[#E9E3F5] font-medium">{rows.length} voucher</span>}
      />
      {err && <ErrBox msg={err} />}
      {ok && <MsgOk msg={ok} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="xy-card rounded-[16px] p-5 h-fit lg:sticky lg:top-4">
          <h3 className="font-semibold text-[#1E1B2E] tracking-tight flex items-center gap-2">
            {ubahKode ? <Pencil size={16} /> : <Plus size={16} />}
            {ubahKode ? `Ubah ${ubahKode}` : "Buat Voucher"}
          </h3>
          <div className="mt-4 space-y-3">
            <Field label="Kode voucher">
              <Input value={form.kode} disabled={!!ubahKode} onChange={(e) => atur("kode", e.target.value.toUpperCase())} placeholder="HEMAT20" className="font-mono" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Berlaku untuk">
                <Select value={form.untuk} onChange={(v) => atur("untuk", v)} options={[
                  { value: "semua", label: "semua" },
                  { value: "sewa", label: "sewa" },
                  { value: "akun", label: "akun" },
                  { value: "topup", label: "topup" },
                ]} />
              </Field>
              <Field label="Jenis potongan">
                <Select value={form.jenis} onChange={(v) => atur("jenis", v)} options={[
                  { value: "persen", label: "Persen" },
                  { value: "nominal", label: "Nominal Rp" },
                ]} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={form.jenis === "nominal" ? "Nilai (Rp)" : "Nilai (%)"}>
                <Input type="number" min={0} value={form.nilai} onChange={(e) => atur("nilai", Number(e.target.value))} />
              </Field>
              <Field label="Min. belanja (Rp)">
                <Input type="number" min={0} value={form.min_belanja} onChange={(e) => atur("min_belanja", Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Maks. potongan (0 = bebas)">
                <Input type="number" min={0} value={form.maks_potongan} onChange={(e) => atur("maks_potongan", Number(e.target.value))} />
              </Field>
              <Field label="Kuota (0 = tanpa batas)">
                <Input type="number" min={0} value={form.kuota} onChange={(e) => atur("kuota", Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Berlaku sampai (kosong = tanpa batas)">
              <Input type="date" value={form.berlaku_sampai} onChange={(e) => atur("berlaku_sampai", e.target.value)} />
            </Field>
            <Field label="Keterangan">
              <Input value={form.keterangan} onChange={(e) => atur("keterangan", e.target.value)} placeholder="Promo pembukaan" />
            </Field>
            <Toggle label="Aktif" checked={form.aktif} onChange={(v) => atur("aktif", v)} />
            <div className="flex gap-2">
              <Btn className="flex-1" disabled={busy} onClick={simpan}>
                {ubahKode ? "Simpan perubahan" : "Buat voucher"}
              </Btn>
              {ubahKode && (
                <Btn tone="ghost" disabled={busy} onClick={batalUbah}>
                  <X size={14} /> Batal
                </Btn>
              )}
            </div>
            <div className="text-[11px] text-[#7C738F] font-medium">Claim atomik — rollback jika transaksi gagal. Ubah = timpa (riwayat pakai tetap).</div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {loading ? <Load /> : rows.length === 0 ? (
            <EmptyBox msg="Belum ada voucher." sub="Buat kode pertama dari formulir di samping." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map((v: any) => (
                <div key={v.kode} className="xy-card rounded-[14px] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-semibold text-[#1E1B2E] text-[15px] tracking-widest">{v.kode}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F3F0FF] border border-[#E9E3F5] text-[#1E1B2E] font-semibold">{v.untuk || "semua"}</span>
                  </div>
                  <div className="mt-1 text-[22px] font-bold text-[#1E1B2E] tracking-tight">
                    {v.jenis === "nominal" ? rupiah(v.nilai) : `${v.nilai}%`}
                    <span className="text-[11px] text-[#7C738F] font-medium"> potongan</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {statusVoucher(v).map((s) => <Chip key={s.label} tone={s.tone}>{s.label}</Chip>)}
                  </div>
                  {v.keterangan && <div className="mt-1.5 text-[12px] text-[#7C738F]">{v.keterangan}</div>}
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-[#7C738F] font-medium">
                    <div>Min. {rupiah(v.min_belanja)}</div>
                    <div>Maks. {Number(v.maks_potongan) > 0 ? rupiah(v.maks_potongan) : "bebas"}</div>
                    <div>Terpakai {v.terpakai || 0}{Number(v.kuota) > 0 ? ` / ${v.kuota}` : ""}</div>
                    <div>Sampai {v.berlaku_sampai ? String(v.berlaku_sampai).slice(0, 10) : "tanpa batas"}</div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <Btn tone="ghost" className="!h-8" disabled={busy} onClick={() => mulaiUbah(v)}>
                      <Pencil size={12} /> Ubah
                    </Btn>
                    <Btn tone="ghost" className="!h-8" onClick={() => salin(v.kode)}>
                      <Copy size={12} /> Salin
                    </Btn>
                    <span className="flex-1" />
                    <Btn tone="bahaya" className="!h-8" disabled={busy} onClick={() => hapus(v.kode)}>
                      <Trash2 size={12} /> Hapus
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
