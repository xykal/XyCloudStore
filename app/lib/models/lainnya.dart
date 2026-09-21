// Model lainnya — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

/// Konfigurasi dari server: penyedia login aktif, nomor WhatsApp, rekening.
class KonfigurasiApp {
  final bool bayarOtomatis;
  final List<Map<String, dynamic>> metodeBayar;
  final bool googleAktif;
  final bool facebookAktif;
  final String whatsapp;
  final Map<String, dynamic> rekening;
  final int minTopup;

  /// Negara pengunjung (kode ISO-2 + nama Indonesia) — dideteksi server dari
  /// jaringan (Cloudflare) untuk baris persetujuan di layar login.
  final String negaraKode;
  final String negaraNama;

  /// Batch J: angka realtime untuk layar welcome & status unit.
  final int statistikPengguna;
  final int statistikUnitOnline;

  /// Batch M: server sedang mode pemeliharaan (dari /config, sehingga juga
  /// terbaca untuk perangkat yang belum login — selama pemeliharaan auth/*
  /// tetap terbuka dan 503 tidak pernah sampai ke klien tanpa token).
  final bool pemeliharaanAktif;
  final String pemeliharaanPesan;

  const KonfigurasiApp({
    this.bayarOtomatis = false,
    this.metodeBayar = const [],
    this.googleAktif = false,
    this.facebookAktif = false,
    this.whatsapp = '',
    this.rekening = const {},
    this.minTopup = 10000,
    this.negaraKode = '',
    this.negaraNama = '',
    this.statistikPengguna = 0,
    this.statistikUnitOnline = 0,
    this.pemeliharaanAktif = false,
    this.pemeliharaanPesan = '',
  });

  factory KonfigurasiApp.fromJson(Map<String, dynamic> j) {
    final p = _petaAman(j['providers']);
    final bayar = _petaAman(j['pembayaran']);
    final negara = _petaAman(j['negara']);
    return KonfigurasiApp(
      bayarOtomatis: bayar['otomatis'] == true,
      metodeBayar: ((bayar['metode'] as List?) ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
      googleAktif: p['google'] == true,
      facebookAktif: p['facebook'] == true,
      whatsapp: '${j['whatsapp'] ?? ''}',
      rekening: _petaAman(j['rekening']),
      negaraKode: '${negara['kode'] ?? ''}',
      negaraNama: '${negara['nama'] ?? ''}',
      statistikPengguna: (_petaAman(j['statistik'])['pengguna'] as num?)?.toInt() ?? 0,
      statistikUnitOnline: (_petaAman(j['statistik'])['unitOnline'] as num?)?.toInt() ?? 0,
      minTopup: j['minTopup'] ?? 10000,
      pemeliharaanAktif: _petaAman(j['pemeliharaan'])['aktif'] == true,
      pemeliharaanPesan: '${_petaAman(j['pemeliharaan'])['pesan'] ?? ''}',
    );
  }
}

/// Item Story di Feed (berlaku 24 jam) untuk teman/pengikut
/// Batch Q: editor lengkap — gaya teks, warna, align, background, label, filter, trim
class StoryItem {
  final String id;
  final String userId;
  final String nama;
  final String? foto;
  final String? bingkai;
  final String? mediaUrl;
  final String tipe; // 'teks', 'gambar', 'video'
  final String teks;
  final String bgGradient; // 'ungu', 'emas', 'neon', 'senja', 'cyber', 'solid', 'image'
  final String privasi; // 'teman', 'publik'
  final int likes;
  final int reposts;
  final bool sudahLike;
  final DateTime dibuat;
  final DateTime berakhir;
  final bool punyaSaya;

  // Batch Q editor fields
  final String gayaTeks; // normal, bold, italic, bold_italic, neon, pelangi, ketik, ombak, retro, minimal
  final String warnaTeks; // hex
  final int ukuranTeks; // 14-48
  final String alignTeks; // left, center, right
  final String bgType; // gradient, solid, image, video
  final String bgWarna; // hex solid
  final String? bgImageUrl;
  final bool teksBg;
  final String teksBgWarna;
  final String label; // JSON array label: location, mention, hashtag
  final double trimStart;
  final double trimEnd;
  final String filter; // normal, bw, sepia, vintage, vivid, blur, warm, cool
  final double durasiVideo;

  StoryItem({
    required this.id,
    required this.userId,
    required this.nama,
    this.foto,
    this.bingkai,
    this.mediaUrl,
    required this.tipe,
    required this.teks,
    this.bgGradient = 'ungu',
    this.privasi = 'teman',
    this.likes = 0,
    this.reposts = 0,
    this.sudahLike = false,
    required this.dibuat,
    required this.berakhir,
    this.punyaSaya = false,
    this.gayaTeks = 'normal',
    this.warnaTeks = '#FFFFFF',
    this.ukuranTeks = 21,
    this.alignTeks = 'center',
    this.bgType = 'gradient',
    this.bgWarna = '',
    this.bgImageUrl,
    this.teksBg = true,
    this.teksBgWarna = '#00000073',
    this.label = '',
    this.trimStart = 0,
    this.trimEnd = 0,
    this.filter = 'normal',
    this.durasiVideo = 0,
  });

  StoryItem copyWith({
    int? likes,
    int? reposts,
    bool? sudahLike,
  }) =>
      StoryItem(
        id: id,
        userId: userId,
        nama: nama,
        foto: foto,
        bingkai: bingkai,
        mediaUrl: mediaUrl,
        tipe: tipe,
        teks: teks,
        bgGradient: bgGradient,
        privasi: privasi,
        likes: likes ?? this.likes,
        reposts: reposts ?? this.reposts,
        sudahLike: sudahLike ?? this.sudahLike,
        dibuat: dibuat,
        berakhir: berakhir,
        punyaSaya: punyaSaya,
        gayaTeks: gayaTeks,
        warnaTeks: warnaTeks,
        ukuranTeks: ukuranTeks,
        alignTeks: alignTeks,
        bgType: bgType,
        bgWarna: bgWarna,
        bgImageUrl: bgImageUrl,
        teksBg: teksBg,
        teksBgWarna: teksBgWarna,
        label: label,
        trimStart: trimStart,
        trimEnd: trimEnd,
        filter: filter,
        durasiVideo: durasiVideo,
      );

  factory StoryItem.fromJson(Map<String, dynamic> j) => StoryItem(
        id: '${j['id'] ?? ''}',
        userId: '${j['user_id'] ?? ''}',
        nama: '${j['nama'] ?? 'Pengguna'}',
        foto: j['foto'] as String?,
        bingkai: j['bingkai'] as String?,
        mediaUrl: j['media_url'] as String?,
        tipe: '${j['tipe'] ?? 'teks'}',
        teks: '${j['teks'] ?? ''}',
        bgGradient: '${j['bg_gradient'] ?? 'ungu'}',
        privasi: '${j['privasi'] ?? 'teman'}',
        likes: (j['likes'] as num?)?.toInt() ?? 0,
        reposts: (j['reposts'] as num?)?.toInt() ?? 0,
        sudahLike: j['sudah_like'] == true || j['sudah_like'] == 1,
        dibuat: DateTime.tryParse('${j['dibuat'] ?? ''}') ?? DateTime.now(),
        berakhir: DateTime.tryParse('${j['berakhir'] ?? ''}') ??
            DateTime.now().add(const Duration(hours: 24)),
        punyaSaya: j['punya_saya'] == true,
        gayaTeks: '${j['gaya_teks'] ?? 'normal'}',
        warnaTeks: '${j['warna_teks'] ?? '#FFFFFF'}',
        ukuranTeks: (j['ukuran_teks'] as num?)?.toInt() ?? 21,
        alignTeks: '${j['align_teks'] ?? 'center'}',
        bgType: '${j['bg_type'] ?? 'gradient'}',
        bgWarna: '${j['bg_warna'] ?? ''}',
        bgImageUrl: j['bg_image_url'] as String?,
        teksBg: (j['teks_bg'] as num?)?.toInt() != 0 && j['teks_bg'] != false,
        teksBgWarna: '${j['teks_bg_warna'] ?? '#00000073'}',
        label: '${j['label'] ?? ''}',
        trimStart: (j['trim_start'] as num?)?.toDouble() ?? 0,
        trimEnd: (j['trim_end'] as num?)?.toDouble() ?? 0,
        filter: '${j['filter'] ?? 'normal'}',
        durasiVideo: (j['durasi_video'] as num?)?.toDouble() ?? 0,
      );
}
