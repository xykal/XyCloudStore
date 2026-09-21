"use client";
import { Flag } from "lucide-react";
import { Header } from "@/components/ui/kit";
import LaporanList from "@/components/ui/laporan-list";

/** Antrean laporan murni. Pusat moderasi gabungan (laporan + banding + AI) ada di /moderasi. */
export default function LaporanPage() {
  return (
    <div className="space-y-4 font-[var(--font-inter)]">
      <Header
        icon={Flag}
        title="Laporan Pengguna & Konten"
        sub="Semua laporan dari aplikasi: konten forum, ulasan, hingga laporan antar-pengguna"
      />
      <LaporanList />
    </div>
  );
}
