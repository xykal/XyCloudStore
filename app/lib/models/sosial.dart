// Model sosial — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

import '../core/waktu.dart';
import 'moderasi.dart';

class ChatMessage {
  final String id;
  final String room;
  final String? clientId;
  final String dari; // 'user' | 'cs' | 'system'
  final String tipe; // 'teks' | 'gambar' | 'audio' | 'system'
  final String teks;
  final String? gambar;
  final String? audio;
  final double? durasi;
  final String? replyTo;
  final String? replyTeks;
  final String? replyTipe;
  final DateTime waktu;
  bool terkirim;
  bool dibaca;
  bool gagal;

  ChatMessage({
    required this.id,
    required this.room,
    required this.dari,
    required this.teks,
    required this.waktu,
    this.gambar,
    this.audio,
    this.durasi,
    this.tipe = 'teks',
    this.replyTo,
    this.replyTeks,
    this.replyTipe,
    this.clientId,
    this.terkirim = true,
    this.dibaca = false,
    this.gagal = false,
  });

  bool get milikSaya => dari == 'user';

  /// [audio] adalah URL server (bukan data URI) — data URI hanya dipakai
  /// untuk pratinjau lokal yang belum terkirim.
  bool get bisaPutarAudio => tipe == 'audio' && (audio?.startsWith('http') ?? false);

  factory ChatMessage.fromJson(Map<String, dynamic> j) {
    final gambar = (j['gambar'] as String?)?.isNotEmpty == true ? j['gambar'] : null;
    final audio = (j['audio'] as String?)?.isNotEmpty == true ? j['audio'] : null;
    final dari = j['dari'] ?? j['from'] ?? 'cs';
    var tipe = '${j['tipe'] ?? (audio != null ? 'audio' : (gambar != null ? 'gambar' : 'teks'))}';
    if (dari == 'system') tipe = 'system';
    final durasi = j['durasi'];
    return ChatMessage(
        id: '${j['id']}',
        room: j['room'] ?? '',
        clientId: j['client_id'],
        dari: dari,
        tipe: tipe,
        teks: j['teks'] ?? j['text'] ?? '',
        gambar: gambar,
        audio: audio,
        durasi: durasi is num ? durasi.toDouble() : null,
        replyTo: (j['reply_to'] as String?)?.isNotEmpty == true ? j['reply_to'] : null,
        replyTeks: (j['reply_teks'] as String?)?.isNotEmpty == true ? j['reply_teks'] : null,
        replyTipe: '${j['reply_tipe'] ?? 'teks'}',
        waktu: tanggalServer(j['waktu'] ?? j['at']),
        dibaca: (j['dibaca'] ?? 0) == 1,
      );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'room': room,
        'client_id': clientId,
        'dari': dari,
        'tipe': tipe,
        'teks': teks,
        'gambar': gambar,
        'audio': audio,
        'durasi': durasi,
        'reply_to': replyTo,
        'reply_teks': replyTeks,
        'reply_tipe': replyTipe,
        'waktu': waktu.toIso8601String(),
      };
}

class DmPesan {
  final String id;
  final String dariId;
  final String keId;
  final String? teks;
  final String? audio;
  final double? durasi;
  final String? gambar;
  final String tipe;
  final bool dibaca;
  final int waktu;
  final String? dariNama;
  final String? dariFoto;

  const DmPesan({
    required this.id, required this.dariId, required this.keId, this.teks,
    this.audio, this.durasi, this.gambar, this.tipe = 'text',
    this.dibaca = false, this.waktu = 0, this.dariNama, this.dariFoto,
  });

  factory DmPesan.fromJson(Map<String, dynamic> j) => DmPesan(
    id: j['id'] as String? ?? '',
    dariId: j['dari_id'] as String? ?? '',
    keId: j['ke_id'] as String? ?? '',
    teks: j['teks'] as String?,
    audio: j['audio'] as String?,
    durasi: (j['durasi'] as num?)?.toDouble(),
    gambar: j['gambar'] as String?,
    tipe: j['tipe'] as String? ?? 'text',
    dibaca: j['dibaca'] == 1 || j['dibaca'] == true,
    waktu: waktuMs(j['waktu']),
    dariNama: j['dari_nama'] as String?,
    dariFoto: j['dari_foto'] as String?,
  );

  bool dariSaya(String sayaId) => dariId == sayaId;
  DateTime get tanggal => DateTime.fromMillisecondsSinceEpoch(waktu);

  Map<String, dynamic> toJson() => {
    'id': id,
    'dari_id': dariId,
    'ke_id': keId,
    'teks': teks,
    'audio': audio,
    'durasi': durasi,
    'gambar': gambar,
    'tipe': tipe,
    'dibaca': dibaca ? 1 : 0,
    'waktu': waktu,
    'dari_nama': dariNama,
    'dari_foto': dariFoto,
  };
}

/// Satu baris pemberitahuan di pusat notifikasi.
class Notifikasi {
  final String id;
  final String jenis; // suka | balasan | komunitas | peringatan | sistem | order | wallet
  final String judul;
  final String pesan;
  final String? aktor;
  final String? refJenis;
  final String? refId;
  final bool dibaca;
  final DateTime dibuat;

  Notifikasi({
    required this.id,
    required this.jenis,
    required this.judul,
    required this.pesan,
    required this.dibuat,
    this.aktor,
    this.refJenis,
    this.refId,
    this.dibaca = false,
  });

  factory Notifikasi.fromJson(Map<String, dynamic> j) => Notifikasi(
        id: '${j['id']}',
        jenis: j['jenis'] ?? 'sistem',
        judul: j['judul'] ?? '',
        pesan: j['pesan'] ?? '',
        aktor: j['aktor'],
        refJenis: j['ref_jenis'],
        refId: j['ref_id'],
        dibaca: (j['dibaca'] ?? 0) == 1,
        dibuat: tanggalServer(j['dibuat']),
      );
}

/// Baris leaderboard nyata (Batch I) — poin = belanja bulan ini / total.
class PapanPeringkat {
  final int peringkat;
  final String id;
  final String nama;
  final String? username;
  final String? foto;
  final String? tier;
  final String? badge;
  final String? bingkai;
  final String? gayaNama;
  final String? slogan;
  final int poin;
  final bool saya;

  const PapanPeringkat({
    required this.peringkat, required this.id, required this.nama,
    this.username, this.foto, this.tier, this.badge, this.bingkai,
    this.gayaNama, this.slogan,
    this.poin = 0, this.saya = false,
  });

  factory PapanPeringkat.fromJson(Map<String, dynamic> j) => PapanPeringkat(
        peringkat: (j['peringkat'] as num?)?.toInt() ?? 0,
        id: '${j['id']}',
        nama: j['nama'] as String? ?? '',
        username: (j['username'] as String?)?.isNotEmpty == true ? j['username'] : null,
        foto: j['foto'] as String?,
        tier: j['tier'] as String?,
        badge: j['badge'] as String?,
        bingkai: (j['bingkai'] as String?)?.isNotEmpty == true ? j['bingkai'] : null,
        gayaNama: (j['gaya_nama'] as String?)?.isNotEmpty == true ? j['gaya_nama'] : null,
        slogan: (j['slogan'] as String?)?.isNotEmpty == true ? j['slogan'] : null,
        poin: (j['poin'] as num?)?.toInt() ?? 0,
        saya: j['saya'] == true || j['saya'] == 1,
      );
}

class DataLeaderboard {
  final String periode; // 'bulan' | 'total'
  final int? peringkatSaya;
  final int poinSaya;
  final List<PapanPeringkat> papan;

  const DataLeaderboard({
    required this.periode, this.peringkatSaya, this.poinSaya = 0,
    this.papan = const [],
  });

  factory DataLeaderboard.fromJson(Map<String, dynamic> j) {
    final saya = Map<String, dynamic>.from(j['saya'] as Map? ?? {});
    final papan = (j['papan'] as List? ?? [])
        .map((e) => PapanPeringkat.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    return DataLeaderboard(
      periode: j['periode'] as String? ?? 'bulan',
      peringkatSaya: (saya['peringkat'] as num?)?.toInt(),
      poinSaya: (saya['poin'] as num?)?.toInt() ?? 0,
      papan: papan,
    );
  }
}
