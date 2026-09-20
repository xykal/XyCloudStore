import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/format.dart';
import '../../core/motion.dart';
import '../../core/theme.dart';
import '../../data/api_client.dart';
import '../../data/cloudgime_service.dart';
import '../../providers/app_state.dart';
import '../widgets/common.dart';

const _webMitra = 'https://cloudgime.my.id';

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_svc != null) return;
    _svc = CloudGimeService(context.read<AppState>().api);
    _siapkan();
  }

  Future<void> _siapkan() async {
    final simpan = await _svc!.bacaBookingTersimpan();
    if (simpan != null && mounted) {
      _idC.text = simpan.$1;
      _tokenC.text = simpan.$2;
    }
    await _muat();
    if (simpan != null) await _cek(dariPoll: false);
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
    final uri = Uri.parse(_webMitra);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  void dispose() {
    _poll?.cancel();
    _idC.dispose();
    _tokenC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final pcs = _status?.pcs ?? [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('CloudGime', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -.4)),
        actions: [
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
              'PC fisik mitra — status dihitung server CloudGime, bukan tebakan aplikasi.',
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
            const SectionHeader('Status PC', sub: 'Diperbarui sekitar 20 detik', top: 18),
            if (pcs.isEmpty && !_pernahCoba)
              TeksMemuat(teks: 'Menyegarkan status PC…')
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
                    child: _KartuPc(pc: pc),
                  )),
            ],
            const SizedBox(height: 8),
            GradientButton(
              label: 'Pesan di CloudGime',
              icon: Icons.event_available_rounded,
              onPressed: _bukaWeb,
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
  const _KartuPc({required this.pc});
  final CloudGimePc pc;

  @override
  Widget build(BuildContext context) {
    final t = XyTheme.of(context);
    final (label, warna) = switch (pc.keadaan) {
      'dipakai' => ('Dipakai', XyTheme.warning),
      'tersedia' => ('Kosong', XyTheme.success),
      'maintenance' => ('Perawatan', XyTheme.violet),
      _ => ('Nonaktif', t.muted),
    };
    return XyCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
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
        const SizedBox(height: 12),
        Row(children: [
          Text(rupiah(pc.hargaPerJam),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: XyTheme.primary)),
          Text('  /jam', style: TextStyle(color: t.muted, fontSize: 12)),
          const Spacer(),
          if (pc.dipakai && pc.sisaMenit > 0)
            Text('Sisa ~${pc.sisaMenit} mnt',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: XyTheme.warning)),
        ]),
        if (pc.sedang?.selesai != null) ...[
          const SizedBox(height: 6),
          Text('Sampai ${tanggal(pc.sedang!.selesai!)}', style: TextStyle(color: t.muted, fontSize: 11.5)),
        ],
        if (pc.berikutnya?.mulai != null) ...[
          const SizedBox(height: 4),
          Text('Berikutnya ${tanggal(pc.berikutnya!.mulai!)}', style: TextStyle(color: t.inkSoft, fontSize: 11.5)),
        ],
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
            child: Text('Menunggu konfirmasi — dicek otomatis tiap 20 detik.',
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
            Text('Sewa PC fisik mitra · cek kosong/dipakai live',
                style: TextStyle(color: t.muted, fontSize: 12)),
          ]),
        ),
        Icon(Icons.chevron_right_rounded, color: t.muted),
      ]),
    );
  }
}
