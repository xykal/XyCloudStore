import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../widgets/common.dart';

/// Layar setelah login baru terdeteksi (HP lain / IP baru / jeda lama).
/// Konfirmasi lewat tautan email — bukan kode 6 digit.
class LoginBaruScreen extends StatelessWidget {
  const LoginBaruScreen({super.key, required this.email, this.pesan});
  final String email;
  final String? pesan;

  @override
  Widget build(BuildContext context) {
    final pal = XyTheme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Konfirmasi perangkat')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 32),
        children: [
          Icon(Icons.mark_email_unread_rounded, size: 48, color: pal.accent),
          const SizedBox(height: 16),
          const Text(
            'Login dari perangkat baru',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -.4),
          ),
          const SizedBox(height: 10),
          Text(
            pesan ??
                'Kami kirim tautan konfirmasi ke $email. Buka email itu, ketuk “Ya, ini saya”, lalu kembali ke sini dan masuk dengan password.',
            style: TextStyle(color: pal.inkSoft, height: 1.55, fontSize: 14.5),
          ),
          const SizedBox(height: 10),
          Text(email, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 22),
          Text(
            'Reinstall cepat di HP yang sama cukup password. HP lain, IP baru, atau jeda lama perlu tautan ini — bukan kode OTP.',
            style: TextStyle(color: pal.muted, fontSize: 12.5, height: 1.5),
          ),
          const SizedBox(height: 28),
          GradientButton(
            label: 'Kembali ke masuk',
            icon: Icons.login_rounded,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}
