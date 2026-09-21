// Model forum — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

import 'stiker.dart';
import '../core/waktu.dart';

/// Satu diskusi di forum komunitas.
class ForumPost {
  final String id;
  final String userId;
  final String nama;
  final String? foto;
  final String kategori;
  final String judul;
  final String isi;
  final String? gambar;
  final String tier;
  final String? badge;
  /// Batch L: bingkai avatar & gaya nama penulis (dibaca semua orang).
  final String? bingkai;
  final String? gayaNama;
  final bool sensitif;
  int suka;
  int balasan;
  final bool disematkan;
  final DateTime dibuat;

  ForumPost({
    required this.id,
    required this.userId,
    required this.nama,
    required this.kategori,
    required this.judul,
    required this.isi,
    required this.dibuat,
    this.foto,
    this.gambar,
    this.tier = 'basic',
    this.badge,
    this.bingkai,
    this.gayaNama,
    this.sensitif = false,
    this.suka = 0,
    this.balasan = 0,
    this.disematkan = false,
  });

  factory ForumPost.fromJson(Map<String, dynamic> j) => ForumPost(
        id: '${j['id']}',
        userId: '${j['user_id'] ?? ''}',
        nama: j['nama'] ?? 'Pengguna',
        foto: (j['foto'] as String?)?.isNotEmpty == true ? j['foto'] : null,
        kategori: j['kategori'] ?? 'Umum',
        judul: j['judul'] ?? '',
        isi: j['isi'] ?? '',
        gambar: (j['gambar'] as String?)?.isNotEmpty == true ? j['gambar'] : null,
        tier: j['tier'] ?? 'basic',
        badge: (j['badge'] as String?)?.isNotEmpty == true ? j['badge'] : null,
        bingkai: (j['bingkai'] as String?)?.isNotEmpty == true ? j['bingkai'] : null,
        gayaNama: (j['gaya_nama'] as String?)?.isNotEmpty == true ? j['gaya_nama'] : null,
        sensitif: (j['sensitif'] ?? 0) == 1,
        suka: j['suka'] ?? 0,
        balasan: j['balasan'] ?? 0,
        disematkan: (j['disematkan'] ?? 0) == 1,
        dibuat: tanggalServer(j['dibuat']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'user_id': userId,
        'nama': nama,
        'foto': foto,
        'kategori': kategori,
        'judul': judul,
        'isi': isi,
        'gambar': gambar,
        'tier': tier,
        'suka': suka,
        'balasan': balasan,
        'disematkan': disematkan ? 1 : 0,
        'dibuat': dibuat.toIso8601String(),
      };
}

/// Balasan pada sebuah diskusi.
class ForumBalasan {
  final String id;
  final String postId;
  final String userId;
  final String? balasKe;
  final String nama;
  final String? foto;
  final String isi;
  final Stiker? stiker;
  final bool admin;
  final String tier;
  final String? badge;
  /// Batch L: bingkai & gaya nama penulis komentar.
  final String? bingkai;
  final String? gayaNama;
  int suka;
  final DateTime dibuat;

  ForumBalasan({
    required this.id,
    required this.postId,
    required this.nama,
    this.userId = '',
    this.balasKe,
    required this.isi,
    this.stiker,
    required this.dibuat,
    this.foto,
    this.admin = false,
    this.tier = 'basic',
    this.badge,
    this.bingkai,
    this.gayaNama,
    this.suka = 0,
  });

  factory ForumBalasan.fromJson(Map<String, dynamic> j) => ForumBalasan(
        id: '${j['id']}',
        postId: '${j['post_id'] ?? ''}',
        userId: '${j['user_id'] ?? ''}',
        balasKe: (j['balas_ke'] as String?)?.isNotEmpty == true ? j['balas_ke'] : null,
        nama: j['nama'] ?? 'Pengguna',
        foto: (j['foto'] as String?)?.isNotEmpty == true ? j['foto'] : null,
        isi: j['isi'] ?? '',
        stiker: Stiker.baca(j['stiker']),
        admin: (j['admin'] ?? 0) == 1,
        tier: j['tier'] ?? 'basic',
        badge: (j['badge'] as String?)?.isNotEmpty == true ? j['badge'] : null,
        bingkai: (j['bingkai'] as String?)?.isNotEmpty == true ? j['bingkai'] : null,
        gayaNama: (j['gaya_nama'] as String?)?.isNotEmpty == true ? j['gaya_nama'] : null,
        suka: j['suka'] ?? 0,
        dibuat: tanggalServer(j['dibuat']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'post_id': postId,
        'user_id': userId,
        'balas_ke': balasKe,
        'nama': nama,
        'foto': foto,
        'isi': isi,
        'stiker': stiker?.toJson(),
        'admin': admin ? 1 : 0,
        'tier': tier,
        'badge': badge,
        'bingkai': bingkai,
        'gaya_nama': gayaNama,
        'suka': suka,
        'dibuat': dibuat.toIso8601String(),
      };
}
