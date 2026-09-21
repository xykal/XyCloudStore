"use client";
import UlasanList from "@/components/ui/ulasan-list";

export default function UlasanPcPage() {
  return (
    <UlasanList
      endpoint="/api/admin/ulasan-pc"
      title="Ulasan Paket PC"
      sub="Ulasan layanan sewa PC cloud per paket"
      empty="Belum ada ulasan paket PC."
      konfirmHapus="Hapus ulasan paket ini?"
      target={(r) => r.paket || r.plan_id || "—"}
      tampilRata
    />
  );
}
