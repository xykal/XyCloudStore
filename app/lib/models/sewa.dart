// Model sewa — dipecah dari models.dart (P2 rapih/semua).
// models.dart tetap barrel export; import lama tidak berubah.

import 'dart:convert';

/// Paket / spesifikasi PC cloud yang bisa disewa.
class PcPlan {
  final String id;
  final String nama;
  final String gpu;
  final String cpu;
  final int ramGb;
  final int storageGb;
  final int hargaPerJam;
  final int hargaPerHari;
  final String region;
  final String tag; // Populer, Hemat, Ultra
  final int totalUnit;
  int unitTersedia; // realtime
  final String gambar;

  PcPlan({
    required this.id,
    required this.nama,
    required this.gpu,
    required this.cpu,
    required this.ramGb,
    required this.storageGb,
    required this.hargaPerJam,
    required this.hargaPerHari,
    required this.region,
    required this.tag,
    required this.totalUnit,
    required this.unitTersedia,
    required this.gambar,
  });

  bool get ready => unitTersedia > 0;

  factory PcPlan.fromJson(Map<String, dynamic> j) => PcPlan(
        id: '${j['id']}',
        nama: j['nama'],
        gpu: j['gpu'],
        cpu: j['cpu'],
        ramGb: j['ram_gb'] ?? j['ramGb'] ?? 16,
        storageGb: j['storage_gb'] ?? j['storageGb'] ?? 256,
        hargaPerJam: j['harga_per_jam'] ?? j['hargaPerJam'] ?? 0,
        hargaPerHari: j['harga_per_hari'] ?? j['hargaPerHari'] ?? 0,
        region: j['region'] ?? 'Jakarta',
        tag: j['tag'] ?? '',
        totalUnit: j['total_unit'] ?? j['totalUnit'] ?? 0,
        unitTersedia: j['unit_tersedia'] ?? j['unitTersedia'] ?? 0,
        gambar: j['gambar'] ?? '',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'nama': nama,
        'gpu': gpu,
        'cpu': cpu,
        'ram_gb': ramGb,
        'storage_gb': storageGb,
        'harga_per_jam': hargaPerJam,
        'harga_per_hari': hargaPerHari,
        'region': region,
        'tag': tag,
        'total_unit': totalUnit,
        'unit_tersedia': unitTersedia,
        'gambar': gambar,
      };
}

enum OrderStatus { pending, dibayar, provisioning, aktif, selesai, batal }

OrderStatus statusFrom(String s) => OrderStatus.values.firstWhere(
      (e) => e.name == s,
      orElse: () => OrderStatus.pending,
    );

extension OrderStatusX on OrderStatus {
  String get label => switch (this) {
        OrderStatus.pending => 'Menunggu Pembayaran',
        OrderStatus.dibayar => 'Pembayaran Diterima',
        OrderStatus.provisioning => 'Menyiapkan Mesin',
        OrderStatus.aktif => 'Sesi Aktif',
        OrderStatus.selesai => 'Selesai',
        OrderStatus.batal => 'Dibatalkan',
      };
  int get step => switch (this) {
        OrderStatus.pending => 0,
        OrderStatus.dibayar => 1,
        OrderStatus.provisioning => 2,
        OrderStatus.aktif => 3,
        OrderStatus.selesai => 4,
        OrderStatus.batal => -1,
      };
}

/// Order sewa PC.
class RentOrder {
  final String id;
  final String kode;
  final String planId;
  final String planNama;
  final int durasiJam;
  final int total;
  OrderStatus status;
  final DateTime dibuat;
  DateTime? mulai;
  DateTime? berakhir;
  String? host;
  String? username;
  String? password;
  int progress; // 0-100 saat provisioning

  RentOrder({
    required this.id,
    required this.kode,
    required this.planId,
    required this.planNama,
    required this.durasiJam,
    required this.total,
    required this.status,
    required this.dibuat,
    this.mulai,
    this.berakhir,
    this.host,
    this.username,
    this.password,
    this.progress = 0,
  });

  factory RentOrder.fromJson(Map<String, dynamic> j) => RentOrder(
        id: '${j['id']}',
        kode: j['kode'] ?? j['code'] ?? '-',
        planId: '${j['plan_id'] ?? j['planId'] ?? ''}',
        planNama: j['plan_nama'] ?? j['planNama'] ?? '',
        durasiJam: j['durasi_jam'] ?? j['durasiJam'] ?? 1,
        total: j['total'] ?? 0,
        status: statusFrom(j['status'] ?? 'pending'),
        dibuat: DateTime.parse(j['dibuat'] ?? j['created_at']),
        mulai: (j['mulai'] ?? j['start_at']) == null ? null : DateTime.parse(j['mulai'] ?? j['start_at']),
        berakhir: (j['berakhir'] ?? j['end_at']) == null ? null : DateTime.parse(j['berakhir'] ?? j['end_at']),
        host: j['host'],
        username: j['username'],
        password: j['password'],
        progress: j['progress'] ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'kode': kode,
        'plan_id': planId,
        'plan_nama': planNama,
        'durasi_jam': durasiJam,
        'total': total,
        'status': status.name,
        'dibuat': dibuat.toIso8601String(),
        'mulai': mulai?.toIso8601String(),
        'berakhir': berakhir?.toIso8601String(),
        'host': host,
        'username': username,
        'password': password,
        'progress': progress,
      };
}

/// Produk akun digital yang dijual (Steam, Netflix, Game Pass, dsb).
/// Membaca kolom `detail` yang bisa berupa peta atau teks JSON.
Map<String, dynamic> _petaAman(dynamic v) {
  if (v == null) return const {};
  if (v is Map) return Map<String, dynamic>.from(v);
  if (v is String && v.trim().startsWith('{')) {
    try {
      return Map<String, dynamic>.from(jsonDecode(v));
    } catch (_) {}
  }
  return const {};
}

/// Sesi bermain di PC sewaan.
class SesiMain {
  final String id;
  final String orderId;
  final String? agenId;
  final String status; // menyiapkan | siap | pairing | berjalan | selesai | gagal
  final String? host;
  final String? hostLan;
  final String? tunnelHost; // Cloudflare Tunnel tanpa Tailscale
  final String? relayHost; // Custom UDP relay (Fly.io)
  final String? catatan;
  final int durasiMenit;
  final DateTime? mulai;
  final DateTime? berakhir;
  final String? clientState;
  final DateTime? clientLast;
  final String? clientRoute;
  final int? clientLatencyMs;
  final String? clientQuality;
  final int clientDisconnects;
  final int clientReconnectAttempt;
  final String? clientReason;

  SesiMain({
    required this.id,
    required this.orderId,
    required this.status,
    this.agenId,
    this.host,
    this.hostLan,
    this.tunnelHost,
    this.relayHost,
    this.catatan,
    this.durasiMenit = 60,
    this.mulai,
    this.berakhir,
    this.clientState,
    this.clientLast,
    this.clientRoute,
    this.clientLatencyMs,
    this.clientQuality,
    this.clientDisconnects = 0,
    this.clientReconnectAttempt = 0,
    this.clientReason,
  });

  factory SesiMain.fromJson(Map<String, dynamic> j) => SesiMain(
        id: '${j['id']}',
        orderId: '${j['order_id'] ?? ''}',
        agenId: j['agen_id'],
        status: j['status'] ?? 'menyiapkan',
        host: (j['host'] as String?)?.isNotEmpty == true ? j['host'] : null,
        hostLan:
            (j['host_lan'] as String?)?.isNotEmpty == true ? j['host_lan'] : null,
        tunnelHost: (j['tunnel_host'] as String?)?.isNotEmpty == true ? j['tunnel_host'] : null,
        relayHost: (j['relay_host'] as String?)?.isNotEmpty == true ? j['relay_host'] : null,
        catatan: (j['catatan'] as String?)?.isNotEmpty == true ? j['catatan'] : null,
        durasiMenit: j['durasi_menit'] ?? 60,
        mulai: DateTime.tryParse('${j['mulai']}'.replaceFirst(' ', 'T')),
        berakhir: DateTime.tryParse('${j['berakhir']}'.replaceFirst(' ', 'T')),
        clientState: j['client_state'] as String?,
        clientLast: j['client_last'] == null
            ? null
            : DateTime.tryParse('${j['client_last']}'.replaceFirst(' ', 'T')),
        clientRoute: j['client_route'] as String?,
        clientLatencyMs: (j['client_latency_ms'] as num?)?.toInt(),
        clientQuality: j['client_quality'] as String?,
        clientDisconnects: (j['client_disconnects'] as num?)?.toInt() ?? 0,
        clientReconnectAttempt:
            (j['client_reconnect_attempt'] as num?)?.toInt() ?? 0,
        clientReason: j['client_reason'] as String?,
      );
}

/// Agen live per paket PC (Batch J) — spek PC host terdeteksi otomatis oleh
/// agen di mesin host (heartbeat mengisi `agen.spec` di server).
class UnitLive {
  final String planId;
  final String status;
  final String versi;
  final String host;
  final String terakhir;
  final Map<String, dynamic> spec;

  const UnitLive({
    this.planId = '',
    this.status = 'offline',
    this.versi = '',
    this.host = '',
    this.terakhir = '',
    this.spec = const {},
  });

  factory UnitLive.fromJson(Map<String, dynamic> j) => UnitLive(
        planId: '${j['planId'] ?? ''}',
        status: '${j['status'] ?? 'offline'}',
        versi: '${j['versi'] ?? ''}',
        host: '${j['host'] ?? ''}',
        terakhir: '${j['terakhir'] ?? ''}',
        spec: _petaAman(j['spec']),
      );

  bool get online => status == 'online';
  String get hostname => '${spec['hostname'] ?? ''}';
  String get cpu => '${spec['cpu'] ?? ''}';
  String get ram => '${spec['ram_total_gb'] ?? ''}';
  String get gpu => '${spec['gpu'] ?? ''}';
  String get osVersi => '${spec['os_versi'] ?? ''}';
}
