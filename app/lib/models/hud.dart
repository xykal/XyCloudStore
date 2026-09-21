// Model hud — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

import 'dart:convert';
import 'moderasi.dart';

/// ============================================================
///  HUD streaming kustom (Batch P)
/// ============================================================
/// Posisi tombol disimpan relatif (0–1) terhadap kanvas landscape. Ukuran
/// disimpan dalam dp supaya editor Flutter dan overlay native Android memakai
/// bentuk yang sama pada perangkat dengan kepadatan layar berbeda.
class HudTombol {
  final String id;
  final String label;
  final int kode;
  final double x;
  final double y;
  final double lebar;
  final double tinggi;
  final double opacity;
  final String cara; // tahan | ketuk | toggle

  const HudTombol({
    required this.id,
    required this.label,
    required this.kode,
    this.x = .45,
    this.y = .45,
    this.lebar = 56,
    this.tinggi = 56,
    this.opacity = .86,
    this.cara = 'tahan',
  });

  factory HudTombol.fromJson(Map<String, dynamic> j) => HudTombol(
        id: '${j['id'] ?? 't_${DateTime.now().microsecondsSinceEpoch}'}',
        label: _labelHud(j['label']),
        kode: (j['kode'] as num?)?.toInt() ?? 0,
        x: _angkaHud(j['x'], .45).clamp(0, 1).toDouble(),
        y: _angkaHud(j['y'], .45).clamp(0, 1).toDouble(),
        lebar: _angkaHud(j['lebar'], 56).clamp(36, 160).toDouble(),
        tinggi: _angkaHud(j['tinggi'], 56).clamp(36, 100).toDouble(),
        opacity: _angkaHud(j['opacity'], .86).clamp(.25, 1).toDouble(),
        cara: const {'tahan', 'ketuk', 'toggle'}.contains(j['cara'])
            ? '${j['cara']}'
            : 'tahan',
      );

  HudTombol copyWith({
    String? id,
    String? label,
    int? kode,
    double? x,
    double? y,
    double? lebar,
    double? tinggi,
    double? opacity,
    String? cara,
  }) =>
      HudTombol(
        id: id ?? this.id,
        label: label ?? this.label,
        kode: kode ?? this.kode,
        x: x ?? this.x,
        y: y ?? this.y,
        lebar: lebar ?? this.lebar,
        tinggi: tinggi ?? this.tinggi,
        opacity: opacity ?? this.opacity,
        cara: cara ?? this.cara,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'kode': kode,
        'x': double.parse(x.toStringAsFixed(5)),
        'y': double.parse(y.toStringAsFixed(5)),
        'lebar': lebar.round(),
        'tinggi': tinggi.round(),
        'opacity': double.parse(opacity.toStringAsFixed(2)),
        'cara': cara,
      };
}

double _angkaHud(dynamic v, double fallback) =>
    v is num && v.isFinite ? v.toDouble() : fallback;

String _labelHud(dynamic v) {
  final s = '${v ?? '?'}'.trim();
  if (s.isEmpty) return '?';
  return String.fromCharCodes(s.runes.take(8));
}

class HudLayout {
  final String id;
  final String nama;
  final String deskripsi;
  final String game;
  final List<HudTombol> tombol;
  final bool bawaan;
  final String? sumberId;

  const HudLayout({
    required this.id,
    required this.nama,
    this.deskripsi = '',
    this.game = '',
    this.tombol = const [],
    this.bawaan = false,
    this.sumberId,
  });

  factory HudLayout.baru() => HudLayout(
        id: 'lokal_${DateTime.now().microsecondsSinceEpoch}',
        nama: 'HUD Baru',
      );

  factory HudLayout.fromJson(Map<String, dynamic> j) {
    dynamic raw = j['tombol'];
    if (j['data'] is Map) raw = (j['data'] as Map)['tombol'];
    return HudLayout(
      id: '${j['id'] ?? 'lokal_${DateTime.now().microsecondsSinceEpoch}'}',
      nama: '${j['nama'] ?? 'HUD Tanpa Nama'}',
      deskripsi: '${j['deskripsi'] ?? ''}',
      game: '${j['game'] ?? ''}',
      bawaan: j['bawaan'] == true,
      sumberId: j['sumber_id'] as String?,
      tombol: (raw as List? ?? const [])
          .whereType<Map>()
          .map((e) => HudTombol.fromJson(Map<String, dynamic>.from(e)))
          .take(48)
          .toList(),
    );
  }

  HudLayout copyWith({
    String? id,
    String? nama,
    String? deskripsi,
    String? game,
    List<HudTombol>? tombol,
    bool? bawaan,
    String? sumberId,
  }) =>
      HudLayout(
        id: id ?? this.id,
        nama: nama ?? this.nama,
        deskripsi: deskripsi ?? this.deskripsi,
        game: game ?? this.game,
        tombol: tombol ?? this.tombol,
        bawaan: bawaan ?? this.bawaan,
        sumberId: sumberId ?? this.sumberId,
      );

  /// Bentuk minimum yang dikirim ke Android dan server komunitas.
  Map<String, dynamic> toData() => {
        'versi': 1,
        'tombol': tombol.map((e) => e.toJson()).toList(),
      };

  Map<String, dynamic> toJson() => {
        'id': id,
        'nama': nama,
        'deskripsi': deskripsi,
        'game': game,
        'bawaan': bawaan,
        if (sumberId != null) 'sumber_id': sumberId,
        ...toData(),
      };
}

/// Metadata preset yang diterbitkan pengguna ke galeri komunitas.
class HudPresetPublik {
  final String id;
  final String userId;
  final String nama;
  final String deskripsi;
  final String game;
  final HudLayout layout;
  final bool publik;
  final int suka;
  final int dipakai;
  final bool sayaSuka;
  final bool saya;
  final String pembuatNama;
  final String? pembuatUsername;
  final String? pembuatFoto;
  final String? pembuatTier;
  final int dibuat;
  final int diubah;

  const HudPresetPublik({
    required this.id,
    required this.userId,
    required this.nama,
    required this.layout,
    this.deskripsi = '',
    this.game = '',
    this.publik = true,
    this.suka = 0,
    this.dipakai = 0,
    this.sayaSuka = false,
    this.saya = false,
    this.pembuatNama = '',
    this.pembuatUsername,
    this.pembuatFoto,
    this.pembuatTier,
    this.dibuat = 0,
    this.diubah = 0,
  });

  factory HudPresetPublik.fromJson(Map<String, dynamic> j) {
    Map<String, dynamic> data = {};
    final raw = j['data'];
    if (raw is Map) {
      data = Map<String, dynamic>.from(raw);
    } else if (raw is String && raw.isNotEmpty) {
      try {
        data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      } catch (_) {}
    }
    final id = '${j['id'] ?? ''}';
    final nama = '${j['nama'] ?? 'Preset HUD'}';
    final deskripsi = '${j['deskripsi'] ?? ''}';
    final game = '${j['game'] ?? ''}';
    return HudPresetPublik(
      id: id,
      userId: '${j['user_id'] ?? ''}',
      nama: nama,
      deskripsi: deskripsi,
      game: game,
      layout: HudLayout.fromJson({
        'id': 'komunitas_$id',
        'nama': nama,
        'deskripsi': deskripsi,
        'game': game,
        'sumber_id': id,
        'data': data,
      }),
      publik: j['publik'] == true || j['publik'] == 1,
      suka: (j['suka'] as num?)?.toInt() ?? 0,
      dipakai: (j['dipakai'] as num?)?.toInt() ?? 0,
      sayaSuka: j['saya_suka'] == true || j['saya_suka'] == 1,
      saya: j['saya'] == true || j['saya'] == 1,
      pembuatNama: '${j['pembuat_nama'] ?? ''}',
      pembuatUsername: j['pembuat_username'] as String?,
      pembuatFoto: j['pembuat_foto'] as String?,
      pembuatTier: j['pembuat_tier'] as String?,
      dibuat: waktuMs(j['dibuat']),
      diubah: waktuMs(j['diubah']),
    );
  }

  HudPresetPublik copyWith({bool? sayaSuka, int? suka, int? dipakai}) =>
      HudPresetPublik(
        id: id,
        userId: userId,
        nama: nama,
        deskripsi: deskripsi,
        game: game,
        layout: layout,
        publik: publik,
        suka: suka ?? this.suka,
        dipakai: dipakai ?? this.dipakai,
        sayaSuka: sayaSuka ?? this.sayaSuka,
        saya: saya,
        pembuatNama: pembuatNama,
        pembuatUsername: pembuatUsername,
        pembuatFoto: pembuatFoto,
        pembuatTier: pembuatTier,
        dibuat: dibuat,
        diubah: diubah,
      );
}

/// Pilihan keycode Android yang aman dan berguna untuk dikirim ke host PC.
class HudAksi {
  final String label;
  final int kode;
  final String grup;
  final String cara;
  const HudAksi(this.label, this.kode, this.grup, [this.cara = 'tahan']);
}

const hudAksiTersedia = <HudAksi>[
  HudAksi('W', 51, 'Gerak'), HudAksi('A', 29, 'Gerak'),
  HudAksi('S', 47, 'Gerak'), HudAksi('D', 32, 'Gerak'),
  HudAksi('↑', 19, 'Gerak'), HudAksi('↓', 20, 'Gerak'),
  HudAksi('←', 21, 'Gerak'), HudAksi('→', 22, 'Gerak'),
  HudAksi('Space', 62, 'Aksi'), HudAksi('Shift', 59, 'Aksi'),
  HudAksi('Ctrl', 113, 'Aksi'), HudAksi('Alt', 57, 'Aksi'),
  HudAksi('Win', 117, 'Aksi', 'toggle'),
  HudAksi('B', 30, 'Huruf'), HudAksi('C', 31, 'Huruf'),
  HudAksi('E', 33, 'Huruf'), HudAksi('F', 34, 'Huruf'),
  HudAksi('G', 35, 'Huruf'), HudAksi('H', 36, 'Huruf'),
  HudAksi('I', 37, 'Huruf'), HudAksi('J', 38, 'Huruf'),
  HudAksi('K', 39, 'Huruf'), HudAksi('L', 40, 'Huruf'),
  HudAksi('M', 41, 'Huruf'), HudAksi('N', 42, 'Huruf'),
  HudAksi('O', 43, 'Huruf'), HudAksi('P', 44, 'Huruf'),
  HudAksi('Q', 45, 'Huruf'), HudAksi('R', 46, 'Huruf'),
  HudAksi('T', 48, 'Huruf'), HudAksi('U', 49, 'Huruf'),
  HudAksi('V', 50, 'Huruf'), HudAksi('X', 52, 'Huruf'),
  HudAksi('Y', 53, 'Huruf'), HudAksi('Z', 54, 'Huruf'),
  HudAksi('0', 7, 'Angka', 'ketuk'), HudAksi('1', 8, 'Angka', 'ketuk'),
  HudAksi('2', 9, 'Angka', 'ketuk'), HudAksi('3', 10, 'Angka', 'ketuk'),
  HudAksi('4', 11, 'Angka', 'ketuk'), HudAksi('5', 12, 'Angka', 'ketuk'),
  HudAksi('6', 13, 'Angka', 'ketuk'), HudAksi('7', 14, 'Angka', 'ketuk'),
  HudAksi('8', 15, 'Angka', 'ketuk'), HudAksi('9', 16, 'Angka', 'ketuk'),
  HudAksi('Esc', 111, 'Sistem', 'ketuk'), HudAksi('Tab', 61, 'Sistem', 'ketuk'),
  HudAksi('Enter', 66, 'Sistem', 'ketuk'), HudAksi('Back', 67, 'Sistem', 'ketuk'),
  HudAksi('Delete', 112, 'Sistem', 'ketuk'), HudAksi('Insert', 124, 'Sistem', 'ketuk'),
  HudAksi('Home', 122, 'Sistem', 'ketuk'), HudAksi('End', 123, 'Sistem', 'ketuk'),
  HudAksi('PgUp', 92, 'Sistem', 'ketuk'), HudAksi('PgDn', 93, 'Sistem', 'ketuk'),
  HudAksi('Caps', 115, 'Sistem', 'ketuk'),
  HudAksi('-', 69, 'Simbol', 'ketuk'), HudAksi('=', 70, 'Simbol', 'ketuk'),
  HudAksi('[', 71, 'Simbol', 'ketuk'), HudAksi(']', 72, 'Simbol', 'ketuk'),
  HudAksi('\\', 73, 'Simbol', 'ketuk'), HudAksi(';', 74, 'Simbol', 'ketuk'),
  HudAksi("'", 75, 'Simbol', 'ketuk'), HudAksi('/', 76, 'Simbol', 'ketuk'),
  HudAksi(',', 55, 'Simbol', 'ketuk'), HudAksi('.', 56, 'Simbol', 'ketuk'),
  HudAksi('F1', 131, 'F-Key', 'ketuk'), HudAksi('F2', 132, 'F-Key', 'ketuk'),
  HudAksi('F3', 133, 'F-Key', 'ketuk'), HudAksi('F4', 134, 'F-Key', 'ketuk'),
  HudAksi('F5', 135, 'F-Key', 'ketuk'), HudAksi('F6', 136, 'F-Key', 'ketuk'),
  HudAksi('F7', 137, 'F-Key', 'ketuk'), HudAksi('F8', 138, 'F-Key', 'ketuk'),
  HudAksi('F9', 139, 'F-Key', 'ketuk'), HudAksi('F10', 140, 'F-Key', 'ketuk'),
  HudAksi('F11', 141, 'F-Key', 'ketuk'), HudAksi('F12', 142, 'F-Key', 'ketuk'),
];
