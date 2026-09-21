// Model pengguna — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

import 'dart:convert';

/// Media banner profil kustom (Batch I + O):
/// - Batch I: GIF langsung, atau MP4 → GIF (f_gif)
/// - Batch O (Discord-style): Video → Animated WebP (fl_animated,fl_awebp)
///   + GIF fallback. Discord sendiri pakai teknik sama:
///   * Avatar/banner animasi: `a_` hash → .webp (bukan .gif)
///   * Avatar decoration/profile effect: APNG / Animated WebP / Lottie
///     (butuh alpha 8-bit, GIF cuma 1-bit → glow bergerigi)
///   * Stiker animasi: wajib APNG/Lottie, GIF ditolak (512KB limit)
///   * Chat GIF: sebenarnya MP4 muted looping (hemat 90% bandwidth)
///
/// Cloudinary: `f_webp,fl_awebp,fl_animated,w_480,fps_20,du_5,q_auto:good,e_loop`
/// menghasilkan Animated WebP 24-bit + 8-bit alpha, 64% lebih kecil dari GIF,
/// seamless loop tanpa delay.
class BannerMedia {
  final String tipe; // 'gif' | 'video' | 'webp'
  final String url; // berkas asli / primary display (webp preferred)
  final String gif; // fallback GIF
  final String webp; // primary Animated WebP (Discord Nitro style)

  const BannerMedia({
    required this.tipe,
    required this.url,
    required this.gif,
    String? webp,
  }) : webp = webp ?? gif;

  /// URL terbaik untuk ditampilkan: WebP animasi dulu (tajam, alpha halus),
  /// baru GIF fallback, baru url legacy.
  String get displayUrl => webp.isNotEmpty ? webp : (gif.isNotEmpty ? gif : url);
  String get displayGifFallback => gif.isNotEmpty ? gif : url;
  bool get isAnimatedWebP => webp.toLowerCase().endsWith('.webp') || webp.contains('.webp') || tipe == 'webp';
  bool get isVideoOrigin => tipe == 'video';

  /// Server menyimpan kolom `banner_media` sebagai TEKS JSON; kadang sudah
  /// terurai jadi Map oleh klien JSON — terima keduanya.
  static BannerMedia? parse(dynamic v) {
    if (v == null) return null;
    try {
      Map<String, dynamic>? m;
      if (v is String) {
        if (v.trim().isEmpty) return null;
        m = Map<String, dynamic>.from(jsonDecode(v) as Map);
      } else if (v is Map) {
        m = Map<String, dynamic>.from(v);
      }
      if (m == null) return null;
      final url = (m['url'] ?? m['webp'] ?? m['gif'] ?? '').toString();
      if (url.isEmpty) return null;
      final gif = (m['gif'] ?? m['url']).toString();
      final webp = (m['webp'] ?? m['url'] ?? gif).toString();
      return BannerMedia(
        tipe: (m['tipe'] ?? (webp.endsWith('.webp') ? 'webp' : 'gif')).toString(),
        url: url,
        gif: gif,
        webp: webp,
      );
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> toJson() => {
        'tipe': tipe,
        'url': url,
        'gif': gif,
        'webp': webp,
      };
}

class UserProfile {
  final String id;
  final String nama;
  final String email;
  final String? phone;
  final int saldo;
  final String tier; // basic | pro | vip
  final String? avatar;

  /// Foto profil dari server (Cloudinary atau Google).
  final String? foto;

  /// Bio singkat dan tema banner profil (Batch D: profil bisa dikustom).
  final String? bio;
  final String? banner;

  /// Banner media kustom GIF/MP4→GIF (Batch I, khusus langganan).
  final BannerMedia? bannerMedia;

  /// Bingkai avatar profil (Batch I): polos/ungu/emas/neon/aurora/permata.
  final String? bingkai;

  /// Username publik unik (Batch E): @nama_pengguna.
  final String? username;

  /// Cap waktu pendinginan (Batch I): nama 7 hari, username 30 hari.
  final String? namaDiubahPada;
  final String? usernameDiubahPada;

  /// Total belanja lunas — dasar progres tier & leaderboard (Batch I).
  final int totalBelanja;

  /// PIN transfer 6 digit sudah dipasang (hash tidak pernah dikirim).
  final bool pinTransferAktif;

  /// Terima pemberitahuan kegiatan forum komunitas.
  final bool notifForum;

  /// Terima pemberitahuan pesan langsung (DM).
  final bool notifDm;

  /// Terima pemberitahuan saat kreator yang diikuti mulai livestream.
  final bool notifLive;

  /// Batch L: slogan pendek di bawah nama (maks 60 huruf).
  final String? slogan;

  /// Batch L: satu tautan publik di profil (divalidasi server).
  final String? bioLink;

  /// Batch L: gaya tampilan nama (font/efek). Lihat gaya_nama.dart.
  final String? gayaNama;

  /// Lencana khusus dari admin, contohnya XyVerse.
  final String? badge;
  final bool diblokir;
  final String? alasanBlokir;
  final int peringatan;
  final String? kodeReferral;
  final String? diundangOleh;

  UserProfile({
    required this.id,
    required this.nama,
    required this.email,
    this.phone,
    this.saldo = 0,
    this.tier = 'basic',
    this.avatar,
    this.foto,
    this.bio,
    this.banner,
    this.bannerMedia,
    this.bingkai,
    this.username,
    this.namaDiubahPada,
    this.usernameDiubahPada,
    this.totalBelanja = 0,
    this.pinTransferAktif = false,
    this.notifForum = true,
    this.notifDm = true,
    this.notifLive = true,
    this.slogan,
    this.bioLink,
    this.gayaNama,
    this.badge,
    this.diblokir = false,
    this.alasanBlokir,
    this.peringatan = 0,
    this.kodeReferral,
    this.diundangOleh,
  });

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: '${j['id']}',
        nama: j['nama'] ?? j['name'] ?? 'User',
        email: j['email'] ?? '',
        phone: j['phone'],
        saldo: (j['saldo'] ?? 0) as int,
        tier: j['tier'] ?? 'basic',
        avatar: j['avatar'],
        foto: (j['foto'] as String?)?.isNotEmpty == true ? j['foto'] : null,
        bio: (j['bio'] as String?)?.isNotEmpty == true ? j['bio'] : null,
        banner: (j['banner'] as String?)?.isNotEmpty == true ? j['banner'] : null,
        bannerMedia: BannerMedia.parse(j['banner_media']),
        bingkai: (j['bingkai'] as String?)?.isNotEmpty == true ? j['bingkai'] : null,
        username: (j['username'] as String?)?.isNotEmpty == true ? j['username'] : null,
        namaDiubahPada: j['nama_diubah_pada'] as String?,
        usernameDiubahPada: j['username_diubah_pada'] as String?,
        totalBelanja: (j['total_belanja'] ?? 0) as int,
        pinTransferAktif: (j['pin_transfer_aktif'] ?? 0) == 1,
        notifForum: (j['notif_forum'] ?? 1) == 1,
        notifDm: (j['notif_dm'] ?? 1) == 1,
        notifLive: (j['notif_live'] ?? 1) == 1,
        slogan: (j['slogan'] as String?)?.isNotEmpty == true ? j['slogan'] : null,
        bioLink: (j['bio_link'] as String?)?.isNotEmpty == true ? j['bio_link'] : null,
        gayaNama: (j['gaya_nama'] as String?)?.isNotEmpty == true ? j['gaya_nama'] : null,
        badge: (j['badge'] as String?)?.isNotEmpty == true ? j['badge'] : null,
        diblokir: (j['diblokir'] ?? 0) == 1,
        alasanBlokir: j['alasan_blokir'] as String?,
        peringatan: j['peringatan'] ?? 0,
        kodeReferral: j['kode_referral'],
        diundangOleh: j['diundang_oleh'],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'nama': nama,
        'email': email,
        'phone': phone,
        'saldo': saldo,
        'tier': tier,
        'avatar': avatar,
        'foto': foto,
        'bio': bio,
        'banner': banner,
        'banner_media': bannerMedia == null ? null : bannerMedia!.toJson(),
        'bingkai': bingkai,
        'username': username,
        'nama_diubah_pada': namaDiubahPada,
        'username_diubah_pada': usernameDiubahPada,
        'total_belanja': totalBelanja,
        'pin_transfer_aktif': pinTransferAktif ? 1 : 0,
        'notif_forum': notifForum ? 1 : 0,
        'notif_dm': notifDm ? 1 : 0,
        'notif_live': notifLive ? 1 : 0,
        'slogan': slogan,
        'bio_link': bioLink,
        'gaya_nama': gayaNama,
        'badge': badge,
      };

  UserProfile copyWith({int? saldo, String? nama, String? phone, String? foto, String? bio, String? banner, String? username, String? bingkai, BannerMedia? bannerMedia, bool hapusBannerMedia = false, int? totalBelanja, bool? pinTransferAktif, bool? diblokir, String? alasanBlokir, int? peringatan, String? slogan, String? bioLink, String? gayaNama}) => UserProfile(
        id: id,
        nama: nama ?? this.nama,
        email: email,
        phone: phone ?? this.phone,
        saldo: saldo ?? this.saldo,
        tier: tier,
        foto: foto ?? this.foto,
        avatar: avatar,
        bio: bio ?? this.bio,
        banner: banner ?? this.banner,
        bannerMedia:
            hapusBannerMedia ? null : (bannerMedia ?? this.bannerMedia),
        bingkai: bingkai ?? this.bingkai,
        username: username ?? this.username,
        namaDiubahPada: namaDiubahPada,
        usernameDiubahPada: usernameDiubahPada,
        totalBelanja: totalBelanja ?? this.totalBelanja,
        pinTransferAktif: pinTransferAktif ?? this.pinTransferAktif,
        notifForum: notifForum,
        notifDm: notifDm,
        notifLive: notifLive,
        slogan: slogan ?? this.slogan,
        bioLink: bioLink ?? this.bioLink,
        gayaNama: gayaNama ?? this.gayaNama,
        badge: badge,
        diblokir: diblokir ?? this.diblokir,
        alasanBlokir: alasanBlokir ?? this.alasanBlokir,
        peringatan: peringatan ?? this.peringatan,
        kodeReferral: kodeReferral,
        diundangOleh: diundangOleh,
      );
}

/// ============================================================
///  Sosial (Batch D): profil publik, ikutan, dan pesan DM
/// ============================================================
class ProfilPublik {
  final String id;
  final String nama;
  final String? username;
  final String? foto;
  final String? bio;
  final String? banner;
  final BannerMedia? bannerMedia;
  final String? bingkai;
  final String? tier;
  final String? badge;
  /// Batch L: identitas tambahan yang tampil ke semua orang.
  final String? slogan;
  final String? bioLink;
  final String? gayaNama;
  final String? createdAt;
  final int pengikut;
  final int mengikuti;
  final int posting;
  final bool sayaIkuti;
  final bool saya;

  const ProfilPublik({
    required this.id, required this.nama, this.username, this.foto, this.bio, this.banner,
    this.bannerMedia, this.bingkai, this.tier, this.badge,
    this.slogan, this.bioLink, this.gayaNama, this.createdAt,
    this.pengikut = 0, this.mengikuti = 0,
    this.posting = 0, this.sayaIkuti = false, this.saya = false,
  });

  factory ProfilPublik.fromJson(Map<String, dynamic> j) => ProfilPublik(
    id: j['id'] as String,
    nama: j['nama'] as String? ?? '',
    username: (j['username'] as String?)?.isNotEmpty == true ? j['username'] : null,
    foto: j['foto'] as String?,
    bio: j['bio'] as String?,
    banner: j['banner'] as String?,
    bannerMedia: BannerMedia.parse(j['banner_media']),
    bingkai: (j['bingkai'] as String?)?.isNotEmpty == true ? j['bingkai'] : null,
    tier: j['tier'] as String?,
    badge: j['badge'] as String?,
    slogan: (j['slogan'] as String?)?.isNotEmpty == true ? j['slogan'] : null,
    bioLink: (j['bio_link'] as String?)?.isNotEmpty == true ? j['bio_link'] : null,
    gayaNama: (j['gaya_nama'] as String?)?.isNotEmpty == true ? j['gaya_nama'] : null,
    createdAt: j['created_at'] as String?,
    pengikut: (j['pengikut'] as num?)?.toInt() ?? 0,
    mengikuti: (j['mengikuti'] as num?)?.toInt() ?? 0,
    posting: (j['posting'] as num?)?.toInt() ?? 0,
    // Server membalas kunci camelCase; terima juga varian snake_case.
    sayaIkuti: j['sayaIkuti'] == true || j['saya_ikuti'] == 1 || j['saya_ikuti'] == true,
    saya: j['saya'] == 1 || j['saya'] == true,
  );

  ProfilPublik copyWith({bool? sayaIkuti, int? pengikut}) => ProfilPublik(
        id: id, nama: nama, username: username, foto: foto, bio: bio,
        banner: banner, bannerMedia: bannerMedia, bingkai: bingkai,
        tier: tier, badge: badge, slogan: slogan, bioLink: bioLink,
        gayaNama: gayaNama, createdAt: createdAt,
        pengikut: pengikut ?? this.pengikut, mengikuti: mengikuti,
        posting: posting, sayaIkuti: sayaIkuti ?? this.sayaIkuti, saya: saya,
      );
}
