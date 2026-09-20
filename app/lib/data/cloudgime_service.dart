import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/cache.dart';
import 'api_client.dart';

/// Status satu PC mitra CloudGime (sudah dipetakan Worker).
class CloudGimePc {
  CloudGimePc({
    required this.id,
    required this.nama,
    required this.spek,
    required this.hargaPerJam,
    required this.keadaan,
    required this.sisaMenit,
    this.sedang,
    this.berikutnya,
  });

  final String id, nama, spek, keadaan;
  final int hargaPerJam, sisaMenit;
  final CloudGimeSlot? sedang, berikutnya;

  bool get dipakai => keadaan == 'dipakai';
  bool get tersedia => keadaan == 'tersedia';
  bool get nonaktif => keadaan == 'nonaktif';
  bool get perawatan => keadaan == 'maintenance';

  factory CloudGimePc.fromJson(Map j) {
    Map? slot(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;
    return CloudGimePc(
      id: '${j['id'] ?? ''}',
      nama: '${j['nama'] ?? j['id'] ?? 'PC'}',
      spek: '${j['spek'] ?? ''}',
      hargaPerJam: (j['hargaPerJam'] as num?)?.round() ?? 0,
      keadaan: '${j['keadaan'] ?? 'nonaktif'}',
      sisaMenit: (j['sisaMenit'] as num?)?.round() ?? 0,
      sedang: CloudGimeSlot.fromJson(slot(j['sedang'])),
      berikutnya: CloudGimeSlot.fromJson(slot(j['berikutnya'])),
    );
  }
}

class CloudGimeSlot {
  CloudGimeSlot({this.mulai, this.selesai, this.nama});
  final DateTime? mulai, selesai;
  final String? nama;

  static DateTime? _iso(dynamic v) {
    final s = v?.toString() ?? '';
    if (s.isEmpty) return null;
    return DateTime.tryParse(s);
  }

  static CloudGimeSlot? fromJson(Map? j) {
    if (j == null) return null;
    final a = _iso(j['mulai']);
    final b = _iso(j['selesai']);
    if (a == null && b == null) return null;
    final n = '${j['nama'] ?? ''}'.trim();
    return CloudGimeSlot(mulai: a, selesai: b, nama: n.isEmpty ? null : n);
  }
}

class CloudGimeJadwal {
  CloudGimeJadwal({
    required this.pc,
    required this.nama,
    this.mulai,
    this.selesai,
    this.status = 'approved',
  });

  final String pc, nama, status;
  final DateTime? mulai, selesai;

  factory CloudGimeJadwal.fromJson(Map j) => CloudGimeJadwal(
        pc: '${j['pc'] ?? ''}',
        nama: '${j['nama'] ?? ''}'.trim(),
        mulai: DateTime.tryParse('${j['mulai'] ?? ''}'),
        selesai: DateTime.tryParse('${j['selesai'] ?? ''}'),
        status: '${j['status'] ?? 'approved'}',
      );
}

class CloudGimeStatus {
  CloudGimeStatus({
    required this.serverTime,
    required this.timezone,
    required this.maintenance,
    required this.pcs,
    this.jadwal = const [],
  });

  final DateTime? serverTime;
  final String timezone;
  final bool maintenance;
  final List<CloudGimePc> pcs;
  final List<CloudGimeJadwal> jadwal;

  factory CloudGimeStatus.fromJson(dynamic raw) {
    final j = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    return CloudGimeStatus(
      serverTime: DateTime.tryParse('${j['serverTime'] ?? ''}'),
      timezone: '${j['timezone'] ?? 'Asia/Jakarta'}',
      maintenance: j['maintenance'] == true,
      pcs: (j['pcs'] as List? ?? [])
          .whereType<Map>()
          .map((e) => CloudGimePc.fromJson(e))
          .toList(),
      jadwal: (j['jadwal'] as List? ?? [])
          .whereType<Map>()
          .map((e) => CloudGimeJadwal.fromJson(e))
          .toList(),
    );
  }
}

class CloudGimeBooking {
  CloudGimeBooking({
    required this.id,
    required this.status,
    required this.pcNama,
    this.mulai,
    this.selesai,
    this.durasiMenit = 0,
    this.bayar = 0,
    this.paymentStatus = '',
    this.bisaReschedule = false,
    this.token = '',
    this.rescheduleToken = '',
  });

  final String id, status, pcNama, paymentStatus, token, rescheduleToken;
  final DateTime? mulai, selesai;
  final int durasiMenit, bayar;
  final bool bisaReschedule;

  bool get pending =>
      status == 'pending' || paymentStatus == 'waiting_verification' || paymentStatus == 'unpaid';

  factory CloudGimeBooking.fromJson(dynamic raw) {
    final j = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    return CloudGimeBooking(
      id: '${j['id'] ?? ''}',
      status: '${j['status'] ?? ''}',
      pcNama: '${j['pcNama'] ?? ''}',
      mulai: DateTime.tryParse('${j['mulai'] ?? ''}'),
      selesai: DateTime.tryParse('${j['selesai'] ?? ''}'),
      durasiMenit: (j['durasiMenit'] as num?)?.round() ?? 0,
      bayar: (j['bayar'] as num?)?.round() ?? 0,
      paymentStatus: '${j['paymentStatus'] ?? ''}',
      bisaReschedule: j['bisaReschedule'] == true,
      token: '${j['token'] ?? ''}',
      rescheduleToken: '${j['rescheduleToken'] ?? ''}',
    );
  }
}

/// Klien CloudGime lewat Worker XyCloud. Token booking disimpan terenkripsi.
class CloudGimeService {
  CloudGimeService(this._api);
  final ApiClient _api;

  static const _kId = 'xy_cloudgime_booking_id';
  static const _kToken = 'xy_cloudgime_booking_token';
  static const _aman = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  CloudGimeStatus? _cache;
  DateTime? _cacheAt;

  CloudGimeStatus? get terakhir => _cache;

  Future<CloudGimeStatus?> bacaCacheLokal() async {
    try {
      final c = await Cache.baca('cloudgime_status');
      final d = c?['data'];
      if (d is Map) {
        _cache = CloudGimeStatus.fromJson(d);
        return _cache;
      }
    } catch (_) {}
    return _cache;
  }

  Future<CloudGimeStatus> status({bool paksa = false}) async {
    final now = DateTime.now();
    if (!paksa &&
        _cache != null &&
        _cacheAt != null &&
        now.difference(_cacheAt!) < const Duration(seconds: 20)) {
      return _cache!;
    }
    final j = await _api.get('/cloudgime/status');
    _cache = CloudGimeStatus.fromJson(j);
    _cacheAt = DateTime.now();
    if (j is Map) {
      unawaited(Cache.simpan('cloudgime_status', Map<String, dynamic>.from(j)));
    }
    return _cache!;
  }

  Future<CloudGimeBooking> booking(String id, String token) async {
    final j = await _api.get('/cloudgime/booking/$id', {'token': token});
    return CloudGimeBooking.fromJson(j);
  }

  Future<CloudGimeBooking> pesan({
    required String nama,
    required String telepon,
    required String pcNama,
    required String tanggal,
    required String jamMulai,
    required int durasiMenit,
    String catatan = '',
    String? bukti,
    int? bayar,
  }) async {
    final j = await _api.post('/cloudgime/bookings', {
      'customer_name': nama,
      'customer_phone': telepon,
      'pc_name': pcNama,
      'booking_date': tanggal,
      'start_time': jamMulai,
      'duration_minutes': durasiMenit,
      'billing_mode': 'manual',
      'note': catatan,
      if ((bukti ?? '').isNotEmpty) 'payment_proof': bukti,
      if (bayar != null) 'expected_payment_amount': bayar,
    });
    _cache = null;
    _cacheAt = null;
    return CloudGimeBooking.fromJson(j);
  }

  Future<(String, String)?> bacaBookingTersimpan() async {
    try {
      final id = await _aman.read(key: _kId);
      final token = await _aman.read(key: _kToken);
      if (id == null || id.isEmpty || token == null || token.isEmpty) return null;
      return (id, token);
    } catch (_) {
      return null;
    }
  }

  Future<void> simpanBooking(String id, String token) async {
    try {
      await _aman.write(key: _kId, value: id);
      await _aman.write(key: _kToken, value: token);
    } catch (_) {}
  }

  Future<void> hapusBookingTersimpan() async {
    try {
      await _aman.delete(key: _kId);
      await _aman.delete(key: _kToken);
    } catch (_) {}
  }
}
