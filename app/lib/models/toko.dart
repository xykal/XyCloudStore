// Model toko — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

class AkunProduk {
  final String id;
  final String nama;
  final String kategori;
  final String deskripsi;
  final int harga;
  final int hargaCoret;
  final int stok; // realtime
  final double rating;
  final int terjual;
  final String gambar;
  final List<String> fitur;
  final String garansi;
  final int jumlahUlasan;
  final Map<String, dynamic> detail;

  AkunProduk({
    required this.id,
    required this.nama,
    required this.kategori,
    required this.deskripsi,
    required this.harga,
    required this.hargaCoret,
    required this.stok,
    required this.rating,
    required this.terjual,
    required this.gambar,
    required this.fitur,
    required this.garansi,
    this.jumlahUlasan = 0,
    this.detail = const {},
  });

  factory AkunProduk.fromJson(Map<String, dynamic> j) => AkunProduk(
        id: '${j['id']}',
        nama: j['nama'],
        kategori: j['kategori'] ?? 'Lainnya',
        deskripsi: j['deskripsi'] ?? '',
        harga: j['harga'] ?? 0,
        hargaCoret: j['harga_coret'] ?? j['hargaCoret'] ?? 0,
        stok: j['stok'] ?? 0,
        rating: (j['rating'] ?? 5).toDouble(),
        terjual: j['terjual'] ?? 0,
        gambar: j['gambar'] ?? '',
        fitur: (j['fitur'] as List?)?.map((e) => '$e').toList() ?? const [],
        garansi: j['garansi'] ?? '7 hari',
        jumlahUlasan: j['jumlah_ulasan'] ?? 0,
        detail: _petaAman(j['detail']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'nama': nama,
        'kategori': kategori,
        'deskripsi': deskripsi,
        'harga': harga,
        'harga_coret': hargaCoret,
        'stok': stok,
        'rating': rating,
        'terjual': terjual,
        'gambar': gambar,
        'fitur': fitur,
        'garansi': garansi,
        'jumlah_ulasan': jumlahUlasan,
        'detail': detail,
      };
}

class Transaksi {
  final String id;
  final String judul;
  final String tipe; // topup | sewa | akun | refund
  final int nominal; // + / -
  final DateTime waktu;
  final String status;

  Transaksi({
    required this.id,
    required this.judul,
    required this.tipe,
    required this.nominal,
    required this.waktu,
    required this.status,
  });

  factory Transaksi.fromJson(Map<String, dynamic> j) => Transaksi(
        id: '${j['id']}',
        judul: j['judul'] ?? '',
        tipe: j['tipe'] ?? 'sewa',
        nominal: j['nominal'] ?? 0,
        waktu: DateTime.parse(j['waktu']),
        status: j['status'] ?? 'sukses',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'judul': judul,
        'tipe': tipe,
        'nominal': nominal,
        'waktu': waktu.toIso8601String(),
        'status': status,
      };
}

/// Banner promo yang tampil sebagai slider di beranda.
/// Dikelola sepenuhnya lewat dashboard admin (tabel `banners` di D1).
class PromoBanner {
  final String id;
  final String judul;
  final String subjudul;
  final String label;
  final String cta;
  final String aksi; // sewa | akun | topup | url
  final String target;
  final String warna1;
  final String warna2;
  final String ikon;
  final int urutan;
  final String gambar; // opsional: URL/DataURI latar, bila kosong pakai gradasi warna

  PromoBanner({
    required this.id,
    required this.judul,
    this.subjudul = '',
    this.label = '',
    this.cta = 'Lihat',
    this.aksi = 'sewa',
    this.target = '',
    this.warna1 = '#2F5BFF',
    this.warna2 = '#6A4BFF',
    this.ikon = 'bolt',
    this.urutan = 1,
    this.gambar = '',
  });

  factory PromoBanner.fromJson(Map<String, dynamic> j) => PromoBanner(
        id: '${j['id']}',
        judul: j['judul'] ?? '',
        subjudul: j['subjudul'] ?? '',
        label: j['label'] ?? '',
        cta: j['cta'] ?? 'Lihat',
        aksi: j['aksi'] ?? 'sewa',
        target: j['target'] ?? '',
        warna1: j['warna1'] ?? '#2F5BFF',
        warna2: j['warna2'] ?? '#6A4BFF',
        ikon: j['ikon'] ?? 'bolt',
        urutan: (j['urutan'] ?? 1) is int ? (j['urutan'] ?? 1) as int : 1,
        gambar: '${j['gambar'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'judul': judul,
        'subjudul': subjudul,
        'label': label,
        'cta': cta,
        'aksi': aksi,
        'target': target,
        'warna1': warna1,
        'warna2': warna2,
        'ikon': ikon,
        'urutan': urutan,
        'gambar': gambar,
      };
}

/// Ulasan pembeli untuk sebuah produk akun.
class Ulasan {
  final String id;
  final String produkId;
  final String nama;
  final int rating;
  final String komentar;
  final String? gambar;
  final String? balasan;
  final DateTime waktu;

  Ulasan({
    required this.id,
    required this.produkId,
    required this.nama,
    required this.rating,
    required this.komentar,
    required this.waktu,
    this.gambar,
    this.balasan,
  });

  factory Ulasan.fromJson(Map<String, dynamic> j) => Ulasan(
        id: '${j['id']}',
        produkId: '${j['produk_id'] ?? ''}',
        nama: j['nama'] ?? 'Pengguna',
        rating: (j['rating'] ?? 5) is int ? (j['rating'] ?? 5) : int.tryParse('${j['rating']}') ?? 5,
        komentar: j['komentar'] ?? '',
        gambar: (j['gambar'] as String?)?.isNotEmpty == true ? j['gambar'] : null,
        balasan: (j['balasan'] as String?)?.isNotEmpty == true ? j['balasan'] : null,
        waktu: DateTime.tryParse('${j['waktu']}') ?? DateTime.now(),
      );
}

/// Permintaan isi saldo yang menunggu konfirmasi admin.
class PermintaanTopup {
  final String id;
  final int nominal;
  final int kodeUnik;
  final int total;
  final String metode;
  final String status; // menunggu | diperiksa | disetujui | ditolak
  final String provider;
  final String? bukti;
  final String? catatan;
  final DateTime dibuat;
  final Map<String, dynamic> rekening;

  /// Kalau penyedia pembayaran aktif, di sini ada tautan atau QR-nya.
  final bool otomatis;
  final Map<String, dynamic> bayar;

  PermintaanTopup({
    required this.id,
    required this.nominal,
    required this.kodeUnik,
    required this.total,
    required this.metode,
    required this.status,
    required this.dibuat,
    this.provider = 'manual',
    this.bukti,
    this.catatan,
    this.rekening = const {},
    this.otomatis = false,
    this.bayar = const {},
  });

  factory PermintaanTopup.fromJson(Map<String, dynamic> j) => PermintaanTopup(
        id: '${j['id']}',
        nominal: j['nominal'] ?? 0,
        kodeUnik: j['kode_unik'] ?? 0,
        total: j['total'] ?? (j['nominal'] ?? 0),
        metode: j['metode'] ?? 'transfer',
        status: j['status'] ?? 'menunggu',
        provider: '${j['provider'] ?? (j['otomatis'] == true ? 'gateway' : 'manual')}',
        bukti: (j['bukti'] as String?)?.isNotEmpty == true ? j['bukti'] : null,
        catatan: (j['catatan'] as String?)?.isNotEmpty == true ? j['catatan'] : null,
        dibuat: tanggalServer(j['dibuat']),
        rekening: _petaAman(j['rekening']),
        otomatis: j['otomatis'] == true,
        bayar: _petaAman(j['bayar']),
      );

  bool get selesai => status == 'disetujui' || status == 'ditolak';
}
