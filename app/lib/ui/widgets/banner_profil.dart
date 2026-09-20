import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import 'animasi_profil_epic.dart';

/// ============================================================
///  Banner header profil (Batch I)
/// ============================================================
///  Sumber tampilan, prioritas:
///  1. `media` — GIF/MP4→GIF kustom (khusus pelanggan Pro/VIP),
///  2. `tema`  — gradasi warna bawaan (XyBannerTema),
///  3. gradasi 'ungu' bila keduanya kosong.
///  Selalu diberi scrim gelap lembut di bagian bawah supaya teks
///  nama/email di atasnya tetap terbaca.
///
///  Gradasi bawaan (tanpa media kustom) bergeser pelan ~16 dtk —
///  hidup tanpa ramai. Media kustom sudah animasi sendiri.
class BannerProfil extends StatefulWidget {
  const BannerProfil({
    super.key,
    this.tema,
    this.media,
    this.bingkai,
    this.borderRadius,
    required this.child,
  });

  final String? tema;
  final BannerMedia? media;
  final String? bingkai;
  final BorderRadius? borderRadius;
  final Widget child;

  @override
  State<BannerProfil> createState() => _BannerProfilState();
}

class _BannerProfilState extends State<BannerProfil>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 16),
    );
    if (widget.media == null) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant BannerProfil old) {
    super.didUpdateWidget(old);
    if (widget.media == null && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (widget.media != null && _ctrl.isAnimating) {
      _ctrl.stop();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final radius = widget.borderRadius ?? BorderRadius.zero;
    final warna = XyBannerTema.warna(widget.tema);

    return ClipRRect(
      borderRadius: radius,
      child: Stack(fit: StackFit.passthrough, children: [
        Positioned.fill(
          child: widget.media != null
              ? CachedNetworkImage(
                  imageUrl: widget.media!.displayUrl,
                  fit: BoxFit.cover,
                  fadeInDuration: Duration.zero,
                  fadeOutDuration: Duration.zero,
                  imageBuilder: (context, imageProvider) => Image(
                    image: imageProvider,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    filterQuality: FilterQuality.medium,
                  ),
                  placeholder: (_, __) => DecoratedBox(
                      decoration: BoxDecoration(
                          gradient: LinearGradient(
                              colors: warna,
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight))),
                  errorWidget: (_, __, ___) {
                    if (widget.media!.webp != widget.media!.gif &&
                        widget.media!.gif.isNotEmpty) {
                      return CachedNetworkImage(
                        imageUrl: widget.media!.gif,
                        fit: BoxFit.cover,
                        fadeInDuration: Duration.zero,
                        fadeOutDuration: Duration.zero,
                        imageBuilder: (context, ip) => Image(
                            image: ip, fit: BoxFit.cover, gaplessPlayback: true),
                        placeholder: (_, __) => DecoratedBox(
                            decoration: BoxDecoration(
                                gradient: LinearGradient(
                                    colors: warna,
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight))),
                        errorWidget: (_, __, ___) =>
                            _GradasiBergerak(ctrl: _ctrl, warna: warna),
                      );
                    }
                    return _GradasiBergerak(ctrl: _ctrl, warna: warna);
                  },
                )
              : _GradasiBergerak(ctrl: _ctrl, warna: warna),
        ),
        if (widget.bingkai != null && widget.bingkai!.isNotEmpty)
          Positioned.fill(
            child: AnimasiProfilEpic(bingkai: widget.bingkai),
          ),
        Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(widget.media != null ? .30 : .10),
                    Colors.black.withOpacity(.02),
                    Colors.black.withOpacity(widget.media != null ? .48 : .22),
                  ],
                  stops: const [0, .45, 1],
                ),
              ),
            ),
          ),
        ),
        widget.child,
      ]),
    );
  }
}

class _GradasiBergerak extends StatelessWidget {
  const _GradasiBergerak({required this.ctrl, required this.warna});
  final Animation<double> ctrl;
  final List<Color> warna;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, __) {
        final t = Curves.easeInOut.transform(ctrl.value);
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: warna,
              begin: Alignment.lerp(Alignment.topLeft, Alignment.topRight, t)!,
              end: Alignment.lerp(Alignment.bottomRight, Alignment.bottomLeft, t)!,
            ),
          ),
        );
      },
    );
  }
}
