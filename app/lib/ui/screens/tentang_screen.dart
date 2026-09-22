import 'cs_screen.dart';
import 'legal_screen.dart';
import 'pembaruan_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import '../../core/motion.dart';
import '../../core/theme.dart';
import '../../providers/app_state.dart';
import '../widgets/common.dart';

/// ============================================================
///  Tentang aplikasi: versi, legal, lisensi, dan kontak
/// ============================================================
class TentangScreen extends StatefulWidget {
  const TentangScreen({super.key});

  @override
  State<TentangScreen> createState() => _TentangScreenState();
}

class _TentangScreenState extends State<TentangScreen> {
  String versi = '-';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((p) {
      if (mounted) setState(() => versi = '${p.version} (build ${p.buildNumber})');
    }).catchError((_) => null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tentang Aplikasi')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 34),
        children: [
          // ---- identitas ----
          Center(
            child: Column(children: [
              // XyWordmark sudah lockup lengkap (ikon + teks); XyLogo di
              // atasnya membuat ikon tampil dua kali.
              const XyWordmark(tinggi: 46),
              const SizedBox(height: 10),
              Text('Versi $versi',
                  style:  TextStyle(color: XyTheme.of(context).muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
               Text('Sewa PC Cloud dan Akun Digital',
                  style: TextStyle(color: XyTheme.of(context).muted, fontSize: 12.5)),
            ]),
          ),

          ListTile(leading:const Icon(Icons.code_rounded),title:const Text('Source & lisensi streaming'),subtitle:const Text('XyCloudStore memakai engine Moonlight GPLv3'),onTap:()=>launchUrl(Uri.parse('https://github.com/xykalnotkel/XyCloudStore-build/releases'),mode:LaunchMode.externalApplication)),
          // Batch K: jalur pembaruan kanonik — tabel rilis di server + unduh
          // APK langsung dari aplikasi (menggantikan tautan GitHub Batch J).
          XyBarisMenu(
            ikon: Icons.system_update_alt_rounded,
            judul: 'Periksa pembaruan aplikasi',
            sub: 'Unduh APK terbaru langsung dari server resmi',
            onTap: () =>
                Navigator.push(context, xyRoute(const PembaruanScreen())),
          ),
          const SectionHeader('Legal'),
          XyBarisMenu(
            ikon: Icons.description_outlined,
            judul: 'Syarat dan Ketentuan',
            sub: 'Aturan pemakaian layanan',
            onTap: () => Navigator.push(context, xyRoute(const LegalScreen(jenis: 'syarat'))),
          ),
          XyBarisMenu(
            ikon: Icons.privacy_tip_outlined,
            judul: 'Kebijakan Privasi',
            sub: 'Data apa yang kami simpan dan untuk apa',
            onTap: () => Navigator.push(context, xyRoute(const LegalScreen(jenis: 'privasi'))),
          ),
          XyBarisMenu(
            ikon: Icons.currency_exchange_rounded,
            judul: 'Kebijakan Pengembalian Dana',
            sub: 'Refund sewa PC, akun digital, dan saldo',
            onTap: () => Navigator.push(context, xyRoute(const LegalScreen(jenis: 'refund'))),
          ),
          XyBarisMenu(
            ikon: Icons.workspace_premium_outlined,
            judul: 'Lisensi Pihak Ketiga',
            sub: 'Perangkat lunak sumber terbuka yang kami pakai',
            onTap: () => Navigator.push(context, xyRoute(const LisensiScreen())),
          ),

          const SectionHeader('Bantuan'),
          XyBarisMenu(
            ikon: Icons.forum_outlined,
            judul: 'Chat Admin',
            sub: 'Tanya langsung lewat aplikasi, dijawab tim CS',
            onTap: () => Navigator.push(context, xyRoute(const CsScreen())),
          ),

          const SectionHeader('Pengembang'),
          XyCard(
            child: Column(children: [
              Image.asset(
                XyTheme.of(context).dark
                    ? 'assets/brand/xyverse_wordmark_putih.png'
                    : 'assets/brand/xyverse_wordmark.png',
                height: 48,
              ),
              const SizedBox(height: 14),
               Text(
                'XyCloudStore dikembangkan oleh XyVerse, studio kecil asal Indonesia yang membangun '
                'produk digital untuk pemain dan kreator. Built-in XyVerse — Powered by XyVerse.',
                textAlign: TextAlign.center,
                style: TextStyle(color: XyTheme.of(context).muted, fontSize: 12.8, height: 1.65),
              ),
              SizedBox(height: 10),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: XyTheme.of(context).primarySoft,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: XyTheme.of(context).line),
                ),
                child: Text('Built-in XyVerse • Made in XyVerse By Kall',
                    style: TextStyle(color: XyTheme.primary, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: .6)),
              ),
            ]),
          ),
          const SizedBox(height: 18),
          const SectionHeader('JUGA DARI XYVERSE'),
          XyCard(
            padding: EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Ekosistem XyVerse — dari XyVerse, untuk kreator Indonesia',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              SizedBox(height: 12),
              _EcosystemItem(
                icon: Icons.cloud_rounded,
                nama: 'XyCloudStore',
                deskripsi: 'Sewa PC Cloud, Akun Digital, CS Realtime',
                badge: 'Kamu di sini',
              ),
              _EcosystemItem(
                icon: Icons.support_agent_rounded,
                nama: 'XyDesk',
                deskripsi: 'Helpdesk & ticketing untuk tim CS',
              ),
              _EcosystemItem(
                icon: Icons.web_rounded,
                nama: 'XyVerse Web',
                deskripsi: 'Portal utama xycloud.my.id & landing',
              ),
              _EcosystemItem(
                icon: Icons.auto_awesome_rounded,
                nama: 'XyStudio AI',
                deskripsi: 'Generator bingkai, stiker, moderasi Groq',
              ),
              SizedBox(height: 8),
              Text('Semua aplikasi XyVerse saling terhubung via Cloudflare Workers + D1. Logo resmi: filebin.net/xyverse-logo-pack-9f3k2',
                  style: TextStyle(color: XyTheme.of(context).muted, fontSize: 10.5, height: 1.5)),
            ]),
          ),
          const SizedBox(height: 22),
          Center(
            child: Column(children:  [
              Text('Dibuat dengan sepenuh hati di Indonesia',
                  style: TextStyle(color: XyTheme.of(context).muted, fontSize: 11)),
              SizedBox(height: 4),
              Text('© 2026 XyCloudStore by XyVerse — Built-in XyVerse', style: TextStyle(color: XyTheme.of(context).muted, fontSize: 11)),
            ]),
          ),
        ],
      ),
    );
  }
}

class _EcosystemItem extends StatelessWidget {
  const _EcosystemItem({required this.icon, required this.nama, required this.deskripsi, this.badge});
  final IconData icon;
  final String nama;
  final String deskripsi;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: XyTheme.of(context).primarySoft, borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 18, color: XyTheme.primary),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(nama, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
              if (badge != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: XyTheme.primary, borderRadius: BorderRadius.circular(99)),
                  child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 8.5, fontWeight: FontWeight.w800)),
                ),
              ],
            ]),
            const SizedBox(height: 1),
            Text(deskripsi, style: TextStyle(color: XyTheme.of(context).muted, fontSize: 11)),
          ]),
        ),
      ]),
    );
  }
}

/// Daftar lisensi: ringkasan dari server plus daftar resmi bawaan Flutter.
class LisensiScreen extends StatefulWidget {
  const LisensiScreen({super.key});

  @override
  State<LisensiScreen> createState() => _LisensiScreenState();
}

class _LisensiScreenState extends State<LisensiScreen> {
  List<dynamic>? lisensi;

  @override
  void initState() {
    super.initState();
    context
        .read<AppState>()
        .dokumenLegal('syarat')
        .then((d) => mounted ? setState(() => lisensi = d['lisensi'] as List?) : null)
        .catchError((_) => null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lisensi Pihak Ketiga')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 34),
        children: [
           Text(
            'XyCloudStore dibangun memakai perangkat lunak sumber terbuka berikut. '
            'Terima kasih kepada seluruh pembuatnya.',
            style: TextStyle(color: XyTheme.of(context).muted, fontSize: 13, height: 1.6),
          ),
          const SizedBox(height: 18),
          if (lisensi == null)
            const TeksMemuat(teks: 'Menyiapkan daftar lisensi…')
          else
            ...lisensi!.map((l) {
              final m = l as Map;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: XyCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${m['nama']}',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                        const SizedBox(height: 3),
                        Text('${m['pembuat']}',
                            style:  TextStyle(color: XyTheme.of(context).muted, fontSize: 11.5)),
                      ]),
                    ),
                    Pill('${m['lisensi']}', warna: XyTheme.violet),
                  ]),
                ),
              );
            }),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => showLicensePage(
              context: context,
              applicationName: 'XyCloudStore',
              applicationVersion: 'Sewa PC Cloud dan Akun Digital',
              applicationLegalese: '© 2026 XyCloudStore',
            ),
            icon: const Icon(Icons.article_outlined, size: 18),
            label: const Text('Lihat teks lisensi lengkap'),
          ),
        ],
      ),
    );
  }
}
