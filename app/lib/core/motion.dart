import 'pengaturan.dart';
import 'package:flutter/material.dart';

/// ============================================================
///  Gerak dan transisi halaman XyCloudStore
/// ============================================================
///  Kebijakan gerak 2026-09-20: PERPINDAHAN HALAMAN TIDAK MEMAKAI FADE.
///  Geser pendek, parallax tipis — dulu 360ms + mundur 24% terasa "aneh"
///  (halaman lama ikut lari terlalu jauh, ada celah kosong).
///    - xyRoute      : geser dari kanan, halaman lama diam (tanpa parallax).
///    - xyRouteBawah : geser vertikal untuk formulir/modal.
///    - xyRouteBesar : geser naik kecil, TANPA skala (skala 1.04 terasa melayang).
///  Konten masuk (stagger) memakai FadeInUp tanpa opacity:
///  hanya translate, lihat widgets/common.dart.

const Duration _durasi = Duration(milliseconds: 240);
const Duration _durasiBalik = Duration(milliseconds: 200);
const Offset _parallax = Offset.zero;

Route<T> xyRoute<T>(Widget page, {bool fullscreen = false}) {
  return PageRouteBuilder<T>(
    fullscreenDialog: fullscreen,
    transitionDuration: PengaturanLokal.animasi ? _durasi : Duration.zero,
    reverseTransitionDuration: PengaturanLokal.animasi ? _durasiBalik : Duration.zero,
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, masuk, keluar, child) => _geser(
      masuk: masuk,
      keluar: keluar,
      child: child,
      dari: const Offset(1, 0),
      parallax: _parallax,
    ),
  );
}

/// Transisi dari bawah (halaman formulir / modal). Geser penuh, tanpa fade.
Route<T> xyRouteBawah<T>(Widget page) {
  return PageRouteBuilder<T>(
    transitionDuration: PengaturanLokal.animasi ? _durasi : Duration.zero,
    reverseTransitionDuration: PengaturanLokal.animasi ? _durasiBalik : Duration.zero,
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, a, keluar, child) => _geser(
      masuk: a,
      keluar: keluar,
      child: child,
      dari: const Offset(0, 1),
      parallax: Offset.zero,
    ),
  );
}

/// Transisi alur besar (splash, onboarding, shell): geser naik tipis.
/// Tanpa scale supaya tidak terasa seperti zoom aneh.
Route<T> xyRouteBesar<T>(Widget page) {
  return PageRouteBuilder<T>(
    transitionDuration: PengaturanLokal.animasi ? const Duration(milliseconds: 280) : Duration.zero,
    reverseTransitionDuration: PengaturanLokal.animasi ? _durasiBalik : Duration.zero,
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, a, __, child) {
      final k = CurvedAnimation(parent: a, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
      return SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, .06), end: Offset.zero).animate(k),
        child: child,
      );
    },
  );
}

Widget _geser({
  required Animation<double> masuk,
  required Animation<double> keluar,
  required Widget child,
  required Offset dari,
  required Offset parallax,
}) {
  final a = CurvedAnimation(parent: masuk, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
  final t = CurvedAnimation(parent: keluar, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
  return SlideTransition(
    position: Tween<Offset>(begin: dari, end: Offset.zero).animate(a),
    child: SlideTransition(
      position: Tween<Offset>(begin: Offset.zero, end: parallax).animate(t),
      child: child,
    ),
  );
}

/// Dipakai ThemeData.pageTransitionsTheme supaya MaterialPageRoute
/// tidak memakai Cupertino (di Android terasa "aneh"/melayang).
class GeserPageTransitionsBuilder extends PageTransitionsBuilder {
  const GeserPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return _geser(
      masuk: animation,
      keluar: secondaryAnimation,
      child: child,
      dari: const Offset(1, 0),
      parallax: _parallax,
    );
  }
}

/// Pergantian isi tab bawah: geser mikro vertikal, tanpa fade, supaya
/// berpindah tab tidak berkedip dan tidak terasa seperti halaman baru.
class TukarHalus extends StatelessWidget {
  const TukarHalus({super.key, required this.child, this.kunci});
  final Widget child;
  final Key? kunci;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: PengaturanLokal.animasi ? const Duration(milliseconds: 160) : Duration.zero,
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (anak, a) => SlideTransition(
          position: Tween<Offset>(begin: const Offset(0, .01), end: Offset.zero).animate(a),
          child: anak,
        ),
        child: KeyedSubtree(key: kunci, child: child),
      );
}
