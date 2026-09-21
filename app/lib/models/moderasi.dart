// Model moderasi — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

/// ============================================================
///  Status pembekuan akun (layar Akun Dibekukan)
/// ============================================================
class PelanggaranItem {
  const PelanggaranItem({
    this.jenis = 'blokir',
    this.alasan = '',
    this.sampai,
    this.waktu = '',
  });
  final String jenis;
  final String alasan;
  final String? sampai;
  final String waktu;

  factory PelanggaranItem.fromJson(Map<String, dynamic> j) => PelanggaranItem(
        jenis: (j['jenis'] ?? 'blokir') as String,
        alasan: (j['alasan'] ?? '') as String,
        sampai: j['sampai'] as String?,
        waktu: (j['waktu'] ?? '') as String,
      );
}

class BandingItem {
  const BandingItem({
    this.id = '',
    this.pesan = '',
    this.status = 'baru',
    this.waktu = '',
    this.tanggapan,
  });
  final String id;
  final String pesan;
  final String status; // baru | diterima | ditolak
  final String waktu;
  final String? tanggapan;

  factory BandingItem.fromJson(Map<String, dynamic> j) => BandingItem(
        id: (j['id'] ?? '') as String,
        pesan: (j['pesan'] ?? '') as String,
        status: (j['status'] ?? 'baru') as String,
        waktu: (j['waktu'] ?? '') as String,
        tanggapan: j['tanggapan'] as String?,
      );
}

class InfoBlokir {
  const InfoBlokir({
    this.diblokir = false,
    this.sampai,
    this.alasan,
    this.pelanggaran = const [],
    this.banding = const [],
  });
  final bool diblokir;
  final String? sampai; // null = permanen
  final String? alasan;
  final List<PelanggaranItem> pelanggaran;
  final List<BandingItem> banding;

  bool get sementara => diblokir && sampai != null && sampai!.isNotEmpty;
  BandingItem? get bandingTerbuka =>
      banding.where((b) => b.status == 'baru').isEmpty
          ? null
          : banding.firstWhere((b) => b.status == 'baru');

  factory InfoBlokir.fromJson(Map<String, dynamic> j) => InfoBlokir(
        diblokir: (j['diblokir'] ?? false) == true,
        sampai: j['sampai'] as String?,
        alasan: j['alasan'] as String?,
        pelanggaran: (j['pelanggaran'] as List? ?? const [])
            .map((x) => PelanggaranItem.fromJson(Map<String, dynamic>.from(x)))
            .toList(),
        banding: (j['banding'] as List? ?? const [])
            .map((x) => BandingItem.fromJson(Map<String, dynamic>.from(x)))
            .toList(),
      );
}

/// Ubah penanda waktu server (ISO-8601 atau epoch ms) jadi epoch ms lokal.
int waktuMs(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toInt();
  final d = DateTime.tryParse('$v');
  return d?.millisecondsSinceEpoch ?? 0;
}

class BisukanItem {
  final String thread;
  final int sampai;
  const BisukanItem({required this.thread, required this.sampai});
  factory BisukanItem.fromJson(Map<String, dynamic> j) => BisukanItem(
        thread: j['thread'] as String? ?? '',
        sampai: (j['sampai'] as num?)?.toInt() ?? 0,
      );
}

class IkutanItem {
  final String id;
  final String nama;
  final String? foto;
  const IkutanItem({required this.id, required this.nama, this.foto});
  factory IkutanItem.fromJson(Map<String, dynamic> j) => IkutanItem(
    id: j['id'] as String? ?? j['user_id'] as String? ?? '',
    nama: j['nama'] as String? ?? '',
    foto: j['foto'] as String?,
  );
  Map<String, dynamic> toJson() => {'id': id, 'nama': nama, 'foto': foto};
}
