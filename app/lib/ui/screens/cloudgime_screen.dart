import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/format.dart';
import '../../core/kompres.dart';
import '../../core/motion.dart';
import '../../core/theme.dart';
import '../../data/api_client.dart';
import '../../data/cloudgime_service.dart';
import '../../providers/app_state.dart';
import '../widgets/common.dart';
import '../widgets/galeri_picker.dart';

const _webMitra = 'https://cloudgime.my.id';
const _webBooking = 'https://cloudgime.my.id/booking/';

/// Layar status PC fisik mitra CloudGime + lacak booking milik pengguna.
class CloudGimeScreen extends StatefulWidget {
  const CloudGimeScreen({super.key});

  @override
  State<CloudGimeScreen> createState() => _CloudGimeScreenState();
}

class _CloudGimeScreenState extends State<CloudGimeScreen> {
  CloudGimeService? _svc;
  CloudGimeStatus? _status;
  String? _galat;
  bool _pernahCoba = false;

  final _idC = TextEditingController();
  final _tokenC = TextEditingController();
  CloudGimeBooking? _booking;
  String? _galatBooking;
  bool _cekBooking = false;
  Timer? _poll;
  Timer? _pollStatus;
  Timer? _detik;
  DateTime? _diterima;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_svc != null) return;
    _svc = CloudGimeService(context.read<AppState>().api);
    _siapkan();
  }

  Future<void> _siapkan() async {
    final lokal = await _svc!.bacaCacheLokal();
    if (lokal != null && mounted) {
      setState(() {
        _status = lokal;
        _pernahCoba = true;
      });
    }
    final simpan = await _svc!.bacaBookingTersimpan();
    if (simpan != null && mounted) {
      _idC.text = simpan.$1;
      _tokenC.text = simpan.$2;
    }
    await _muat();
    if (simpan != null) await _cek(dariPoll: false);
    _mulaiDetik();
    _mulaiPollStatus();
  }

  Future<void> _muat() async {
    final adaCache = _status != null;
    if (!adaCache) setState(() => _galat = null);
    try {
      final s = await _svc!.status(paksa: adaCache);
      if (!mounted) return;
      setState(() {
        _status = s;
        _galat = null;
        _pernahCoba = true;
        _diterima = DateTime.now();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _galat = e.pesan;
        _pernahCoba = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _galat = 'Tidak bisa menghubungi CloudGime.';
        _pernahCoba = true;
      });
    }
  }

  void _aturPoll(bool nyala) {
    _poll?.cancel();
    _poll = null;
    if (!nyala) return;
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _cek(dariPoll: true));
  }

  void _mulaiDetik() {
    _detik?.cancel();
    _detik = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _mulaiPollStatus() {
    _pollStatus?.cancel();
    _pollStatus = Timer.periodic(const Duration(seconds: 15), (_) => _muat());
  }

  DateTime _sekarangMitra() {
    final s = _status?.serverTime;
    if (s != null && _diterima != null) {
      return s.add(DateTime.now().difference(_diterima!));
    }
    return DateTime.now();
  }

  Future<void> _cek({bool dariPoll = false}) async {
    final id = _idC.text.trim();
    final token = _tokenC.text.trim();
    if (id.isEmpty || token.length < 4) {
      if (!dariPoll) {
        setState(() => _galatBooking = 'Isi ID booking dan token yang kamu terima saat memesan.');
      }
      return;
    }
    if (!dariPoll) setState(() { _cekBooking = true; _galatBooking = null; });
    try {
      final b = await _svc!.booking(id, token);
      await _svc!.simpanBooking(id, token);
      if (!mounted) return;
      setState(() {
        _booking = b;
        _galatBooking = null;
        _cekBooking = false;
      });
      _aturPoll(b.pending);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.status == 404) _booking = null;
        _galatBooking = e.status == 404 ? 'Booking tidak ditemukan. Cek ID dan token.' : e.pesan;
        _cekBooking = false;
      });
      _aturPoll(false);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _galatBooking = 'Gagal cek booking.';
        _cekBooking = false;
      });
    }
  }

  Future<void> _bukaWeb() async {
    await launchUrl(Uri.parse(_webMitra), mode: LaunchMode.externalApplication);
  }

  Future<void> _bukaPesan() async {
    final pcs = _status?.pcs ?? [];
    if (pcs.isEmpty) {
      await launchUrl(Uri.parse(_webBooking), mode: LaunchMode.externalApplication);
      return;
    }
    final hasil = await showModalBottomSheet<CloudGimeBooking>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SheetPesanCloudGime(
        pcs: pcs,
        svc: _svc!,
        namaAwal: context.read<AppState>().user?.nama ?? '',
      ),
    );
    if (!mounted || hasil == null) return;
    setState(() => _booking = hasil);
    if (hasil.id.isNotEmpty && hasil.token.length >= 4) {
      _idC.text = hasil.id;
      _tokenC.text = hasil.token;
      await _svc!.simpanBooking(hasil.id, hasil.token);
    } else if (hasil.id.isNotEmpty) {
      _idC.text = hasil.id;
    }
    await _muat();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _pollStatus?.cancel();
    _detik?.cancel();
    _idC.dispose();
    _tokenC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final pcs = _status?.pcs ?? [];
    final jadwal = _status?.jadwal ?? [];
    final now = _sekarangMitra();
    return Scaffold(
      appBar: AppBar(
        title: const Text('CloudGime', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -.4)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(jamWib(now, detik: true),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, letterSpacing: -.2)),
                Text('WIB mitra', style: TextStyle(color: t.muted, fontSize: 10, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Buka situs CloudGime',
            onPressed: _bukaWeb,
            icon: const Icon(Icons.open_in_new_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: XyTheme.primary,
        onRefresh: _muat,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Text(
              'PC fisik mitra. Jam di bawah selalu WIB. Booking dari aplikasi ini langsung masuk antrian web CloudGime — admin mitra yang menyetujui, lalu status di sini dan di web ikut berubah.',
              style: TextStyle(color: t.muted, fontSize: 12.5, height: 1.45),
            ),
            if (_status?.maintenance == true) ...[
              const SizedBox(height: 12),
              XyCard(
                color: XyTheme.warning.withOpacity(.12),
                child: const Text('CloudGime sedang perawatan. Pemesanan mungkin ditunda.',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ],
            const SectionHeader('Status PC', sub: 'Jam sisa dihitung live · status tiap 15 detik', top: 18),
            if (pcs.isEmpty && !_pernahCoba)
              const TeksMemuat(teks: 'Menyegarkan status PC…')
            else if (pcs.isEmpty)
              Kosong(
                icon: Icons.desktop_windows_outlined,
                judul: _galat == null ? 'Belum ada data PC' : 'Tidak bisa memuat status',
                sub: _galat ?? 'Tarik ke bawah untuk coba lagi.',
                ilustrasi: '',
                aksi: GradientButton(label: 'Coba lagi', onPressed: _muat, height: 44),
              )
            else ...[
              if (_galat != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(_galat!, style: TextStyle(color: t.muted, fontSize: 12)),
                ),
              ...pcs.map((pc) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _KartuPc(pc: pc, sekarang: now),
                  )),
            ],
            if (jadwal.isNotEmpty) ...[
              const SectionHeader('Yang booking', sub: 'Waktu kiri · nama · PC (WIB)', top: 18),
              ...jadwal.map((j) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _KartuJadwal(item: j, sekarang: now),
                  )),
            ],
            const SizedBox(height: 8),
            GradientButton(
              label: 'Pesan dari aplikasi',
              icon: Icons.event_available_rounded,
              onPressed: _bukaPesan,
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => launchUrl(Uri.parse(_webBooking), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Atau buka web CloudGime'),
            ),
            const SectionHeader('Booking saya', sub: 'ID + token tersimpan aman di perangkat', top: 22),
            XyCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const XyLabel('ID booking'),
                TextField(
                  controller: _idC,
                  decoration: const InputDecoration(hintText: 'contoh b_8f2a1c'),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 12),
                const XyLabel('Token'),
                TextField(
                  controller: _tokenC,
                  decoration: const InputDecoration(hintText: 'token dari bukti pemesanan'),
                  obscureText: true,
                ),
                const SizedBox(height: 14),
                GradientButton(
                  label: 'Cek status',
                  loading: _cekBooking,
                  height: 46,
                  onPressed: _cekBooking ? null : () => _cek(),
                ),
                if (_galatBooking != null) ...[
                  const SizedBox(height: 10),
                  Text(_galatBooking!, style: const TextStyle(color: XyTheme.danger, fontSize: 12.5)),
                ],
              ]),
            ),
            if (_booking != null) ...[
              const SizedBox(height: 12),
              _KartuBooking(
                booking: _booking!,
                onHapus: () async {
                  await _svc?.hapusBookingTersimpan();
                  _aturPoll(false);
                  setState(() {
                    _booking = null;
                    _idC.clear();
                    _tokenC.clear();
                  });
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _KartuPc extends StatelessWidget {
  const _KartuPc({required this.pc, required this.sekarang});
  final CloudGimePc pc;
  final DateTime sekarang;

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final (label, warna) = switch (pc.keadaan) {
      'dipakai' => ('Dipakai', XyTheme.warning),
      'tersedia' => ('Kosong', XyTheme.success),
      'maintenance' => ('Perawatan', XyTheme.violet),
      _ => ('Nonaktif', t.muted),
    };
    final sisaLive = pc.sedang?.selesai == null ? null : pc.sedang!.selesai!.difference(sekarang);
    final progres = _progresSlot(pc.sedang, sekarang);
    return XyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 4,
            height: 46,
            decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(4)),
          ),
          const SizedBox(width: 10),
          GradientThumb(seed: pc.id, icon: Icons.desktop_windows_rounded, size: 46),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(pc.nama, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, letterSpacing: -.3)),
              if (pc.spek.isNotEmpty)
                Text(pc.spek, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: t.muted, fontSize: 12, height: 1.35)),
            ]),
          ),
          Pill(label, warna: warna, solid: true),
        ]),
        if (pc.sedang != null) ...[
          const SizedBox(height: 12),
          Text(pc.sedang!.nama?.trim().isNotEmpty == true ? pc.sedang!.nama! : 'Sedang dipakai',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 2),
          Text('${_rentangWib(pc.sedang!)} WIB',
              style: TextStyle(color: t.inkSoft, fontSize: 13, fontWeight: FontWeight.w600)),
          if (sisaLive != null && !sisaLive.isNegative) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: progres,
                minHeight: 6,
                backgroundColor: t.lineSoft,
                color: warna,
              ),
            ),
            const SizedBox(height: 6),
            Text('Sisa ${_labelSisa(sisaLive)}',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: warna)),
          ],
        ],
        if (pc.berikutnya != null) ...[
          const SizedBox(height: 8),
          Text(
            'Berikutnya ${_rentangWib(pc.berikutnya!)} · ${pc.berikutnya!.nama ?? 'pemesan'}',
            style: TextStyle(color: t.muted, fontSize: 12),
          ),
        ],
        const SizedBox(height: 10),
        Row(children: [
          Text(rupiah(pc.hargaPerJam),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: XyTheme.primary)),
          Text('  /jam', style: TextStyle(color: t.muted, fontSize: 12)),
          const Spacer(),
          if (pc.tersedia)
            Text('Siap dipesan', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
      ]),
    );
  }
}

String _labelSisa(Duration d) {
  if (d.isNegative) return 'Selesai';
  final h = d.inHours;
  final m = d.inMinutes % 60;
  final s = d.inSeconds % 60;
  if (h > 0) return '${h}j ${m}m ${s.toString().padLeft(2, '0')}d';
  if (m > 0) return '${m}m ${s}d';
  return '${s}d';
}

String _rentangWib(CloudGimeSlot s) {
  final a = s.mulai == null ? '—' : jamWib(s.mulai!);
  final b = s.selesai == null ? '—' : jamWib(s.selesai!);
  return '$a–$b';
}

double _progresSlot(CloudGimeSlot? s, DateTime now) {
  if (s?.mulai == null || s?.selesai == null) return 0;
  final total = s!.selesai!.difference(s.mulai!).inSeconds;
  if (total <= 0) return 1;
  return (now.difference(s.mulai!).inSeconds / total).clamp(0.0, 1.0);
}

class _KartuJadwal extends StatelessWidget {
  const _KartuJadwal({required this.item, required this.sekarang});
  final CloudGimeJadwal item;
  final DateTime sekarang;

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final pending = item.status == 'pending' || item.status == 'waiting';
    final hidup = item.mulai != null &&
        item.selesai != null &&
        !sekarang.isBefore(item.mulai!) &&
        sekarang.isBefore(item.selesai!);
    return XyCard(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 52,
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(item.mulai == null ? '—' : jamWib(item.mulai!),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, letterSpacing: -.3)),
            const SizedBox(height: 2),
            Text(item.selesai == null ? '—' : jamWib(item.selesai!),
                style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
        const SizedBox(width: 10),
        Container(
          width: 3,
          height: 42,
          decoration: BoxDecoration(
            color: hidup ? XyTheme.warning : (pending ? t.line : XyTheme.success),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.nama.isEmpty ? 'Pemesan' : item.nama,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text('${item.pc} · WIB', style: TextStyle(color: t.muted, fontSize: 12, height: 1.35)),
          ]),
        ),
        Pill(
          hidup ? 'Main' : (pending ? 'Menunggu' : 'Disetujui'),
          warna: hidup ? XyTheme.warning : (pending ? XyTheme.warning : XyTheme.success),
          solid: true,
        ),
      ]),
    );
  }
}

class _KartuBooking extends StatelessWidget {
  const _KartuBooking({required this.booking, required this.onHapus});
  final CloudGimeBooking booking;
  final VoidCallback onHapus;

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final label = switch (booking.status) {
      'pending' => 'Menunggu',
      'approved' => 'Disetujui',
      'ongoing' => 'Berjalan',
      'done' => 'Selesai',
      'cancelled' => 'Dibatalkan',
      'rejected' => 'Ditolak',
      'expired' => 'Kedaluwarsa',
      _ => booking.status,
    };
    return XyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(booking.pcNama.isEmpty ? 'Booking ${booking.id}' : booking.pcNama,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          ),
          Pill(label, warna: booking.pending ? XyTheme.warning : XyTheme.success, solid: true),
        ]),
        const SizedBox(height: 8),
        if (booking.mulai != null)
          Text('${tanggal(booking.mulai!)}${booking.selesai != null ? ' → ${jam(booking.selesai!)}' : ''}',
              style: TextStyle(color: t.inkSoft, fontSize: 12.5)),
        if (booking.bayar > 0) ...[
          const SizedBox(height: 4),
          Text('${rupiah(booking.bayar)} · ${booking.durasiMenit} menit',
              style: TextStyle(color: t.muted, fontSize: 12)),
        ],
        if (booking.paymentStatus.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Pembayaran: ${booking.paymentStatus}', style: TextStyle(color: t.muted, fontSize: 12)),
        ],
        if (booking.pending)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Menunggu konfirmasi admin CloudGime. Booking ini tampil di web mereka.',
                style: TextStyle(color: t.muted, fontSize: 11.5)),
          ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(onPressed: onHapus, child: const Text('Hapus dari perangkat')),
        ),
      ]),
    );
  }
}

/// Formulir pesan PC — POST ke CloudGime lewat Worker, jadi muncul di web mitra.
class _SheetPesanCloudGime extends StatefulWidget {
  const _SheetPesanCloudGime({
    required this.pcs,
    required this.svc,
    required this.namaAwal,
  });
  final List<CloudGimePc> pcs;
  final CloudGimeService svc;
  final String namaAwal;

  @override
  State<_SheetPesanCloudGime> createState() => _SheetPesanCloudGimeState();
}

class _SheetPesanCloudGimeState extends State<_SheetPesanCloudGime> {
  late final TextEditingController _nama;
  late final TextEditingController _telp;
  late final TextEditingController _catatan;
  late String _pc;
  late DateTime _tanggal;
  String _jam = '15:00';
  int _durasi = 60;
  String? _bukti;
  String? _galat;
  bool _kirim = false;

  static const _durasiPilihan = [60, 120, 180, 360];

  @override
  void initState() {
    super.initState();
    _nama = TextEditingController(text: widget.namaAwal);
    _telp = TextEditingController();
    _catatan = TextEditingController();
    _pc = widget.pcs.first.nama;
    final now = DateTime.now();
    _tanggal = DateTime(now.year, now.month, now.day);
    final n = now.hour + 1;
    _jam = '${n.clamp(7, 22).toString().padLeft(2, '0')}:00';
  }

  @override
  void dispose() {
    _nama.dispose();
    _telp.dispose();
    _catatan.dispose();
    super.dispose();
  }

  CloudGimePc get _pcObj =>
      widget.pcs.firstWhere((p) => p.nama == _pc, orElse: () => widget.pcs.first);

  int get _perkiraan => ((_durasi / 60) * _pcObj.hargaPerJam).round();

  String get _tglIso {
    final y = _tanggal.year.toString().padLeft(4, '0');
    final m = _tanggal.month.toString().padLeft(2, '0');
    final d = _tanggal.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<void> _pilihBukti() async {
    final f = await GaleriPicker.pilihGambar(context, judul: 'Bukti transfer QRIS');
    if (f == null) return;
    final bytes = await f.readAsBytes();
    final nama = f.uri.pathSegments.isNotEmpty ? f.uri.pathSegments.last : 'bukti.jpg';
    final uri = await Kompres.dataUri(bytes, nama, maxSisi: 1280, kualitas: 78);
    if (mounted) setState(() => _bukti = uri);
  }

  Future<void> _kirimPesanan() async {
    final nama = _nama.text.trim();
    final telp = _telp.text.replaceAll(RegExp(r'[^\d+]'), '');
    if (nama.length < 2 || telp.length < 8) {
      setState(() => _galat = 'Isi nama dan nomor WhatsApp.');
      return;
    }
    setState(() { _kirim = true; _galat = null; });
    try {
      final b = await widget.svc.pesan(
        nama: nama,
        telepon: telp,
        pcNama: _pc,
        tanggal: _tglIso,
        jamMulai: _jam,
        durasiMenit: _durasi,
        catatan: _catatan.text.trim(),
        bukti: _bukti,
        bayar: _perkiraan,
      );
      if (!mounted) return;
      Navigator.pop(context, b);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _kirim = false;
        _galat = e.pesan;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _kirim = false;
        _galat = 'Gagal mengirim booking.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final padBawah = MediaQuery.of(context).viewInsets.bottom;
    final jamPilihan = [for (var h = 7; h <= 22; h++) '${h.toString().padLeft(2, '0')}:00'];
    final hari = [
      DateTime.now(),
      DateTime.now().add(const Duration(days: 1)),
      DateTime.now().add(const Duration(days: 2)),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? const XyTheme.cardDark
            : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 14, 20, 16 + padBawah),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: t.line, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 14),
          const Text('Pesan CloudGime', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('Pengajuan masuk ke web CloudGime. Admin mitra yang menyetujui.',
              style: TextStyle(color: t.muted, fontSize: 12.5, height: 1.4)),
          const SizedBox(height: 14),
          const XyLabel('PC'),
          DropdownButtonFormField<String>(
            value: _pc,
            items: widget.pcs
                .map((p) => DropdownMenuItem(value: p.nama, child: Text(p.nama)))
                .toList(),
            onChanged: _kirim ? null : (v) { if (v != null) setState(() => _pc = v); },
          ),
          const SizedBox(height: 12),
          const XyLabel('Tanggal'),
          Wrap(spacing: 8, children: [
            for (final d in hari)
              ChoiceChip(
                label: Text('${d.day}/${d.month}'),
                selected: _tanggal.day == d.day && _tanggal.month == d.month,
                onSelected: _kirim ? null : (_) => setState(() => _tanggal = DateTime(d.year, d.month, d.day)),
              ),
          ]),
          const SizedBox(height: 12),
          const XyLabel('Jam mulai (WIB)'),
          DropdownButtonFormField<String>(
            value: jamPilihan.contains(_jam) ? _jam : jamPilihan.first,
            items: jamPilihan.map((j) => DropdownMenuItem(value: j, child: Text(j))).toList(),
            onChanged: _kirim ? null : (v) { if (v != null) setState(() => _jam = v); },
          ),
          const SizedBox(height: 12),
          const XyLabel('Durasi'),
          Wrap(spacing: 8, children: [
            for (final m in _durasiPilihan)
              ChoiceChip(
                label: Text(m >= 60 ? '${m ~/ 60} jam' : '$m mnt'),
                selected: _durasi == m,
                onSelected: _kirim ? null : (_) => setState(() => _durasi = m),
              ),
          ]),
          const SizedBox(height: 12),
          const XyLabel('Nama'),
          TextField(controller: _nama, enabled: !_kirim, textCapitalization: TextCapitalization.words),
          const SizedBox(height: 12),
          const XyLabel('WhatsApp'),
          TextField(
            controller: _telp,
            enabled: !_kirim,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(hintText: '08xxxxxxxxxx'),
          ),
          const SizedBox(height: 12),
          const XyLabel('Catatan (opsional)'),
          TextField(controller: _catatan, enabled: !_kirim, maxLines: 2),
          const SizedBox(height: 12),
          Text('Perkiraan ${rupiah(_perkiraan)} · unggah bukti QRIS bila diminta mitra.',
              style: TextStyle(color: t.muted, fontSize: 12)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _kirim ? null : _pilihBukti,
            icon: Icon(_bukti == null ? Icons.image_outlined : Icons.check_rounded, size: 18),
            label: Text(_bukti == null ? 'Unggah bukti transfer' : 'Bukti sudah dipilih'),
          ),
          if (_galat != null) ...[
            const SizedBox(height: 10),
            Text(_galat!, style: const TextStyle(color: XyTheme.danger, fontSize: 12.5)),
          ],
          const SizedBox(height: 16),
          GradientButton(
            label: _kirim ? 'Mengirim…' : 'Kirim pengajuan',
            height: 48,
            onPressed: _kirim ? null : _kirimPesanan,
          ),
        ]),
      ),
    );
  }
}

/// Kartu ringkas untuk Home / Sewa PC.
class KartuCloudGimeHome extends StatelessWidget {
  const KartuCloudGimeHome({super.key});

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    return XyCard(
      onTap: () => Navigator.push(context, xyRoute(const CloudGimeScreen())),
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: t.primarySoft, borderRadius: BorderRadius.circular(14)),
          child: const Icon(Icons.desktop_windows_rounded, color: XyTheme.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CloudGime', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text('Sewa PC fisik mitra · jam WIB realtime',
                style: TextStyle(color: t.muted, fontSize: 12)),
          ]),
        ),
        Icon(Icons.chevron_right_rounded, color: t.muted),
      ]),
    );
  }
}
