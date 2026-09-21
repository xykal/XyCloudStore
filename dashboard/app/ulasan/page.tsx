"use client";
import UlasanList from "@/components/ui/ulasan-list";

export default function UlasanPage() {
  return (
    <UlasanList
      endpoint="/api/admin/ulasan"
      title="Ulasan"
      sub="Ulasan produk akun digital — balas & moderasi"
      empty="Belum ada ulasan."
      konfirmHapus="Hapus ulasan ini?"
      target={(r) => r.produk || r.produk_id || "—"}
      tampilSensitif
    />
  );
}
