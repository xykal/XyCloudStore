/**
 * Penangan endpoint admin/* — dipindah dari src/index.js (P0 rapih/semua).
 *
 * Helper bersama (json, err, auth, uid, …) tetap didefinisikan di index.js
 * dan diimpor kembali ke sini. Impor sirkular ini aman: semua helper hanya
 * dipakai di dalam fungsi saat runtime, bukan saat modul dimuat.
 * Rencana lanjutan: pindahkan helper murni ke src/bantuan.js.
 */
import { adminSecurity, ownerProtected } from '../admin_security.js';
import { SecurityError, securityConfig, securityHash, securitySlot, auditSecurity, requireRate, deviceFromRequest, linkDevice, beforeRegistration, translateRegistrationError, assertAccountEnabled, otpAllowed, otpDigest, newOAuthState, consumeOAuthState, saveSecurityConfig } from '../security.js';
import { estimasiSewa, buatSewa, mulaiSewa, bacaSewa, antreAkhir, konfirmasiAgen, tutupSewa, rawatSewa, normalisasiHostStream, isPrivateIp, probePortTcp} from '../sewa.js';
import { KontenError, daftarPromosi, simpanPromosi, ambilKunciGiphy, simpanKunciGiphy, cariGiphy, terimaStiker, bacaStiker } from '../engagement.js';
import {
  periksaKontenPublik, statusModerasiAi, verifikasiOpenRouter, bersihkanModerasiAi,
} from '../ai-moderasi.js';
import {
  konfigurasiLivestream, buatInputLivestream, credentialInputLivestream,
  setInputLivestream, hapusInputLivestream, statusInputLivestream, bentukLivestreamPublik,
  responsHalamanLivestream,
} from '../livestream.js';
import { kataTerlarangDalam, KATA_TERLARANG } from '../kata.js';
import { infoRilis, unduhApk, tebakAbi, simpanRilis } from '../rilis.js';
import LOGO_PNG from '../brand-logo.png';
import LOGO_FULL_PNG from '../brand-logo-full.png';
import { kirimEmail } from '../mail.js';
import { kirimPush, kirimPushBanyak, siarkanPush } from '../push.js';
import { unggahGambar, unggahAudio, unggahVideoBanner, unggahVideoKeAnimasi, imporFotoSosial, samarkanGambar, samarkanKMedia, samarkanBannerMedia, layaniGambar, layaniMedia } from '../upload.js';
import { penyediaBayar, metodeTersedia, infoKonfigurasiPembayaran, buatTagihan, bacaPemberitahuan, cekStatusPenyedia, batalkanTagihan } from '../bayar.js';
import { setelan, setelanCepat, simpanSetelan, jalankanPemeliharaan, statistikLengkap, catatLog, pantauKesehatan } from '../sistem.js';
import { TIER, diskonTier, segarkanTier, cekVoucher, pakaiVoucher, pakaiVoucherStrict, buatCadangan } from '../loyal.js';
import { SKEMA_APLIKASI, providerSiap, urlMulai, ambilProfil, halamanKembali, verifikasiIdTokenGoogle, diagnostikFacebook, verifikasiSignedRequestFacebook } from '../oauth.js';
import { CAKUPAN_PEMELIHARAAN, HAK_PERAN, antreAkhirLivestream, auth, barisLivestream, bolehAkses, bolehLanjut, buatNotif, catatAdmin, daftarBebasPemeliharaan, err, halamanPemeliharaan, jalankanTerbatas, json, kenaliAdmin, kirimBanner, kunciSetelanSensitif, markerKunciAdmin, periksaDanSinkronTopup, previewKunciAdmin, push, rawatLivestream, rekonsiliasiPembayaran, securityHeaders, setujuiTopupOtomatis, sign, topupGateway, uid, verify } from '../index.js';

export async function tanganiAdmin(req, env, ctx, p, ip) {
  const url = new URL(req.url);
    const admin = await kenaliAdmin(req, env);
    if (!admin) {
      if (!(await bolehLanjut(env, `admin-auth-gagal:${ip}`, 12, 900))) {
        return err('Terlalu banyak percobaan akses admin. Coba lagi nanti.', 429, env);
      }
      return err('Forbidden', 403, env);
    }
    const adminRateId = admin.id || 'pemilik';
    if (!(await bolehLanjut(env, `admin:${adminRateId}:${ip}`, 300, 60))) {
      return err('Terlalu banyak permintaan admin.', 429, env);
    }

    const jalurAdmin = p.slice(6);
    if (!bolehAkses(admin.peran, jalurAdmin)) {
      return err(`Peran ${admin.peran} tidak punya akses ke bagian ini`, 403, env);
    }
    if (req.method !== 'GET') {
      ctx.waitUntil(catatAdmin(env, admin, `${req.method} ${jalurAdmin}`, null));
    }
    const a = jalurAdmin;

    if (a === 'ws-ticket' && req.method === 'POST') {
      if (!['pemilik', 'cs'].includes(admin.peran)) return err('Akses realtime ditolak', 403, env);
      const b = await req.json().catch(() => ({}));
      const roomTiket = String(b.room || 'cs:inbox');
      if (roomTiket !== 'cs:inbox') return err('Room admin tidak diizinkan', 403, env);
      const token = await sign({
        v: 2,
        sub: 'admin-ws',
        typ: 'admin-ws',
        room: roomTiket,
        nama: String(admin.nama || 'Admin').slice(0, 80),
        peran: admin.peran,
        exp: Date.now() + 60_000,
      }, env.JWT_SECRET);
      return json({ ticket: token, room: roomTiket, expires_in: 60 }, 201, env);
    }

    if (a === 'moderasi/ai' && req.method === 'GET') {
      const info = await statusModerasiAi(env);
      const statistik = await env.DB.prepare(
        `SELECT COUNT(*) total_30d,
                SUM(CASE WHEN datetime(waktu)>=datetime('now','-24 hours') THEN 1 ELSE 0 END) total_24h,
                SUM(CASE WHEN verdict='block' THEN 1 ELSE 0 END) diblokir,
                SUM(CASE WHEN verdict='review' THEN 1 ELSE 0 END) ditinjau,
                SUM(CASE WHEN verdict='error' THEN 1 ELSE 0 END) galat,
                SUM(CASE WHEN cached=1 THEN 1 ELSE 0 END) cache_hit,
                ROUND(AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END)) rata_latency_ms,
                COALESCE(SUM(prompt_tokens),0) prompt_tokens,
                COALESCE(SUM(completion_tokens),0) completion_tokens
         FROM ai_moderation_event WHERE datetime(waktu)>=datetime('now','-30 days')`,
      ).first();
      const { results } = await env.DB.prepare(
        `SELECT e.id,e.user_id,e.konteks,e.mode,e.sumber,e.verdict,e.kategori,e.severity,
                e.confidence,e.latency_ms,e.cached,e.prompt_tokens,e.completion_tokens,
                e.error_code,e.model,e.waktu,u.nama user_nama
         FROM ai_moderation_event e LEFT JOIN users u ON u.id=e.user_id
         ORDER BY e.waktu DESC LIMIT 100`,
      ).all();
      return json({
        ...info,
        boleh_mengubah: admin.peran === 'pemilik',
        statistik: statistik || {},
        event: results || [],
      }, 200, env);
    }
    if (a === 'moderasi/ai/mode' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh mengubah mode AI.', 403, env);
      const b = await req.json().catch(() => ({}));
      const mode = String(b.mode || '').toLowerCase();
      if (!['off', 'shadow', 'enforce'].includes(mode)) return err('Mode AI tidak valid.', 400, env);
      if (mode !== 'off') {
        const ai = await statusModerasiAi(env);
        if (!ai.provider_ready) {
          return err(ai.provider === 'groq'
            ? 'GROQ_API_KEY belum siap atau Zero Data Retention belum dikonfirmasi.'
            : 'OPENROUTER_API_KEY belum dipasang sebagai Worker Secret.', 409, env);
        }
      }
      await simpanSetelan(env, 'ai_moderation_mode', mode);
      return json({ ok: true, mode }, 200, env);
    }
    if (a === 'moderasi/ai/verifikasi' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh memverifikasi AI.', 403, env);
      if (!(await bolehLanjut(env, `ai-verify:${admin.id || 'owner'}`, 5, 3600))) {
        return err('Terlalu banyak verifikasi AI. Coba lagi nanti.', 429, env);
      }
      const hasil = await verifikasiOpenRouter(env);
      return json(hasil, hasil.ok ? 200 : 503, env);
    }

    // ---- XyCloud Live: approval, operasi, ledger, payout, dan rollout ----
    if (a === 'livestream' && req.method === 'GET') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const [cfg, profiles, lives, payouts, tips, finance, pushStats, pushRows, cleanupStats, cleanupRows] = await Promise.all([
        konfigurasiLivestream(env),
        env.DB.prepare(
          `SELECT c.*,u.nama user_nama,u.email user_email,u.foto user_foto
           FROM creator_profile c JOIN users u ON u.id=c.user_id
           ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,c.applied_at DESC LIMIT 200`,
        ).all(),
        env.DB.prepare(
          `SELECT l.*,u.email creator_email,a.nama agen_nama,
                  (SELECT COUNT(DISTINCT v.viewer_id) FROM livestream_view v WHERE v.livestream_id=l.id AND datetime(v.last_seen)>=datetime('now','-45 seconds')) viewers
           FROM livestream l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN agen a ON a.id=l.agen_id
           ORDER BY l.created_at DESC LIMIT 200`,
        ).all(),
        env.DB.prepare(
          `SELECT p.*,u.nama user_nama,u.email user_email FROM creator_payout p
           LEFT JOIN users u ON u.id=p.user_id ORDER BY p.requested_at DESC LIMIT 200`,
        ).all(),
        env.DB.prepare(
          `SELECT t.id,t.livestream_id,t.gross,t.platform_fee,t.creator_net,t.status,t.created_at,t.reversed_at,t.reverse_reason,
                  vu.nama viewer_name,cu.nama creator_name,e.status earning_status
           FROM livestream_tip t LEFT JOIN users vu ON vu.id=t.viewer_id LEFT JOIN users cu ON cu.id=t.creator_id
           LEFT JOIN creator_earning e ON e.tip_id=t.id ORDER BY t.created_at DESC LIMIT 200`,
        ).all(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(gross),0) gross,COALESCE(SUM(platform_fee),0) platform_fee,
                  COALESCE(SUM(net),0) creator_net,
                  COALESCE(SUM(CASE WHEN status='held' THEN net ELSE 0 END),0) held,
                  COALESCE(SUM(CASE WHEN status='available' THEN net ELSE 0 END),0) available,
                  COALESCE(SUM(CASE WHEN status='reserved' THEN net ELSE 0 END),0) reserved,
                  COALESCE(SUM(CASE WHEN status='paid' THEN net ELSE 0 END),0) paid
           FROM creator_earning WHERE status!='reversed'`,
        ).first(),
        env.DB.prepare(
          `SELECT COUNT(*) total,
                  COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) pending,
                  COALESCE(SUM(CASE WHEN status='sending' THEN 1 ELSE 0 END),0) sending,
                  COALESCE(SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END),0) sent,
                  COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) cancelled,
                  COALESCE(SUM(CASE WHEN status IN ('pending','sending') AND attempts>=3 THEN 1 ELSE 0 END),0) retrying,
                  COALESCE(MAX(attempts),0) max_attempts,
                  MIN(CASE WHEN status IN ('pending','sending') THEN created_at END) oldest_open_at,
                  MAX(updated_at) last_updated_at
           FROM livestream_push_outbox`,
        ).first(),
        env.DB.prepare(
          `SELECT id,livestream_id,status,attempts,next_attempt_at,lease_until,provider_id,
                  last_error,created_at,updated_at,sent_at
           FROM livestream_push_outbox ORDER BY updated_at DESC LIMIT 100`,
        ).all(),
        env.DB.prepare(
          `SELECT COUNT(*) total,
                  COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) pending,
                  COALESCE(MAX(attempts),0) max_attempts,
                  MIN(CASE WHEN status='pending' THEN created_at END) oldest_pending_at
           FROM livestream_provider_cleanup`,
        ).first(),
        env.DB.prepare(
          `SELECT input_uid,live_id,status,reason,attempts,next_attempt_at,last_error,created_at,updated_at,deleted_at
           FROM livestream_provider_cleanup ORDER BY updated_at DESC LIMIT 100`,
        ).all(),
      ]);
      return json({
        config: { ...cfg, boleh_mengubah: true },
        creators: profiles.results || [], lives: lives.results || [], payouts: payouts.results || [],
        tips: tips.results || [], finance: finance || {},
        push_outbox: { stats: pushStats || {}, rows: pushRows.results || [] },
        provider_cleanup: { stats: cleanupStats || {}, rows: cleanupRows.results || [] },
      }, 200, env);
    }

    if (a === 'livestream/reconcile' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      if (!(await bolehLanjut(env, `live-reconcile:${admin.id || 'owner'}`, 6, 3600))) {
        return err('Rekonsiliasi manual terlalu sering. Tunggu watchdog berjalan.', 429, env);
      }
      const b = await req.json().catch(() => ({}));
      if (b.confirmation !== 'RETRY CLEANUP') {
        return err('Konfirmasi RETRY CLEANUP diperlukan.', 422, env);
      }
      const now = new Date().toISOString();
      const hasil = await env.DB.batch([
        env.DB.prepare(
          `UPDATE livestream_push_outbox
           SET status='pending',lease_until=NULL,next_attempt_at=?,updated_at=?
           WHERE status='pending' OR (status='sending' AND (lease_until IS NULL OR datetime(lease_until)<=datetime('now')))`,
        ).bind(now, now),
        env.DB.prepare(
          "UPDATE livestream_provider_cleanup SET next_attempt_at=?,updated_at=? WHERE status='pending'",
        ).bind(now, now),
      ]);
      const changes = (x) => Number(x?.meta?.changes || x?.changes || 0);
      ctx.waitUntil(rawatLivestream(env).catch(() => {}));
      ctx.waitUntil(catatLog(env, 'livestream',
        `Rekonsiliasi manual oleh ${admin.id || admin.nama}: push ${changes(hasil[0])}, provider ${changes(hasil[1])}`));
      return json({
        ok: true,
        queued: true,
        push_requeued: changes(hasil[0]),
        provider_requeued: changes(hasil[1]),
      }, 202, env);
    }

    if (a === 'livestream/config' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const b = await req.json().catch(() => ({}));
      const current = await konfigurasiLivestream(env);
      const next = {
        enabled: b.enabled === undefined ? current.enabled : b.enabled === true,
        feeBps: b.platform_fee_bps === undefined ? current.feeBps : Number(b.platform_fee_bps),
        minTip: b.min_tip === undefined ? current.minTip : Number(b.min_tip),
        maxTip: b.max_tip === undefined ? current.maxTip : Number(b.max_tip),
        minPayout: b.min_payout === undefined ? current.minPayout : Number(b.min_payout),
        maxMinutes: b.max_minutes === undefined ? current.maxMinutes : Number(b.max_minutes),
        maxConcurrent: b.max_concurrent === undefined ? current.maxConcurrent : Number(b.max_concurrent),
      };
      if (!Number.isSafeInteger(next.feeBps) || next.feeBps < 0 || next.feeBps > 5000) return err('Fee harus 0–5000 bps.', 422, env);
      if (!Number.isSafeInteger(next.minTip) || !Number.isSafeInteger(next.maxTip)
          || next.minTip < 1000 || next.maxTip > 5_000_000 || next.minTip > next.maxTip) return err('Rentang dukungan tidak valid.', 422, env);
      if (!Number.isSafeInteger(next.minPayout) || next.minPayout < 50_000 || next.minPayout > 10_000_000) return err('Minimum payout tidak valid.', 422, env);
      if (!Number.isSafeInteger(next.maxMinutes) || next.maxMinutes < 15 || next.maxMinutes > 360) return err('Durasi maksimum harus 15–360 menit.', 422, env);
      if (!Number.isSafeInteger(next.maxConcurrent) || next.maxConcurrent < 1 || next.maxConcurrent > 10) return err('Kapasitas live bersamaan harus 1–10.', 422, env);
      if (next.enabled && !current.enabled) {
        if (b.confirmation !== 'AKTIFKAN LIVE') return err('Ketik AKTIFKAN LIVE untuk mengaktifkan fitur berbiaya.', 422, env);
        if (!current.configured) return err('Account ID, customer host, atau token Cloudflare Stream belum lengkap.', 409, env);
        const cleanup = await env.DB.prepare(
          `SELECT
             (SELECT COUNT(*) FROM livestream_provider_cleanup WHERE status='pending') +
             (SELECT COUNT(*) FROM livestream WHERE cleanup_pending=1) AS n`,
        ).first();
        if (Number(cleanup?.n || 0) > 0) {
          return err('Rollout diblokir sampai seluruh cleanup OBS dan Live Input Cloudflare selesai.', 409, env);
        }
      }
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_enabled',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(next.enabled ? '1' : '0', now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_platform_fee_bps',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.feeBps), now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_min_tip',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.minTip), now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_max_tip',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.maxTip), now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_min_payout',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.minPayout), now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_max_minutes',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.maxMinutes), now),
        env.DB.prepare("INSERT INTO setelan(kunci,nilai,diperbarui) VALUES('livestream_max_concurrent',?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai,diperbarui=excluded.diperbarui").bind(String(next.maxConcurrent), now),
      ]);
      if (!next.enabled && current.enabled) {
        const active = await env.DB.prepare(
          "SELECT * FROM livestream WHERE status IN ('queued','starting','live','ending') OR (status='failed' AND cleanup_pending=1)",
        ).all();
        await jalankanTerbatas((active.results || []).map((live) =>
          () => antreAkhirLivestream(env, live, 'Fitur dinonaktifkan pemilik')), 5);
      }
      return json({ ok: true, config: await konfigurasiLivestream(env) }, 200, env);
    }

    const cocokAdminCreator = a.match(/^livestream\/creators\/([^/]+)$/);
    if (cocokAdminCreator && req.method === 'PATCH') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const creator = await env.DB.prepare('SELECT * FROM creator_profile WHERE user_id=?').bind(decodeURIComponent(cocokAdminCreator[1])).first();
      if (!creator) return err('Pengajuan kreator tidak ditemukan.', 404, env);
      const b = await req.json().catch(() => ({}));
      const status = String(b.status || creator.status);
      if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) return err('Status kreator tidak valid.', 422, env);
      if (status === 'approved' && (creator.age_18 !== 1 || creator.terms_version !== 'live-creator-v1')) return err('Deklarasi usia atau versi syarat belum valid.', 409, env);
      const note = String(b.review_note || '').trim();
      if (note.length > 300) return err('Catatan review maksimal 300 karakter.', 422, env);
      if (['rejected', 'suspended'].includes(status) && note.length < 8) {
        return err('Alasan penolakan/penangguhan minimal 8 karakter agar audit dapat dipahami.', 422, env);
      }
      let verified = b.payout_verified === undefined ? creator.payout_verified : (b.payout_verified === true ? 1 : 0);
      if (status !== 'approved') verified = 0;
      let label = b.payout_label === undefined ? creator.payout_label : String(b.payout_label || '').trim();
      if (label && label.length > 80) return err('Label payout maksimal 80 karakter.', 422, env);
      if (verified && !label) return err('Payout hanya dapat diverifikasi dengan label metode tersamar.', 422, env);
      if ((label || '').replace(/\D/g, '').length > 4) {
        return err('Jangan simpan nomor rekening lengkap; gunakan nama bank dan maksimal 4 digit terakhir.', 422, env);
      }
      if (!verified) label = null;
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE creator_profile SET status=?,payout_verified=?,payout_label=?,reviewed_at=?,reviewed_by=?,review_note=?,updated_at=? WHERE user_id=?`,
      ).bind(status, verified, label, now, admin.id || admin.nama, note, now, creator.user_id).run();
      if (status === 'suspended' || status === 'rejected') {
        const active = await env.DB.prepare(
          "SELECT * FROM livestream WHERE user_id=? AND (status IN ('queued','starting','live','ending') OR (status='failed' AND cleanup_pending=1))",
        ).bind(creator.user_id).all();
        for (const live of active.results || []) await antreAkhirLivestream(env, live, 'Status kreator dihentikan admin');
      }
      ctx.waitUntil(buatNotif(env, ctx, {
        userId: creator.user_id, jenis: 'livestream', judul: 'Status program kreator diperbarui',
        pesan: status === 'approved' ? 'Pengajuanmu disetujui. Kamu dapat live saat sesi PC aktif.' : `Status kreator: ${status}. ${note}`,
        aktor: admin.nama, refJenis: 'creator', refId: creator.user_id,
      }));
      return json({ ok: true, status, payout_verified: verified === 1, payout_label: label }, 200, env);
    }

    const cocokAdminLive = a.match(/^livestream\/sessions\/([A-Za-z0-9_-]{8,80})\/(end|provider)$/);
    if (cocokAdminLive) {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const live = await barisLivestream(env, cocokAdminLive[1]);
      if (!live) return err('Siaran tidak ditemukan.', 404, env);
      if (cocokAdminLive[2] === 'provider' && req.method === 'GET') {
        if (!(await bolehLanjut(env, `live-provider:${admin.id || 'owner'}`, 30, 3600))) return err('Batas diagnostik provider tercapai.', 429, env);
        return json(await statusInputLivestream(env, live.provider_input_uid), 200, env);
      }
      if (cocokAdminLive[2] === 'end' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const reason = String(b.reason || 'Diakhiri admin').trim();
        if (!reason || reason.length > 160) return err('Alasan penghentian harus 1–160 karakter.', 422, env);
        const ended = await antreAkhirLivestream(env, live, reason);
        return json({ ok: true, live: bentukLivestreamPublik(env, await barisLivestream(env, ended.id)) }, 200, env);
      }
    }

    const cocokAdminPayout = a.match(/^livestream\/payouts\/([A-Za-z0-9_-]{8,80})$/);
    if (cocokAdminPayout && req.method === 'PATCH') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const payout = await env.DB.prepare('SELECT * FROM creator_payout WHERE id=?').bind(cocokAdminPayout[1]).first();
      if (!payout) return err('Payout tidak ditemukan.', 404, env);
      const b = await req.json().catch(() => ({}));
      const status = String(b.status || '');
      if (!['processing', 'paid', 'rejected'].includes(status)) return err('Status payout tidak valid.', 422, env);
      if (status === 'paid' && b.confirmation !== 'BAYAR') return err('Ketik BAYAR setelah transfer eksternal benar-benar berhasil.', 422, env);
      const providerRef = String(b.provider_ref || '').trim();
      const note = String(b.note || '').trim();
      if (providerRef.length > 100) return err('Referensi transfer maksimal 100 karakter.', 422, env);
      if (note.length > 300) return err('Catatan payout maksimal 300 karakter.', 422, env);
      if (status === 'paid' && providerRef.length < 4) return err('Referensi transfer wajib diisi.', 422, env);
      if (status === 'rejected' && note.length < 8) return err('Alasan penolakan payout minimal 8 karakter.', 422, env);
      // Respons PATCH yang hilang boleh diulang persis tanpa membuat admin
      // ragu apakah ledger sudah berubah. Payload berbeda tetap ditolak.
      if (payout.status === status) {
        const sameRef = String(payout.provider_ref || '') === providerRef;
        const sameNote = String(payout.note || '') === note;
        if ((status === 'paid' && !sameRef) || (status === 'rejected' && !sameNote)
            || (status === 'processing' && (!sameRef || !sameNote))) {
          return err('Payout sudah memiliki hasil berbeda. Segarkan data sebelum melanjutkan.', 409, env);
        }
        return json({ ok: true, status, replay: true }, 200, env);
      }
      if (['paid', 'rejected'].includes(payout.status)) {
        return err('Payout sudah selesai atau status berubah.', 409, env);
      }
      const now = new Date().toISOString();
      try {
        const result = await env.DB.prepare(
          'UPDATE creator_payout SET status=?,processed_at=?,processed_by=?,provider_ref=?,note=? WHERE id=? AND status=?',
        ).bind(status, now, admin.id || admin.nama, providerRef || null, note, payout.id, payout.status).run();
        if (Number(result.meta?.changes || result.changes || 0) === 0) {
          const current = await env.DB.prepare('SELECT status,provider_ref,note FROM creator_payout WHERE id=?').bind(payout.id).first();
          const same = current?.status === status
            && (status !== 'paid' || String(current.provider_ref || '') === providerRef)
            && (status !== 'rejected' || String(current.note || '') === note)
            && (status !== 'processing' || (String(current.provider_ref || '') === providerRef && String(current.note || '') === note));
          if (same) return json({ ok: true, status, replay: true }, 200, env);
          return err('Payout sudah memiliki hasil berbeda. Segarkan data sebelum melanjutkan.', 409, env);
        }
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('PAYOUT_LEDGER_MISMATCH')) {
          return err('Ledger payout tidak cocok; transfer diblokir dan perlu rekonsiliasi.', 409, env);
        }
        if (/INVALID_PAYOUT_TRANSITION|PAYOUT_REFERENCE_REQUIRED|PAYOUT_REJECTION_REASON_REQUIRED/.test(msg)) {
          return err('Transisi payout tidak aman.', 409, env);
        }
        throw e;
      }
      ctx.waitUntil(buatNotif(env, ctx, {
        userId: payout.user_id, jenis: 'livestream', judul: 'Payout kreator diperbarui',
        pesan: status === 'paid' ? `Payout Rp${Number(payout.amount).toLocaleString('id-ID')} telah ditandai terkirim.` : `Status payout: ${status}. ${note}`,
        aktor: admin.nama, refJenis: 'payout', refId: payout.id,
      }));
      return json({ ok: true, status }, 200, env);
    }

    const cocokBalikTip = a.match(/^livestream\/tips\/([A-Za-z0-9_-]{8,80})\/reverse$/);
    if (cocokBalikTip && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const b = await req.json().catch(() => ({}));
      if (b.confirmation !== 'KEMBALIKAN') return err('Ketik KEMBALIKAN untuk mengonfirmasi refund dukungan.', 422, env);
      const reason = String(b.reason || '').trim();
      if (reason.length < 8 || reason.length > 200) return err('Alasan harus 8–200 karakter.', 422, env);
      const tip = await env.DB.prepare('SELECT * FROM livestream_tip WHERE id=?').bind(cocokBalikTip[1]).first();
      if (!tip) return err('Dukungan tidak ditemukan.', 404, env);
      if (tip.status === 'reversed' && String(tip.reverse_reason || '') === reason) {
        return json({ ok: true, replay: true }, 200, env);
      }
      if (tip.status !== 'charged') return err('Dukungan sudah pernah dikembalikan dengan hasil berbeda.', 409, env);
      try {
        const reversed = await env.DB.prepare(
          "UPDATE livestream_tip SET status='reversed',reversed_at=?,reversed_by=?,reverse_reason=? WHERE id=? AND status='charged'",
        ).bind(new Date().toISOString(), admin.id || admin.nama, reason, tip.id).run();
        if (Number(reversed.meta?.changes || reversed.changes || 0) === 0) {
          const current = await env.DB.prepare('SELECT status,reverse_reason FROM livestream_tip WHERE id=?').bind(tip.id).first();
          if (current?.status === 'reversed' && String(current.reverse_reason || '') === reason) {
            return json({ ok: true, replay: true }, 200, env);
          }
          return err('Dukungan sudah pernah dikembalikan dengan hasil berbeda.', 409, env);
        }
      } catch (e) {
        if (/TIP_ALREADY_IN_PAYOUT|INVALID_TIP_TRANSITION/.test(String(e?.message || e))) return err('Dukungan sudah masuk payout atau pernah dikembalikan.', 409, env);
        throw e;
      }
      return json({ ok: true }, 200, env);
    }

    if(a==='security'||a.startsWith('security/')||a==='devices'||a.startsWith('devices/')||a==='audit'||/^users\/[^/]+\/(trash|restore|permanent)$/.test(a)){
      const result=await adminSecurity(env,admin,a,req);
      if(result!==undefined)return json(result,200,env);
    }
    if(a==='media'&&req.method==='GET'){
      if(admin.peran!=='pemilik')return err('Hanya pemilik',403,env);
      const {results}=await env.DB.prepare('SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 200').all();
      return json(results.map(m=>({...m,preview:samarkanKMedia(env,m.url,'t'),url_proxy:samarkanKMedia(env,m.url,'m')})),200,env);
    }

    if (a === 'stats' && req.method === 'GET') {
      const q = (sql) => env.DB.prepare(sql).first();
      const [u, o, oa, rev, prod, msg] = await Promise.all([
        q('SELECT COUNT(*) c FROM users'),
        q('SELECT COUNT(*) c FROM orders'),
        q("SELECT COUNT(*) c FROM orders WHERE status IN ('aktif','provisioning','dibayar','pending')"),
        q("SELECT COALESCE(SUM(ABS(nominal)),0) c FROM transaksi WHERE nominal<0 AND tipe NOT IN ('transfer_keluar','transfer_masuk','penyesuaian','refund')"),
        q('SELECT COUNT(*) c FROM akun_produk'),
        q('SELECT COUNT(*) c FROM cs_messages'),
      ]);
      const { results: harian } = await env.DB.prepare(
        "SELECT substr(dibuat,1,10) d, COUNT(*) n, COALESCE(SUM(total),0) v FROM orders GROUP BY d ORDER BY d DESC LIMIT 7"
      ).all();
      return json({
        users: u.c, orders: o.c, ordersAktif: oa.c, revenue: rev.c,
        produk: prod.c, pesan: msg.c, harian,
      }, 200, env);
    }

    if (a === 'orders' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT o.*, u.nama AS user_nama, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.dibuat DESC LIMIT 100'
      ).all();
      return json(results, 200, env);
    }

    if(a.startsWith('orders/') && req.method==='PATCH'){
      const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(a.split('/')[1]).first();
      if(!order)return err('Pesanan tidak ditemukan',404,env);
      const body=await req.json();
      if(!['selesai','batal'].includes(body.status))return err('Status siap/aktif berasal dari agen. Mulai sesi melalui aplikasi.',409,env);
      const session=await env.DB.prepare("SELECT * FROM sesi WHERE order_id=? AND status NOT IN ('selesai','gagal') ORDER BY dibuat DESC LIMIT 1").bind(order.id).first();
      if(session){
        if(body.status==='batal'&&['dibayar','provisioning'].includes(order.status))await env.DB.prepare("UPDATE orders SET status='batal' WHERE id=?").bind(order.id).run();
        await antreAkhir(env,session,'Sesi dihentikan melalui dashboard');
      }else{
        await env.DB.prepare("UPDATE orders SET status=? WHERE id=? AND status NOT IN ('selesai','batal')").bind(order.status==='dibayar'?'batal':body.status,order.id).run();
      }
      const result=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
      ctx.waitUntil(push(env,`user:${order.user_id}`,'order.update',result));
      return json(result,200,env);
    }

    // ---- katalog PC ----
    if (a === 'plans' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM pc_plans').all();
      return json(results, 200, env);
    }
    if (a === 'plans' && req.method === 'POST') {
      const b = await req.json();
      const idPaket = b.id || uid('pc-');

      // gambar boleh data URI hasil unggah dashboard; simpan ke Cloudinary
      let gambar = b.gambar || '';
      if (gambar.startsWith('data:')) {
        const hasil = await unggahGambar(env, { dataUri: gambar, folder: 'xycloudstore/paket' });
        if (!hasil.ok) return err(hasil.alasan, 502, env);
        gambar = hasil.url;
      }

      // jaga nilai rating & jumlah ulasan saat paket diubah (jangan di-reset)
      const lama = await env.DB.prepare('SELECT rating, jumlah_ulasan FROM pc_plans WHERE id = ?')
        .bind(idPaket).first();

      await env.DB.prepare(
        `INSERT OR REPLACE INTO pc_plans
         (id,nama,gpu,cpu,ram_gb,storage_gb,harga_per_jam,harga_per_hari,region,tag,total_unit,unit_tersedia,gambar,rating,jumlah_ulasan)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(idPaket, b.nama, b.gpu, b.cpu, b.ram_gb, b.storage_gb, b.harga_per_jam,
             b.harga_per_hari, b.region, b.tag || '', b.total_unit, b.unit_tersedia, gambar,
             lama?.rating ?? 5, lama?.jumlah_ulasan ?? 0).run();
      ctx.waitUntil(push(env, 'katalog', 'stock.update', { id: idPaket, unitTersedia: b.unit_tersedia }));
      return json({ ok: true, id: idPaket, gambar }, 201, env);
    }
    if (a.startsWith('plans/') && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM pc_plans WHERE id=?').bind(a.split('/')[1]).run();
      return json({ ok: true }, 200, env);
    }

    // ---- katalog akun ----
    if (a === 'produk' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM akun_produk').all();
      return json(results, 200, env);
    }
    if (a === 'produk' && req.method === 'POST') {
      const b = await req.json();
      const idProduk = b.id || uid('ak-');

      // gambar boleh berupa data URI hasil unggah dari dashboard
      let gambar = b.gambar || '';
      if (gambar.startsWith('data:')) {
        const hasil = await unggahGambar(env, { dataUri: gambar, folder: 'xycloudstore/produk' });
        if (!hasil.ok) return err(hasil.alasan, 502, env);
        gambar = hasil.url;
      }

      const lama = await env.DB.prepare('SELECT rating, jumlah_ulasan FROM akun_produk WHERE id = ?')
        .bind(idProduk).first();

      await env.DB.prepare(
        `INSERT OR REPLACE INTO akun_produk
         (id,nama,kategori,deskripsi,detail,harga,harga_coret,stok,rating,jumlah_ulasan,terjual,gambar,fitur,garansi)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        idProduk, b.nama, b.kategori, b.deskripsi || '',
        JSON.stringify(b.detail || {}),
        b.harga, b.harga_coret || 0, b.stok || 0,
        lama?.rating ?? (b.rating || 5), lama?.jumlah_ulasan ?? 0,
        b.terjual || 0, gambar,
        JSON.stringify(b.fitur || []), b.garansi || '30 hari'
      ).run();

      ctx.waitUntil(push(env, 'katalog', 'produk.update', { id: idProduk }));
      return json({ ok: true, id: idProduk, gambar }, 201, env);
    }
    if (a.startsWith('produk/') && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM akun_produk WHERE id=?').bind(a.split('/')[1]).run();
      return json({ ok: true }, 200, env);
    }

    // ---- promo melayang / pop-up dan integrasi stiker ----
    if (a.startsWith('promosi') || a.startsWith('integrasi/giphy')) {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh mengatur promosi/integrasi', 403, env);
      if (a === 'promosi' && req.method === 'GET') return json(await daftarPromosi(env, true), 200, env);
      if (a === 'promosi' && req.method === 'POST') {
        const hasil = await simpanPromosi(env, await req.json());
        ctx.waitUntil(push(env, 'katalog', 'promosi.update', {}));
        ctx.waitUntil(catatAdmin(env, admin, 'simpan promosi', hasil.id));
        return json(hasil, 201, env);
      }
      if (a.startsWith('promosi/') && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM promo_overlay WHERE id = ?').bind(a.split('/')[1]).run();
        ctx.waitUntil(push(env, 'katalog', 'promosi.update', {}));
        return json({ ok: true }, 200, env);
      }
      if (a === 'integrasi/giphy' && req.method === 'GET') return json({ siap: Boolean(await ambilKunciGiphy(env)), dari_env: Boolean(env.GIPHY_API_KEY) }, 200, env);
      if (a === 'integrasi/giphy' && req.method === 'POST') {
        const b = await req.json();
        return json(await simpanKunciGiphy(env, b.api_key), 200, env);
      }
      if (a === 'integrasi/giphy' && req.method === 'DELETE') {
        if (env.GIPHY_API_KEY) return err('Key berasal dari secret Worker; hapus melalui Cloudflare.', 409, env);
        await env.DB.prepare("DELETE FROM setelan WHERE kunci = 'integrasi_giphy_terenkripsi'").run();
        return json({ ok: true, siap: false }, 200, env);
      }
    }

    // ---- banner ----
    // ---- Batch E: stok akun, info DB, username, uji kata, statistik push ----
    if (a === 'stok' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT p.id AS produk_id, p.nama, p.kategori, p.harga,
                COUNT(s.id) AS total,
                COALESCE(SUM(CASE WHEN s.terpakai=0 THEN 1 ELSE 0 END),0) AS tersedia
         FROM akun_produk p LEFT JOIN akun_stok s ON s.produk_id=p.id
         GROUP BY p.id, p.nama, p.kategori, p.harga
         ORDER BY tersedia ASC`
      ).all();
      return json(results, 200, env);
    }
    if (a === 'stok' && req.method === 'POST') {
      const b = await req.json();
      const { produk_id, akun, teks_bulk } = b;
      if (!produk_id) return err('ID produk diperlukan', 400, env);
      let daftar = Array.isArray(akun) ? akun : [];
      if (typeof teks_bulk === 'string' && teks_bulk.trim()) {
        const baris = teks_bulk.split('\n');
        for (const br of baris) {
          const part = br.trim().split(/[:|,;\t]/);
          if (part.length >= 2 && part[0] && part[1]) {
            daftar.push({ email: part[0].trim(), password: part.slice(1).join(':').trim() });
          }
        }
      }
      if (!daftar.length && b.email && b.password) {
        daftar.push({ email: b.email.trim(), password: b.password.trim(), detail: b.detail });
      }
      let tambah = 0;
      for (const item of daftar) {
        if (item.email && item.password) {
          const sId = uid('stk_');
          await env.DB.prepare(
            `INSERT INTO akun_stok (id, produk_id, email, password, detail, terpakai, dibuat)
             VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
          ).bind(sId, produk_id, item.email.trim(), item.password.trim(), JSON.stringify(item.detail || {})).run();
          tambah++;
        }
      }
      await env.DB.prepare(
        `UPDATE akun_produk SET stok = (SELECT COUNT(*) FROM akun_stok WHERE produk_id=? AND terpakai=0) WHERE id=?`
      ).bind(produk_id, produk_id).run();
      ctx.waitUntil(push(env, 'katalog', 'stock.update', { id: produk_id }));
      return json({ ok: true, ditambahkan: tambah }, 201, env);
    }
    if (a === 'dbinfo' && req.method === 'GET') {
      const daftar = ['users','orders','sesi','pc_plans','akun_produk','akun_stok','transaksi','topup','cs_messages','forum_post','forum_balasan','ulasan','ulasan_pc','voucher','voucher_pakai','banners','follows','dm','simpan_post','hud_preset','hud_preset_suka','laporan','banding','log_admin','log_sistem','security_events','media_assets','rilis','agen','notifikasi','setelan','batas','perintah','promo_overlay'];
      const hasil = [];
      for (const t of daftar) {
        try {
          const r = await env.DB.prepare(`SELECT COUNT(*) c FROM ${t}`).first();
          hasil.push({ tabel: t, jumlah: r?.c ?? 0 });
        } catch (_) {}
      }
      return json(hasil, 200, env);
    }
    if (a === 'usernames' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT id, nama, username, email, tier, diblokir FROM users WHERE username IS NOT NULL ORDER BY username LIMIT 500"
      ).all();
      return json(results, 200, env);
    }
    if (a === 'kata' && req.method === 'GET') {
      return json(KATA_TERLARANG, 200, env);
    }
    if (a === 'uji-kata' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const teks = String(b.teks || '').slice(0, 200);
      const k = kataTerlarangDalam(teks);
      return json({ teks, terlarang: Boolean(k), ...(k || {}) }, 200, env);
    }
    if (a === 'push/statistik' && req.method === 'GET') {
      if (!env.ONESIGNAL_API_KEY || !env.ONESIGNAL_APP_ID) {
        return json({ ok: false, alasan: 'OneSignal belum dikonfigurasi di Worker.' }, 200, env);
      }
      try {
        const r = await fetch(`https://onesignal.com/api/v1/apps/${env.ONESIGNAL_APP_ID}`, {
          headers: { Authorization: `Basic ${env.ONESIGNAL_API_KEY}` },
        });
        const j = await r.json().catch(() => ({}));
        return json({ ok: r.ok, app: j }, 200, env);
      } catch (e) {
        return json({ ok: false, alasan: String(e?.message || e) }, 200, env);
      }
    }

    if (a === 'banners' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM banners ORDER BY urutan ASC').all();
      return json(results, 200, env);
    }
    if (a === 'banners' && req.method === 'POST') {
      const b = await req.json();

      // latar banner boleh gambar kustom (data URI hasil unggah dashboard)
      let gambarB = b.gambar || '';
      if (gambarB.startsWith('data:')) {
        const hasil = await unggahGambar(env, { dataUri: gambarB, folder: 'xycloudstore/banner' });
        if (!hasil.ok) return err(hasil.alasan, 502, env);
        gambarB = hasil.url;
      }

      await env.DB.prepare(
        `INSERT OR REPLACE INTO banners
         (id,judul,subjudul,label,cta,aksi,target,warna1,warna2,ikon,urutan,aktif,gambar)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(b.id || uid('bn-'), b.judul, b.subjudul || '', b.label || '', b.cta || 'Lihat',
             b.aksi || 'sewa', b.target || '', b.warna1 || '#2F5BFF', b.warna2 || '#6A4BFF',
             b.ikon || 'bolt', b.urutan || 0, b.aktif === 0 ? 0 : 1, gambarB).run();
      ctx.waitUntil(kirimBanner(env));
      if (b.kirimPush) {
        ctx.waitUntil(siarkanPush(env, {
          judul: b.judul || 'Promo baru XyCloudStore',
          pesan: b.subjudul || 'Buka aplikasi untuk melihat penawarannya.',
          data: { tipe: 'banner', id: b.id },
        }));
      }
      return json({ ok: true }, 201, env);
    }
    if (a.startsWith('banners/') && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM banners WHERE id=?').bind(a.split('/')[1]).run();
      ctx.waitUntil(kirimBanner(env));
      return json({ ok: true }, 200, env);
    }

    // ---- inbox CS ----
    // cs + cs/rooms: daftar room CS (alias dash v3.3)
    if ((a === 'cs' || a === 'cs/rooms') && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT m.room, u.nama, u.email, u.phone, COUNT(*) total,
                MAX(m.waktu) terakhir,
                (SELECT COALESCE(NULLIF(x.teks,''), CASE WHEN x.audio IS NOT NULL THEN '[Pesan suara]' WHEN x.gambar IS NOT NULL THEN '[Foto]' ELSE '' END)
                   FROM cs_messages x WHERE x.room = m.room AND x.dari!='system' ORDER BY waktu DESC LIMIT 1) preview
         FROM cs_messages m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.dihapus=0 AND datetime(m.waktu)>=datetime('now','-7 days')
         GROUP BY m.room ORDER BY terakhir DESC LIMIT 50`
      ).all();
      return json(results, 200, env);
    }
    if (a.startsWith('cs/room/') && req.method === 'GET') {
      const room = decodeURIComponent(a.slice(8));
      const { results } = await env.DB
        .prepare(`SELECT * FROM (SELECT * FROM cs_messages WHERE room=? AND dihapus=0 AND datetime(waktu)>=datetime('now','-7 days') ORDER BY waktu DESC,id DESC LIMIT 300) ORDER BY waktu,id`).bind(room).all();
      return json(results, 200, env);
    }
    if (a === 'cs/reply' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const room = b.room, teks = String(b.teks ?? '');
      if(!/^user:[A-Za-z0-9_-]+$/.test(String(room||'')))return err('Room tidak valid',400,env);
      // Lampiran gambar opsional: URL https hasil /upload, atau dataURI
      // (diunggah dulu ke Cloudinary). Teks boleh kosong bila ada gambar.
      let urlGambar = null;
      const gambarIn = b.gambar;
      if (typeof gambarIn === 'string' && gambarIn) {
        if (gambarIn.startsWith('data:image/')) {
          if (gambarIn.length > 7 * 1024 * 1024) return err('Gambar maksimal 5 MB', 400, env);
          const hasil = await unggahGambar(env, { dataUri: gambarIn, folder: 'xycloudstore/chat' });
          if (!hasil.ok) return err(hasil.alasan, 502, env);
          urlGambar = hasil.url;
        } else if (/^https:\/\/[^ ]{1,2000}$/.test(gambarIn)) {
          urlGambar = gambarIn;
        } else {
          return err('Gambar tidak valid', 400, env);
        }
      }
      if(!teks.trim()&&!urlGambar)return err('Room dan pesan diperlukan',400,env);
      if(teks.length>5000)return err('Pesan maksimal 5.000 karakter',400,env);
      const reply_to = String(b.reply_to ?? '').slice(0,64) || null;
      const reply_teks = String(b.reply_teks ?? '').slice(0,300) || null;
      const reply_tipe = ['teks','gambar','audio'].includes(b.reply_tipe) ? b.reply_tipe : 'teks';
      const tipeBalas = urlGambar && !teks.trim() ? 'gambar' : 'teks';
      const msg = { id: uid('m_'), room, dari: 'cs', tipe: tipeBalas, teks, gambar: urlGambar, reply_to, reply_teks, reply_tipe, waktu: new Date().toISOString() };
      await env.DB.prepare('INSERT INTO cs_messages (id,room,user_id,dari,tipe,teks,gambar,reply_to,reply_teks,reply_tipe,waktu) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(msg.id, room, room.split(':')[1] || '', 'cs', tipeBalas, teks, urlGambar, reply_to, reply_teks, reply_tipe, msg.waktu).run();
      ctx.waitUntil(Promise.all([
        push(env, room, 'chat.message', msg),
        push(env, 'cs:inbox', 'chat.message', { ...msg, user_id: room.split(':')[1] || '' }),
      ]));
      ctx.waitUntil(kirimPush(env, {
        userId: room.split(':')[1],
        judul: 'Kirana membalas pesanmu',
        pesan: teks.trim() ? (teks.length > 90 ? teks.slice(0, 90) + '...' : teks) : 'Mengirim gambar',
        data: { tipe: 'cs' },
        tombol: [{ id: 'balas', text: 'Balas' }, { id: 'buka', text: 'Buka Chat' }],
      }));
      return json(msg, 201, env);
    }
    if (a === 'cs/typing' && req.method === 'POST') {
      const { room, typing } = await req.json().catch(() => ({}));
      if (!/^user:[A-Za-z0-9_-]+$/.test(String(room || ''))) return err('Room tidak valid', 400, env);
      ctx.waitUntil(push(env, room, 'cs.typing', { typing: !!typing }));
      return json({ ok: true }, 200, env);
    }

    // ---- pengguna ----
    if(a==='users'&&req.method==='GET'){
      const trash=url.searchParams.get('trash')==='1';
      if(trash&&admin.peran!=='pemilik')return err('Hanya pemilik',403,env);
      const q=String(url.searchParams.get('q')||'').slice(0,80);
      const {results}=await env.DB.prepare(`SELECT id,nama,email,phone,saldo,tier,badge,diblokir,alasan_blokir,blokir_sampai,peringatan,
        created_at,foto,total_belanja,kode_referral,deleted_at,registration_device FROM users
        WHERE deleted_at IS ${trash?'NOT ':''}NULL AND (nama LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 200`).bind('%'+q+'%','%'+q+'%').all();
      return json(results.map(u=>({...u,foto:samarkanGambar(env,u.foto,'s'),owner_protected:ownerProtected(env,u)})),200,env);
    }

    if (a === 'users/saldo' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const b = await req.json().catch(() => ({}));
      const userId = String(b.user_id || '');
      const nominal = Number(b.nominal);
      const catatan = String(b.catatan || '').trim().slice(0, 300);
      if (!Number.isSafeInteger(nominal) || nominal === 0 || Math.abs(nominal) > 10_000_000) {
        return err('Penyesuaian saldo harus bilangan bulat nonnol, maksimum Rp10.000.000.', 400, env);
      }
      if (catatan.length < 8) return err('Alasan penyesuaian minimal 8 karakter.', 400, env);
      const ledgerId = uid('t_adj_');
      const hasil = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO transaksi(id,user_id,judul,tipe,nominal)
           SELECT ?,id,?,'penyesuaian',? FROM users
            WHERE id=? AND deleted_at IS NULL AND saldo+?>=0`
        ).bind(ledgerId, catatan, nominal, userId, nominal),
        env.DB.prepare(
          'UPDATE users SET saldo=saldo+? WHERE id=? AND deleted_at IS NULL AND saldo+?>=0'
        ).bind(nominal, userId, nominal),
      ]);
      if (Number(hasil?.[1]?.meta?.changes || 0) !== 1) {
        return err('Pengguna tidak ditemukan atau saldo akan menjadi negatif.', 409, env);
      }
      const u = await env.DB.prepare('SELECT saldo FROM users WHERE id=?').bind(userId).first();
      ctx.waitUntil(push(env, `user:${userId}`, 'wallet.update', { saldo: u?.saldo ?? 0 }));
      await auditSecurity(env, 'balance_adjustment', userId, `${nominal}:${catatan}`, '/api/admin/users/saldo');
      return json({ saldo: u?.saldo ?? 0 }, 200, env);
    }

    // ---- unggah gambar dari dashboard ----
    if (a === 'upload' && req.method === 'POST') {
      const { file, folder } = await req.json();
      const hasil = await unggahGambar(env, { dataUri: file, folder: folder || 'xycloudstore/produk' });
      return hasil.ok ? json(hasil, 201, env) : err(hasil.alasan, 502, env);
    }

    // ---- daftar permintaan top up ----
    if (a === 'topup' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT t.*, u.nama, u.email, u.phone FROM topup t
         LEFT JOIN users u ON u.id = t.user_id ORDER BY
         CASE t.status WHEN 'diperiksa' THEN 0 WHEN 'menunggu' THEN 1 ELSE 2 END, t.dibuat DESC LIMIT 200`
      ).all();
      return json((results || []).map((r) => {
        const aman = { ...r };
        delete aman.checkout_url;
        delete aman.payment_qr;
        delete aman.payment_code;
        return aman;
      }), 200, env);
    }

    // ---- diagnostik penyedia pembayaran, tanpa membocorkan secret ----
    if (a === 'bayar/info' && req.method === 'GET') {
      const py = penyediaBayar(env);
      const q = (sql) => env.DB.prepare(sql).first();
      const [pending, webhook24, webhookTolak24, kredit24, terakhir] = await Promise.all([
        q("SELECT COUNT(*) n FROM topup WHERE status IN ('menunggu','diperiksa') AND kode_unik=0"),
        q("SELECT COUNT(*) n FROM payment_webhook_event WHERE datetime(received_at)>=datetime('now','-1 day')"),
        q("SELECT COUNT(*) n FROM payment_webhook_event WHERE verified=0 AND datetime(received_at)>=datetime('now','-1 day')"),
        q("SELECT COUNT(*) n,COALESCE(SUM(nominal),0) nominal FROM topup_credit WHERE datetime(credited_at)>=datetime('now','-1 day')"),
        env.DB.prepare('SELECT provider,event_status,verified,outcome,received_at FROM payment_webhook_event ORDER BY received_at DESC LIMIT 1').first(),
      ]);
      return json({
        penyedia: py,
        otomatis: py !== 'manual',
        metode: metodeTersedia(env),
        konfigurasi: infoKonfigurasiPembayaran(env),
        webhook_url: py === 'manual' ? null : `${env.PUBLIC_URL || 'https://api.xycloud.my.id'}/bayar/webhook/${py}`,
        webhook_signature: py === 'pakasir' ? 'tidak_disediakan_provider' : 'diverifikasi',
        verifikasi_detail_wajib: true,
        boleh_rekonsiliasi: admin.peran === 'pemilik',
        statistik: {
          pending_gateway: Number(pending?.n || 0),
          webhook_24_jam: Number(webhook24?.n || 0),
          webhook_ditolak_24_jam: Number(webhookTolak24?.n || 0),
          kredit_24_jam: Number(kredit24?.n || 0),
          nominal_kredit_24_jam: Number(kredit24?.nominal || 0),
        },
        webhook_terakhir: terakhir || null,
      }, 200, env);
    }

    if (a === 'bayar/events' && req.method === 'GET') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const { results } = await env.DB.prepare(
        'SELECT id,provider,topup_id,event_status,amount,verified,outcome,received_at FROM payment_webhook_event ORDER BY received_at DESC LIMIT 100'
      ).all();
      return json(results || [], 200, env);
    }

    if (a === 'bayar/rekonsiliasi' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const hasil = await rekonsiliasiPembayaran(env, 30, 'admin-rekonsiliasi');
      await catatLog(env, 'topup', `Rekonsiliasi pembayaran: ${JSON.stringify(hasil)}`);
      return json({ ok: true, ...hasil }, 200, env);
    }

    // ---- verifikasi otomatis: selalu tanya detail provider server-to-server ----
    if (a.startsWith('topup/') && a.endsWith('/verifikasi') && req.method === 'POST') {
      const id = a.split('/')[1];
      const t = await env.DB.prepare('SELECT * FROM topup WHERE id=?').bind(id).first();
      if (!t) return err('Top up tidak ditemukan', 404, env);
      if (!['menunggu', 'diperiksa'].includes(String(t.status))) return err(`Status sudah '${t.status}'.`, 409, env);
      if (!topupGateway(env, t)) return err('Top up ini memakai verifikasi manual.', 422, env);
      const hasil = await periksaDanSinkronTopup(env, t, 'verifikasi-admin', { tolakJikaGagal: true });
      await catatLog(env, 'topup', `Verifikasi provider ${id}: ${hasil.status}`);
      const pesan = hasil.status === 'disetujui' ? 'Lunas — saldo ditambahkan otomatis.'
        : hasil.status === 'ditolak' ? 'Provider mengonfirmasi transaksi kedaluwarsa atau dibatalkan.'
          : hasil.alasan || 'Provider masih menunjukkan pembayaran menunggu.';
      return json({ ok: hasil.ok, status: hasil.status, pesan }, 200, env);
    }

    // ---- setujui atau tolak top up ----
    if (a.startsWith('topup/') && req.method === 'PATCH') {
      const id = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      const status = String(b.status || '');
      const catatan = String(b.catatan || '').trim().slice(0, 500);
      if (!['disetujui', 'ditolak'].includes(status)) return err('Status tidak valid', 400, env);
      const tr = await env.DB.prepare('SELECT * FROM topup WHERE id=?').bind(id).first();
      if (!tr) return err('Permintaan tidak ditemukan', 404, env);
      if (tr.status === 'disetujui') return err('Top up ini sudah disetujui', 409, env);
      if (tr.status === 'ditolak') return err('Top up ini sudah ditolak', 409, env);

      const gateway = topupGateway(env, tr);
      if (status === 'disetujui') {
        if (gateway) {
          const cek = await periksaDanSinkronTopup(env, tr, 'persetujuan-admin');
          if (cek.status === 'disetujui') {
            return json({ ok: true, saldo: cek.kredit?.saldo ?? null, terverifikasi_provider: true }, 200, env);
          }
          const bolehOverride = admin.peran === 'pemilik'
            && b.override_gateway === true
            && b.konfirmasi === 'KREDIT MANUAL'
            && catatan.length >= 20;
          if (!bolehOverride) {
            return err('Provider belum mengonfirmasi lunas. Gunakan tombol verifikasi; override pemilik memerlukan alasan minimal 20 karakter.', 422, env);
          }
          await auditSecurity(env, 'payment_credit_override', id, catatan, `/api/admin/topup/${id}`);
        }
        const kredit = await setujuiTopupOtomatis(
          env, id, catatan || (gateway ? 'Override gateway oleh pemilik' : 'Disetujui admin'),
          gateway ? 'admin-override' : 'admin-manual',
        );
        if (!kredit.baru) return err('Top up gagal diklaim atau sudah diproses', 409, env);
        return json({ ok: true, saldo: kredit.saldo, override: gateway }, 200, env);
      }

      // Jangan menolak tagihan gateway yang mungkin sudah dibayar. Cek dulu;
      // bila masih pending, coba batalkan di provider. Override hanya pemilik.
      if (gateway) {
        const cek = await periksaDanSinkronTopup(env, tr, 'penolakan-admin', { tolakJikaGagal: true });
        if (cek.status === 'disetujui') {
          return json({ ok: true, status: 'disetujui', pesan: 'Provider mengonfirmasi lunas; saldo dikreditkan dan penolakan dibatalkan.' }, 200, env);
        }
        if (cek.status === 'ditolak') {
          return json({ ok: true, status: 'ditolak', pesan: 'Provider mengonfirmasi transaksi gagal/kedaluwarsa.' }, 200, env);
        }
        const batal = await batalkanTagihan(env, tr);
        if (!batal.ok) {
          const bolehOverride = admin.peran === 'pemilik'
            && b.override_gateway === true
            && b.konfirmasi === 'TOLAK GATEWAY'
            && catatan.length >= 20;
          if (!bolehOverride) {
            return err('Tagihan gateway belum dapat dibatalkan. Penolakan dihentikan agar pembayaran pengguna tidak hilang.', 422, env);
          }
          await auditSecurity(env, 'payment_reject_override', id, catatan, `/api/admin/topup/${id}`);
        }
      }

      const waktu = new Date().toISOString();
      const tolak = await env.DB.prepare(
        `UPDATE topup SET status='ditolak',catatan=?,diproses=? WHERE id=?
         AND status IN ('menunggu','diperiksa')
         AND NOT EXISTS(SELECT 1 FROM topup_credit WHERE topup_id=?)`
      ).bind(catatan || (gateway ? 'Tagihan dibatalkan di provider' : 'Bukti transfer tidak cocok'), waktu, id, id).run();
      if (!tolak.meta?.changes) return err('Top up berubah saat diproses; muat ulang data.', 409, env);
      ctx.waitUntil(kirimPush(env, {
        userId: tr.user_id,
        judul: 'Top up ditolak',
        pesan: catatan || 'Pembayaran tidak dapat diverifikasi. Hubungi CS untuk bantuan.',
        data: { tipe: 'wallet' },
      }));
      return json({ ok: true, status: 'ditolak' }, 200, env);
    }

    // ---- ulasan produk ----
    if (a === 'ulasan' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT r.*, p.nama AS produk FROM ulasan r
         LEFT JOIN akun_produk p ON p.id = r.produk_id ORDER BY r.waktu DESC LIMIT 200`
      ).all();
      return json(results, 200, env);
    }

    if (a.startsWith('ulasan/') && req.method === 'PATCH') {
      const id = a.split('/')[1];
      const { balasan } = await req.json();
      await env.DB.prepare('UPDATE ulasan SET balasan = ? WHERE id = ?').bind(balasan || null, id).run();
      return json({ ok: true }, 200, env);
    }

    if (a.startsWith('ulasan/') && req.method === 'DELETE') {
      const id = a.split('/')[1];
      const r = await env.DB.prepare('SELECT produk_id FROM ulasan WHERE id = ?').bind(id).first();
      await env.DB.prepare('DELETE FROM ulasan WHERE id = ?').bind(id).run();
      if (r) {
        const agg = await env.DB
          .prepare('SELECT ROUND(AVG(rating),1) AS r, COUNT(*) AS n FROM ulasan WHERE produk_id = ?')
          .bind(r.produk_id).first();
        await env.DB.prepare('UPDATE akun_produk SET rating = ?, jumlah_ulasan = ? WHERE id = ?')
          .bind(agg.r || 5, agg.n || 0, r.produk_id).run();
      }
      return json({ ok: true }, 200, env);
    }

    // ---- kelola pengguna: lencana, blokir, tier ----
    if (a.startsWith('users/') && a.endsWith('/kelola') && req.method === 'PATCH') {
      const idU = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      const target=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(idU).first();
      if(target&&b.diblokir&&ownerProtected(env,target))return err('Akun pemilik dilindungi.',409,env);
      const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(idU).first();
      if (!u) return err('Pengguna tidak ditemukan', 404, env);

      // `sampai` = batas blokir sementara (ISO). Kosong/null = permanen.
      const sampaiB = b.diblokir && b.sampai ? String(b.sampai) : null;
      await env.DB.prepare(
        `UPDATE users SET badge = ?, tier = COALESCE(NULLIF(?,''), tier),
                          diblokir = COALESCE(?, diblokir), alasan_blokir = ?,
                          blokir_sampai = ?
         WHERE id = ?`
      ).bind(
        b.badge === '' ? null : (b.badge ?? u.badge),
        b.tier || '',
        b.diblokir == null ? null : (b.diblokir ? 1 : 0),
        b.diblokir ? (b.alasan || 'Melanggar ketentuan komunitas') : null,
        b.diblokir ? sampaiB : null,
        idU,
      ).run();
      // Setiap pembekuan BARU tercatat sebagai riwayat pelanggaran, supaya
      // pengguna melihat rekam jejak moderasi di layar Akun Dibekukan.
      if (b.diblokir && !u.diblokir) {
        await env.DB.prepare(
          "INSERT INTO pelanggaran(id,user_id,jenis,alasan,sampai,oleh,waktu) VALUES(?,?, 'blokir',?,?,?,?)",
        ).bind(uid('pl_'), idU, b.alasan || 'Melanggar ketentuan komunitas', sampaiB,
          String(admin?.nama || admin?.peran || 'admin'), new Date().toISOString()).run();
      }

      if (b.diblokir != null) {
        await env.DB.prepare('UPDATE users SET session_version=session_version+1 WHERE id=?').bind(idU).run();
        if (b.diblokir) {
          const [sessions, lives] = await Promise.all([
            env.DB.prepare("SELECT * FROM sesi WHERE user_id=? AND status NOT IN ('selesai','gagal')").bind(idU).all(),
            env.DB.prepare(
              "SELECT * FROM livestream WHERE user_id=? AND (status IN ('queued','starting','live','ending') OR (status='failed' AND cleanup_pending=1))",
            ).bind(idU).all(),
          ]);
          for (const session of sessions.results || []) await antreAkhir(env, session, 'Akun dibatasi oleh admin');
          // Jangan menunggu cron: blokir creator harus memutus ingress dan
          // mencabut player dalam request administrasi yang sama.
          for (const live of lives.results || []) await antreAkhirLivestream(env, live, 'Akun dibatasi oleh admin');
          await env.DB.batch([
            env.DB.prepare('DELETE FROM livestream_watch_handoff WHERE viewer_id=?').bind(idU),
            env.DB.prepare('DELETE FROM livestream_view WHERE viewer_id=?').bind(idU),
          ]);
        }
        ctx.waitUntil(buatNotif(env, ctx, {
          userId: idU,
          jenis: 'sistem',
          judul: b.diblokir ? 'Akunmu dibekukan' : 'Akunmu diaktifkan kembali',
          pesan: b.diblokir
            ? `Alasan: ${b.alasan || 'Melanggar ketentuan komunitas'}. Hubungi admin lewat chat untuk banding.`
            : 'Terima kasih sudah bekerja sama. Selamat memakai layanan lagi.',
          aktor: 'Admin',
        }));
      }
      if (b.badge !== undefined) {
        ctx.waitUntil(buatNotif(env, ctx, {
          userId: idU,
          jenis: 'sistem',
          judul: b.badge ? `Kamu mendapat lencana ${b.badge}` : 'Lencanamu dilepas',
          pesan: b.badge ? 'Lencana ini tampil di samping namamu pada komunitas.' : '',
          aktor: 'Admin',
        }));
      }

      const baru = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(idU).first();
      delete baru.password;
      return json(baru, 200, env);
    }

    // ---- kirim peringatan ke pengguna ----
    if (a.startsWith('users/') && a.endsWith('/peringatan') && req.method === 'POST') {
      const idU = a.split('/')[1];
      const { pesan } = await req.json().catch(() => ({}));
      const u = await env.DB.prepare('SELECT id, nama, email, peringatan FROM users WHERE id = ?')
        .bind(idU).first();
      if (!u) return err('Pengguna tidak ditemukan', 404, env);

      await env.DB.prepare('UPDATE users SET peringatan = peringatan + 1 WHERE id = ?').bind(idU).run();

      const isi = pesan || 'Mohon jaga sikap di komunitas XyCloudStore.';
      ctx.waitUntil(buatNotif(env, ctx, {
        userId: idU,
        jenis: 'peringatan',
        judul: `Peringatan dari admin (${(u.peringatan || 0) + 1})`,
        pesan: isi,
        aktor: 'Admin',
      }));

      // sekalian kirim sebagai pesan chat supaya pasti terbaca
      const waktu = new Date().toISOString();
      ctx.waitUntil(env.DB.prepare(
        'INSERT INTO cs_messages (id,room,user_id,dari,teks,waktu) VALUES (?,?,?,?,?,?)'
      ).bind(uid('m_'), `user:${idU}`, idU, 'cs', `Peringatan: ${isi}`, waktu).run());
      ctx.waitUntil(push(env, `user:${idU}`, 'chat.message', {
        id: uid('m_'), room: `user:${idU}`, dari: 'cs', teks: `Peringatan: ${isi}`, waktu,
      }));

      return json({ ok: true, peringatan: (u.peringatan || 0) + 1 }, 200, env);
    }

    // ---- daftar laporan konten ----
    if (a === 'laporan' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT l.*, u.nama AS pelapor_nama FROM laporan l
         LEFT JOIN users u ON u.id = l.pelapor
         ORDER BY CASE l.status WHEN 'baru' THEN 0 ELSE 1 END, l.dibuat DESC LIMIT 100`
      ).all();
      return json(results, 200, env);
    }

    if (a.startsWith('laporan/') && req.method === 'PATCH') {
      const idL = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      await env.DB.prepare('UPDATE laporan SET status = ? WHERE id = ?')
        .bind(b.status || 'selesai', idL).run();
      return json({ ok: true }, 200, env);
    }

    // ---- tandai konten sensitif ----
    if (a.startsWith('konten/') && req.method === 'PATCH') {
      const [, jenis, idK] = a.split('/');
      const tabel = jenis === 'ulasan' ? 'ulasan' : 'forum_post';
      const b = await req.json().catch(() => ({}));
      await env.DB.prepare(`UPDATE ${tabel} SET sensitif = ? WHERE id = ?`)
        .bind(b.sensitif ? 1 : 0, idK).run();
      return json({ ok: true }, 200, env);
    }

    // ---- laporan galat aplikasi ----
    if (a === 'galat' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT g.*, u.nama AS nama_pengguna FROM galat g
         LEFT JOIN users u ON u.id = g.user_id
         ORDER BY CASE g.status WHEN 'baru' THEN 0 ELSE 1 END, g.terakhir DESC LIMIT 100`
      ).all();
      return json(results, 200, env);
    }

    if (a.startsWith('galat/') && req.method === 'PATCH') {
      const idG = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      await env.DB.prepare('UPDATE galat SET status = ? WHERE id = ?')
        .bind(b.status || 'selesai', idG).run();
      return json({ ok: true }, 200, env);
    }

    if (a.startsWith('galat/') && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM galat WHERE id = ?').bind(a.split('/')[1]).run();
      return json({ ok: true }, 200, env);
    }

    // ---- funnel referral: klik -> unduh -> terpasang -> diklaim ----
    if (a === 'referral' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.kode, p.nama AS nama_pengundang, d.nama AS nama_diundang,
                a.status, COALESCE(r.bonus_pengundang,0) AS bonus_pengundang,
                COALESCE(r.bonus_diundang,0) AS bonus_diundang,
                a.clicked_at AS dibuat, a.downloaded_at, a.download_variant,
                a.installed_at, a.package_installed_at, a.claimed_at AS selesai,
                COALESCE(r.sumber,'install_ticket') AS sumber,
                COALESCE(r.risiko,a.risiko) AS risiko,
                CASE WHEN a.device_id IS NULL THEN NULL ELSE substr(a.device_id,1,10)||'…' END AS perangkat
           FROM referral_attribution a
           JOIN users p ON p.id=a.pengundang
           LEFT JOIN referral r ON r.attribution_id=a.id
           LEFT JOIN users d ON d.id=a.claimed_by
          UNION ALL
         SELECT r.id, COALESCE(r.kode,'-'), p.nama, d.nama, r.status,
                r.bonus_pengundang, r.bonus_diundang, r.dibuat,
                NULL, NULL, NULL, NULL, r.selesai, COALESCE(r.sumber,'legacy'),
                r.risiko,
                CASE WHEN r.device_id IS NULL THEN NULL ELSE substr(r.device_id,1,10)||'…' END
           FROM referral r
           JOIN users p ON p.id=r.pengundang
           LEFT JOIN users d ON d.id=r.diundang
          WHERE r.attribution_id IS NULL
          ORDER BY dibuat DESC LIMIT 500`
      ).all();
      return json(results, 200, env);
    }

    // ---- analitik kunjungan situs ----
    if (a === 'analitik' && req.method === 'GET') {
      const semua = async (sql) => {
        try {
          const { results } = await env.DB.prepare(sql).all();
          return results;
        } catch (_) {
          return [];
        }
      };
      return json({
        harian: await semua(
          `SELECT substr(waktu,1,10) d, COUNT(*) n FROM kunjungan
           WHERE waktu > datetime('now','-30 day') GROUP BY d ORDER BY d`),
        halaman: await semua(
          `SELECT halaman, COUNT(*) n FROM kunjungan
           WHERE waktu > datetime('now','-30 day') GROUP BY halaman ORDER BY n DESC LIMIT 10`),
        perangkat: await semua(
          `SELECT perangkat, COUNT(*) n FROM kunjungan
           WHERE waktu > datetime('now','-30 day') GROUP BY perangkat ORDER BY n DESC`),
        negara: await semua(
          `SELECT negara, COUNT(*) n FROM kunjungan
           WHERE waktu > datetime('now','-30 day') GROUP BY negara ORDER BY n DESC LIMIT 8`),
        total: (await semua("SELECT COUNT(*) n FROM kunjungan WHERE waktu > datetime('now','-30 day')"))[0]?.n ?? 0,
      }, 200, env);
    }

    // ---- ulasan paket PC ----
    if (a === 'ulasan-pc' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT r.*, p.nama AS paket FROM ulasan_pc r
         LEFT JOIN pc_plans p ON p.id = r.plan_id ORDER BY r.waktu DESC LIMIT 100`
      ).all();
      return json(results, 200, env);
    }

    // ---- voucher ----
    if (a === 'voucher' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM voucher ORDER BY dibuat DESC LIMIT 100').all();
      return json(results, 200, env);
    }

    if (a === 'voucher' && req.method === 'POST') {
      const b = await req.json();
      const kode = String(b.kode || '').trim().toUpperCase();
      if (kode.length < 3) return err('Kode voucher minimal 3 huruf', 400, env);

      await env.DB.prepare(
        `INSERT OR REPLACE INTO voucher
         (kode,jenis,nilai,min_belanja,maks_potongan,untuk,kuota,terpakai,berlaku_sampai,aktif,keterangan)
         VALUES (?,?,?,?,?,?,?,COALESCE((SELECT terpakai FROM voucher WHERE kode=?),0),?,?,?)`
      ).bind(
        kode, b.jenis || 'persen', Number(b.nilai) || 0, Number(b.min_belanja) || 0,
        Number(b.maks_potongan) || 0, b.untuk || 'semua', Number(b.kuota) || 0, kode,
        b.berlaku_sampai || null, b.aktif === false ? 0 : 1, b.keterangan || '',
      ).run();

      ctx.waitUntil(catatAdmin(env, admin, 'buat voucher', kode));
      return json({ ok: true, kode }, 201, env);
    }

    if (a.startsWith('voucher/') && req.method === 'DELETE') {
      const kode = decodeURIComponent(a.split('/')[1]);
      await env.DB.prepare('DELETE FROM voucher WHERE kode = ?').bind(kode).run();
      ctx.waitUntil(catatAdmin(env, admin, 'hapus voucher', kode));
      return json({ ok: true }, 200, env);
    }

    // ---- kunci admin dan peran ----
    if (a === 'peran' && req.method === 'GET') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh membuka bagian ini', 403, env);
      const { results } = await env.DB.prepare(
        'SELECT id,nama,peran,aktif,terakhir,dibuat,kunci,kunci_preview FROM admin_kunci ORDER BY dibuat DESC'
      ).all();
      return json((results || []).map((r) => ({
        id: r.id,
        nama: r.nama,
        peran: r.peran,
        aktif: r.aktif,
        terakhir: r.terakhir,
        dibuat: r.dibuat,
        kunci_preview: r.kunci_preview || previewKunciAdmin(r.kunci),
        legacy_unhashed: !String(r.kunci || '').startsWith('h1:'),
      })), 200, env);
    }

    if (a === 'peran' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh menambah admin', 403, env);
      const b = await req.json().catch(() => ({}));
      const namaAdmin = String(b.nama || '').trim().slice(0, 80);
      const peranAdmin = ['pemilik', 'cs', 'moderator'].includes(b.peran) ? b.peran : 'cs';
      if (!namaAdmin) return err('Nama admin wajib diisi', 400, env);
      const kunci = `xya_${crypto.randomUUID().replace(/-/g, '')}`;
      const id = uid('ak_');
      await env.DB.prepare('INSERT INTO admin_kunci (id,nama,kunci,kunci_preview,peran) VALUES (?,?,?,?,?)')
        .bind(id, namaAdmin, await markerKunciAdmin(env, kunci), previewKunciAdmin(kunci), peranAdmin).run();
      ctx.waitUntil(catatAdmin(env, admin, 'tambah admin', `${namaAdmin} (${peranAdmin})`));
      // Nilai mentah hanya dikirim sekali pada respons pembuatan.
      return json({ id, kunci, peran: peranAdmin }, 201, env);
    }

    // ---- putar kunci admin tambahan (bukan secret env ADMIN_KEY) ----
    if (a.startsWith('peran/') && a.endsWith('/rotate') && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh memutar kunci admin', 403, env);
      const idK = a.split('/')[1];
      const lama = await env.DB.prepare('SELECT id,nama,peran FROM admin_kunci WHERE id = ?').bind(idK).first();
      if (!lama) return err('Kunci tidak ditemukan', 404, env);
      const kunciBaru = `xya_${crypto.randomUUID().replace(/-/g, '')}`;
      await env.DB.prepare('UPDATE admin_kunci SET kunci=?,kunci_preview=?,terakhir=? WHERE id=?')
        .bind(await markerKunciAdmin(env, kunciBaru), previewKunciAdmin(kunciBaru), new Date().toISOString(), idK).run();
      ctx.waitUntil(catatAdmin(env, admin, 'rotate kunci admin', idK));
      // Nilai mentah hanya dikirim sekali pada respons rotasi.
      return json({ ok: true, id: idK, nama: lama.nama, peran: lama.peran, kunci: kunciBaru }, 200, env);
    }

    if (a.startsWith('peran/') && req.method === 'DELETE') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik yang boleh menghapus admin', 403, env);
      const idA = a.split('/')[1];
      await env.DB.prepare('DELETE FROM admin_kunci WHERE id = ?').bind(idA).run();
      ctx.waitUntil(catatAdmin(env, admin, 'hapus admin', idA));
      return json({ ok: true }, 200, env);
    }

    // ---- cadangan basis data ----
    if (a === 'cadangan' && req.method === 'GET') {
      const { results } = await env.DB
        .prepare('SELECT id, ukuran, jumlah_baris, dibuat FROM cadangan ORDER BY dibuat DESC').all();
      return json(results, 200, env);
    }

    if (a === 'cadangan' && req.method === 'POST') {
      const hasil = await buatCadangan(env);
      ctx.waitUntil(catatAdmin(env, admin, 'buat cadangan', hasil.id));
      return json(hasil, 201, env);
    }

    if (a.startsWith('cadangan/') && req.method === 'GET') {
      const idB = a.split('/')[1];
      const baris = await env.DB.prepare('SELECT isi FROM cadangan WHERE id = ?').bind(idB).first();
      if (!baris) return err('Cadangan tidak ditemukan', 404, env);
      return new Response(baris.isi, {
        headers: {
          ...securityHeaders(env),
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="xycloudstore-${idB}.json"`,
        },
      });
    }

    // ---- notifikasi semua pengguna (admin) ----
    if (a === 'notifikasi' && req.method === 'GET') {
      const q = String(url.searchParams.get('q') || '').slice(0, 60);
      const hasil = q
        ? await env.DB.prepare(
            `SELECT * FROM notifikasi WHERE user_id LIKE ? OR judul LIKE ? OR pesan LIKE ? ORDER BY dibuat DESC LIMIT 300`
          ).bind('%'+q+'%','%'+q+'%','%'+q+'%').all()
        : await env.DB.prepare('SELECT * FROM notifikasi ORDER BY dibuat DESC LIMIT 300').all();
      return json(hasil.results, 200, env);
    }

    // ---- log sistem (catatan internal Worker) ----
    if (a === 'log-sistem' && req.method === 'GET') {
      const hasil = await env.DB.prepare(
        'SELECT * FROM log_sistem ORDER BY waktu DESC LIMIT 200'
      ).all();
      return json(hasil.results, 200, env);
    }
    if (a === 'log-sistem/bersihkan' && req.method === 'DELETE') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      await env.DB.prepare('DELETE FROM log_sistem WHERE waktu < datetime(\'now\', \'-24 hours\')').run();
      return json({ ok: true }, 200, env);
    }

    // ---- perintah ke agen PC ----
    if (a === 'perintah' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT p.*, a.nama AS agen_nama, a.host FROM perintah p
         LEFT JOIN agen a ON a.id = p.agen_id
         ORDER BY p.dibuat DESC LIMIT 200`
      ).all();
      return json(results.map((r) => ({ ...r, muatan_terurai: (() => { try { return JSON.parse(r.muatan || 'null'); } catch { return null; } })() })), 200, env);
    }

    // ---- pemakaian voucher ----
    if (a === 'voucher-pakai' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT vp.*, u.nama AS user_nama, u.email AS user_email FROM voucher_pakai vp
         LEFT JOIN users u ON u.id = vp.user_id
         ORDER BY vp.waktu DESC LIMIT 200`
      ).all();
      return json(results, 200, env);
    }

    // ---- ulasan paket PC ----
    if (a.startsWith('ulasan-pc/') && req.method === 'PATCH') {
      const idR = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      await env.DB.prepare('UPDATE ulasan_pc SET balasan = ? WHERE id = ?')
        .bind(b.balasan || null, idR).run();
      return json({ ok: true }, 200, env);
    }
    if (a.startsWith('ulasan-pc/') && req.method === 'DELETE') {
      const idR = a.split('/')[1];
      await env.DB.prepare('DELETE FROM ulasan_pc WHERE id = ?').bind(idR).run();
      return json({ ok: true }, 200, env);
    }

    // ---- semua transaksi saldo ----
    if (a === 'transaksi' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT t.*, u.nama AS user_nama, u.email AS user_email FROM transaksi t
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY t.waktu DESC LIMIT 300`
      ).all();
      return json(results, 200, env);
    }

    // ---- setelan kunci-nilai (pemilik) ----
    if (a === 'setelan' && req.method === 'GET') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const { results } = await env.DB.prepare('SELECT kunci, nilai, diperbarui FROM setelan ORDER BY kunci').all();
      return json((results || []).map((r) => kunciSetelanSensitif(r.kunci)
        ? { ...r, nilai: '[RAHASIA—PINDAHKAN KE WORKER SECRET]', rahasia: true }
        : { ...r, rahasia: false }), 200, env);
    }
    if (a === 'setelan' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const b = await req.json().catch(() => ({}));
      const kunci = String(b.kunci || '').trim();
      if (!/^[a-z0-9_.-]{1,64}$/.test(kunci)) return err('Nama kunci tidak valid', 400, env);
      if (kunciSetelanSensitif(kunci)) {
        return err('Secret/API key dilarang disimpan di D1. Gunakan wrangler secret put.', 422, env);
      }
      const nilai = String(b.nilai ?? '').slice(0, 20_000);
      await simpanSetelan(env, kunci, nilai);
      return json({ ok: true, kunci, nilai }, 200, env);
    }
    if (a.startsWith('setelan/') && req.method === 'DELETE') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const kunci = String(a.split('/')[1] || '');
      await env.DB.prepare('DELETE FROM setelan WHERE kunci = ?').bind(kunci).run();
      return json({ ok: true }, 200, env);
    }

    // ---- impor cadangan .json (pemilik) ----
    if (a === 'cadangan/impor' && req.method === 'POST') {
      if (admin.peran !== 'pemilik') return err('Hanya pemilik', 403, env);
      const b = await req.json().catch(() => ({}));
      const struktur = b?.isi || b;
      if (!struktur || typeof struktur !== 'object' || Array.isArray(struktur)) {
        return err('Format cadangan tidak dikenal. Unggah JSON {isi:{nama_tabel:[...]}} dari Cadangan DB.', 400, env);
      }
      const izin = new Set(['users','pc_plans','akun_produk','akun_stok','orders','transaksi','topup','banners','forum_post','forum_balasan','ulasan','ulasan_pc','voucher','agen','notifikasi','laporan','setelan','promo_overlay','media_assets','hud_preset']);
      let masuk = 0, dilewati = 0;
      for (const [tabel, baris] of Object.entries(struktur)) {
        if (!izin.has(tabel) || !Array.isArray(baris) || baris.length === 0) { dilewati += 1; continue; }
        try {
          if (tabel === 'setelan') {
            for (const s of baris) {
              if (!s?.kunci || kunciSetelanSensitif(s.kunci)) { dilewati += 1; continue; }
              await simpanSetelan(env, String(s.kunci), String(s.nilai ?? '').slice(0, 20_000));
              masuk += 1;
            }
          } else {
            const { results: col } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${tabel}')`).all();
            const kolom = col.map((c) => c.name);
            const daftar = baris.filter((r) => r && typeof r === 'object' && kolom.includes('id'));
            for (let r of daftar) {
              if (tabel === 'users') { r = { ...r }; delete r.password; } // jangan pernah impor hash sandi
              const kunciKolom = kolom.filter((k) => r[k] !== undefined && r[k] !== null);
              if (kunciKolom.length === 0) continue;
              const sql = `INSERT OR IGNORE INTO ${tabel} (${kunciKolom.join(',')}) VALUES (${kunciKolom.map(() => '?').join(',')})`;
              try { await env.DB.prepare(sql).bind(...kunciKolom.map((k) => r[k])).run(); masuk += 1; }
              catch { dilewati += 1; }
            }
          }
        } catch { dilewati += 1; }
      }
      await catatLog(env, 'impor', `Impor cadangan selesai: ${masuk} baris masuk, ${dilewati} dilewati`);
      ctx.waitUntil(catatAdmin(env, admin, 'impor cadangan', `${masuk} baris`));
      return json({ ok: true, masuk, dilewati, tabel: Object.keys(struktur).length }, 200, env);
    }

    // ---- atur versi minimal aplikasi ----
    if (a === 'sistem/versi' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      await simpanSetelan(env, 'versi_minimal', String(b.versi || ''));
      ctx.waitUntil(catatAdmin(env, admin, 'atur versi minimal', b.versi));
      return json({ ok: true, versi: b.versi }, 200, env);
    }

    // ---- statistik lengkap ----
    if (a === 'statistik' && req.method === 'GET') {
      return json(await statistikLengkap(env), 200, env);
    }

    // ---- mode pemeliharaan ----
    // Pengaman: setiap kali dinyalakan, waktu mulai dan batas "sampai" ikut
    // dicatat. Pemeliharaan otomatis (sistem.js) akan mematikannya sendiri
    // kalau lewat batas itu, supaya layanan tidak terkunci diam-diam saat
    // operator atau agen AI error setelah menyalakannya.
    // - b.sampai      : ISO absolut kapan harus mati (opsional)
    // - b.maks_menit  : berapa menit boleh menyala, bawaan 720 (12 jam);
    //                   0 = tanpa batas (tidak pernah auto-mati)
    if (a === 'sistem/pemeliharaan' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      // hanya_bebas: perbarui daftar pengecualian tanpa mengubah status
      // mode pemeliharaan (supaya menambah tester tidak mematikan mode).
      if (b.hanya_bebas === true) {
        const bersih = (Array.isArray(b.bebas) ? b.bebas : [])
          .map((x) => (typeof x === 'string' ? { id: x } : x))
          .filter((x) => x && (x.id || x.email))
          .map((x) => ({ id: String(x.id || ''), email: String(x.email || '').toLowerCase(), nama: String(x.nama || '') }));
        const unikB = [...new Map(bersih.map((x) => [x.id || x.email, x])).values()];
        await simpanSetelan(env, 'pemeliharaan_bebas', JSON.stringify(unikB));
        ctx.waitUntil(catatLog(env, 'pemeliharaan',
          'Daftar pengecualian pemeliharaan diperbarui: ' + unikB.length + ' pengguna'));
        return json({ ok: true, hanyaBebas: true, bebas: unikB }, 200, env);
      }
      const aktif = Boolean(b.aktif);
      // cakupan: 'semua' | 'web' | 'aplikasi' | 'halaman'
      let cakupan = String(b.cakupan || 'semua').toLowerCase();
      if (!CAKUPAN_PEMELIHARAAN.includes(cakupan)) cakupan = 'semua';
      // daftar halaman saat cakupan = 'halaman'
      const halaman = (Array.isArray(b.halaman) ? b.halaman : [])
        .map((x) => String(x || '').trim().slice(0, 120))
        .filter((x) => x.startsWith('/'));
      const unik = [...new Set(halaman)];
      if (aktif) {
        const kini = Date.now();
        const maks = Number(b.maks_menit ?? (await setelan(env, 'pemeliharaan_maks_menit', '720')));
        const menit = Math.max(0, Math.floor(Number.isFinite(maks) ? maks : 720));
        await simpanSetelan(env, 'mode_pemeliharaan_mulai', new Date(kini).toISOString());
        await simpanSetelan(env, 'pemeliharaan_maks_menit', String(menit));
        const sampai = b.sampai
          ? String(b.sampai)
          : new Date(kini + (menit > 0 ? menit * 60000 : 0)).toISOString();
        await simpanSetelan(env, 'mode_pemeliharaan_sampai', menit > 0 ? sampai : '');
      } else {
        await simpanSetelan(env, 'mode_pemeliharaan_mulai', '');
        await simpanSetelan(env, 'mode_pemeliharaan_sampai', '');
        cakupan = String(b.cakupan || 'semua').toLowerCase();
        if (!CAKUPAN_PEMELIHARAAN.includes(cakupan)) cakupan = 'semua';
      }
      await simpanSetelan(env, 'mode_pemeliharaan', aktif ? '1' : '0');
      await simpanSetelan(env, 'pemeliharaan_cakupan', cakupan);
      await simpanSetelan(env, 'pemeliharaan_halaman', JSON.stringify(unik));
      if (b.pesan !== undefined) await simpanSetelan(env, 'pesan_pemeliharaan', String(b.pesan ?? ''));
      // Daftar pengguna yang dikecualikan (tester internal). Diterima sebagai
      // larik objek {id,email,nama} atau larik string id; null = tidak diubah.
      if (b.bebas !== undefined && b.bebas !== null) {
        const bersih = (Array.isArray(b.bebas) ? b.bebas : [])
          .map((x) => (typeof x === 'string' ? { id: x } : x))
          .filter((x) => x && (x.id || x.email))
          .map((x) => ({ id: String(x.id || ''), email: String(x.email || '').toLowerCase(), nama: String(x.nama || '') }));
        const unikB = [...new Map(bersih.map((x) => [x.id || x.email, x])).values()];
        await simpanSetelan(env, 'pemeliharaan_bebas', JSON.stringify(unikB));
      }
      const sampai = aktif ? await setelan(env, 'mode_pemeliharaan_sampai', '') : '';
      const label = { semua: 'semua (web + aplikasi)', web: 'hanya situs web', aplikasi: 'hanya aplikasi Android', halaman: unik.length ? unik.length + ' halaman dipilih' : 'beranda saja (/)' }[cakupan];
      ctx.waitUntil(catatLog(env, 'pemeliharaan',
        aktif
          ? 'Mode pemeliharaan dinyalakan untuk ' + label + (sampai ? ' (auto-mati ' + sampai + ')' : ' (tanpa batas)')
          : 'Mode pemeliharaan dimatikan'));
      return json({ ok: true, aktif, cakupan, sampai: aktif ? (sampai || null) : null, halaman: unik }, 200, env);
    }

    // ---- banding pengguna yang dibekukan ----
    if (a === 'moderasi/banding' && req.method === 'GET') {
      const st = String(url.searchParams.get('status') || '');
      const r = await env.DB.prepare(
        `SELECT b.id, b.user_id, b.pesan, b.status, b.waktu, b.tanggapan, b.waktu_tanggapan,
                u.nama, u.email
         FROM banding b LEFT JOIN users u ON u.id = b.user_id
         ${st ? 'WHERE b.status = ?' : ''}
         ORDER BY (b.status = 'baru') DESC, b.waktu DESC LIMIT 100`,
      ).bind(...(st ? [st] : [])).all();
      return json(r.results, 200, env);
    }
    if (a.startsWith('moderasi/banding/') && req.method === 'POST') {
      const idB = a.split('/')[2];
      const b = await req.json().catch(() => ({}));
      const status = ['diterima', 'ditolak'].includes(b.status) ? b.status : null;
      if (!status) return err('Status harus "diterima" atau "ditolak".', 422, env);
      const row = await env.DB.prepare('SELECT * FROM banding WHERE id=?').bind(idB).first();
      if (!row) return err('Banding tidak ditemukan', 404, env);
      await env.DB.prepare('UPDATE banding SET status=?, tanggapan=?, waktu_tanggapan=? WHERE id=?')
        .bind(status, String(b.tanggapan || ''), new Date().toISOString(), idB).run();
      if (status === 'diterima') {
        await env.DB.prepare(
          'UPDATE users SET diblokir=0, alasan_blokir=NULL, blokir_sampai=NULL, session_version=session_version+1 WHERE id=?',
        ).bind(row.user_id).run();
      }
      ctx.waitUntil(buatNotif(env, ctx, {
        userId: row.user_id, jenis: 'sistem',
        judul: status === 'diterima' ? 'Banding diterima' : 'Banding ditolak',
        pesan: status === 'diterima'
          ? 'Akunmu aktif kembali. Selamat memakai layanan.'
          : (b.tanggapan || 'Bandingmu ditolak. Hubungi chat CS bila perlu penjelasan.'),
        aktor: 'Admin',
      }));
      ctx.waitUntil(catatLog(env, 'laporan', `Banding ${idB} ${status} oleh admin`));
      return json({ ok: true, status }, 200, env);
    }

    // ---- jalankan pemeliharaan sekarang ----
    if (a === 'sistem/bersihkan' && req.method === 'POST') {
      return json(await jalankanPemeliharaan(env), 200, env);
    }

    // ---- kosongkan singgahan tepi ----
    if (a === 'sistem/cache' && req.method === 'DELETE') {
      const cache = caches.default;
      const dasar = env.PUBLIC_URL || 'https://api.xycloud.my.id';
      const dibuang = [];
      for (const jalur of ['/__cache/rilis', '/', '/unduh']) {
        const ok = await cache.delete(new Request(`https://xycloud.my.id${jalur}`));
        if (ok) dibuang.push(jalur);
      }
      await cache.delete(new Request(`${dasar}/brand/logo.png`));
      ctx.waitUntil(catatLog(env, 'cache', `Singgahan dikosongkan: ${dibuang.join(', ') || 'tidak ada'}`));
      return json({ ok: true, dibuang }, 200, env);
    }

    // ---- kesehatan layanan ----
    if (a === 'sistem/kesehatan' && req.method === 'GET') {
      const mulai = Date.now();
      let dbOk = true;
      try {
        await env.DB.prepare('SELECT 1').first();
      } catch (_) {
        dbOk = false;
      }
      const jedaDb = Date.now() - mulai;

      const ukuran = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM orders) orders,
                (SELECT COUNT(*) FROM cs_messages) pesan, (SELECT COUNT(*) FROM forum_post) forum,
                (SELECT COUNT(*) FROM log_sistem) log`
      ).first().catch(() => ({}));

      return json({
        database: { hidup: dbOk, jedaMs: jedaDb, baris: ukuran },
        email: Boolean(env.RESEND_API_KEY),
        push: Boolean(env.ONESIGNAL_API_KEY),
        gambar: Boolean(env.CLOUDINARY_KEY),
        pembayaran: penyediaBayar(env),
        loginGoogle: providerSiap(env).google,
        loginFacebook: providerSiap(env).facebook,
        wilayah: req.cf?.colo || '-',
        waktu: new Date().toISOString(),
      }, 200, env);
    }

    // ---- diagnostik OAuth aman (tanpa App Secret/access token) ----
    if (a === 'sistem/oauth' && req.method === 'GET') {
      const [facebook, jumlahIdentity, penghapusan] = await Promise.all([
        diagnostikFacebook(env),
        env.DB.prepare(
          'SELECT provider,COUNT(*) AS jumlah FROM social_identity GROUP BY provider ORDER BY provider'
        ).all().catch(() => ({ results: [] })),
        env.DB.prepare(
          "SELECT status,COUNT(*) AS jumlah FROM social_deletion_request GROUP BY status ORDER BY status"
        ).all().catch(() => ({ results: [] })),
      ]);
      return json({
        google: {
          configured: providerSiap(env).google,
          nativeConfigured: Boolean(String(env.GOOGLE_CLIENT_ID_ANDROID || '').trim()),
          callback: `${env.PUBLIC_URL || 'https://api.xycloud.my.id'}/api/auth/google/callback`,
        },
        facebook,
        identities: jumlahIdentity.results || [],
        deletionRequests: penghapusan.results || [],
        checkedAt: new Date().toISOString(),
      }, 200, env);
    }

    // ---- catat rilis aplikasi baru (dipanggil alur build) ----
    if (a === 'rilis' && req.method === 'POST') {
      const b = await req.json();
      if (!b.versi || !Array.isArray(b.berkas)) return err('Data rilis tidak lengkap', 400, env);
      const hasil = await simpanRilis(env, b);
      return json(hasil, 201, env);
    }

    // ---- unit / agen PC host ----
    if (a === 'agen' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM agen ORDER BY dibuat DESC').all();
      const sekarang = Date.now();
      return json(results.map((r) => ({
        ...r,
        spec: r.spec ? JSON.parse(r.spec) : {},
        // dianggap mati kalau tidak melapor lebih dari 90 detik
        hidup: r.terakhir ? sekarang - new Date(r.terakhir).getTime() < 90000 : false,
      })), 200, env);
    }

    if (a === 'agen' && req.method === 'POST') {
      const b = await req.json();
      const id = b.id || uid('ag_');
      const kode = b.kode || `xya_${crypto.randomUUID().replace(/-/g, '')}`;
      await env.DB.prepare(
        'INSERT OR REPLACE INTO agen (id,nama,kode,plan_id,host,status,dibuat) VALUES (?,?,?,?,?,?,COALESCE((SELECT dibuat FROM agen WHERE id=?),datetime(\'now\')))'
      ).bind(id, b.nama || 'Unit baru', kode, b.plan_id || null, b.host || null, 'offline', id).run();
      return json({ id, kode }, 201, env);
    }

    if (a.startsWith('agen/') && a.endsWith('/cek-port') && req.method === 'POST') {
      const row = await env.DB.prepare('SELECT host FROM agen WHERE id=?').bind(a.split('/')[1]).first();
      if (!row) return err('Unit tidak ditemukan', 404, env);
      const host = String(row.host || '').split(':')[0].trim();
      if (!host) return err('Unit belum punya host streaming. Isi host (IP publik / domain) dulu.', 422, env);
      const hasil = [];
      for (const port of [47984, 47989, 48010]) {
        hasil.push({ port, terbuka: await probePortTcp(host, port, 6000) });
      }
      return json({ ok: true, host, hasil }, 200, env);
    }

    if (a.startsWith('agen/') && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM agen WHERE id = ?').bind(a.split('/')[1]).run();
      return json({ ok: true }, 200, env);
    }

    if (a.startsWith('agen/') && req.method === 'PATCH') {
      const id = a.split('/')[1];
      const b = await req.json().catch(() => ({}));
      const row = await env.DB.prepare('SELECT * FROM agen WHERE id=?').bind(id).first();
      if (!row) return err('Unit tidak ditemukan', 404, env);
      let host = row.host;
      if (b.host !== undefined) {
        const h = String(b.host || '').trim();
        if (!h) host = null;
        else {
          const n = normalisasiHostStream(h, null);
          if (!n) return err('Host harus IP publik (x.x.x.x) atau domain (pc.contoh.com), bukan nama PC Windows.', 400, env);
          host = n;
        }
      }
      const nama = b.nama != null ? String(b.nama).trim() || row.nama : row.nama;
      const plan = b.plan_id !== undefined ? (b.plan_id || null) : row.plan_id;
      await env.DB.prepare('UPDATE agen SET nama=?, plan_id=?, host=? WHERE id=?').bind(nama, plan, host, id).run();
      // sesi aktif ikut host baru
      if (host) {
        await env.DB.prepare("UPDATE sesi SET host=? WHERE agen_id=? AND status IN ('siap','pairing','berjalan','menyiapkan')").bind(host, id).run();
      }
      return json({ ok: true, id, host, nama, plan_id: plan }, 200, env);
    }

    if (a === 'sesi' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT s.*, u.nama, u.email, a.nama AS unit FROM sesi s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN agen a ON a.id = s.agen_id
         ORDER BY s.dibuat DESC LIMIT 100`
      ).all();
      return json(results, 200, env);
    }

    // ---- forum: moderasi ----
    // buat pengumuman resmi dari admin
    if (a === 'forum' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const judul = String(b.judul || '').trim();
      const isi = String(b.isi || '').trim();
      if (judul.length < 5 || isi.length < 10) return err('Judul dan isi pengumuman terlalu pendek', 400, env);

      let gambar = null;
      if (b.gambar && String(b.gambar).startsWith('data:')) {
        const hasil = await unggahGambar(env, { dataUri: b.gambar, folder: 'xycloudstore/forum' });
        if (!hasil.ok) return err(hasil.alasan, 502, env);
        gambar = hasil.url;
      }

      const post = {
        id: uid('f_'), user_id: 'admin', nama: 'Kirana - XyCloudStore', foto: null,
        kategori: b.kategori || 'Pengumuman', judul, isi, gambar,
        suka: 0, balasan: 0, disematkan: b.sematkan === false ? 0 : 1,
        dibuat: new Date().toISOString(),
      };
      await env.DB.prepare(
        'INSERT INTO forum_post (id,user_id,nama,foto,kategori,judul,isi,gambar,disematkan,dibuat) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).bind(post.id, 'admin', post.nama, null, post.kategori, judul, isi, gambar, post.disematkan, post.dibuat).run();

      ctx.waitUntil(push(env, 'forum', 'forum.baru', post));

      if (b.kirimPush !== false) {
        ctx.waitUntil(siarkanPush(env, {
          judul: `Pengumuman: ${judul.slice(0, 50)}`,
          pesan: isi.length > 110 ? `${isi.slice(0, 110)}...` : isi,
          data: { tipe: 'forum', id: post.id },
        }));
      }

      return json(post, 201, env);
    }

    if (a === 'forum' && req.method === 'GET') {
      const { results } = await env.DB
        .prepare('SELECT * FROM forum_post ORDER BY disematkan DESC, dibuat DESC LIMIT 200').all();
      return json(results, 200, env);
    }

    if (a.startsWith('forum/') && a.endsWith('/balas') && req.method === 'POST') {
      const id = a.split('/')[1];
      const { isi } = await req.json();
      const baris = {
        id: uid('fb_'), post_id: id, user_id: 'admin', nama: 'Kirana - XyCloudStore',
        foto: null, isi: String(isi || '').trim(), admin: 1, dibuat: new Date().toISOString(),
      };
      await env.DB.batch([
        env.DB.prepare('INSERT INTO forum_balasan (id,post_id,user_id,nama,foto,isi,admin,dibuat) VALUES (?,?,?,?,?,?,1,?)')
          .bind(baris.id, id, 'admin', baris.nama, null, baris.isi, baris.dibuat),
        env.DB.prepare('UPDATE forum_post SET balasan = balasan + 1 WHERE id = ?').bind(id),
      ]);
      ctx.waitUntil(push(env, 'forum', 'forum.balasan', baris));

      ctx.waitUntil((async () => {
        const p2 = await env.DB.prepare('SELECT user_id, judul FROM forum_post WHERE id = ?').bind(id).first();
        const { results } = await env.DB
          .prepare('SELECT DISTINCT user_id FROM forum_balasan WHERE post_id = ? AND user_id != ?')
          .bind(id, 'admin').all();
        const cuplikan = (baris.isi || 'Mengirim stiker').slice(0, 90);
        const tujuan = [...new Set([p2?.user_id, ...results.map((r) => r.user_id)].filter(Boolean))];
        for (const uid2 of tujuan) {
          await buatNotif(env, ctx, {
            userId: uid2,
            jenis: 'balasan',
            judul: 'Kirana membalas diskusi',
            pesan: `"${(p2?.judul || '').slice(0, 50)}": ${cuplikan}`,
            aktor: 'Kirana',
            refJenis: 'forum',
            refId: id,
          });
        }
      })());

      return json(baris, 201, env);
    }

    if (a.startsWith('forum/') && a.endsWith('/sematkan') && req.method === 'PATCH') {
      const id = a.split('/')[1];
      const { disematkan } = await req.json();
      await env.DB.prepare('UPDATE forum_post SET disematkan = ? WHERE id = ?')
        .bind(disematkan ? 1 : 0, id).run();
      return json({ ok: true }, 200, env);
    }

    if (a.startsWith('forum/') && req.method === 'DELETE') {
      const id = a.split('/')[1];
      await env.DB.batch([
        env.DB.prepare('DELETE FROM forum_balasan WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM forum_suka WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM forum_post WHERE id = ?').bind(id),
      ]);
      ctx.waitUntil(push(env, 'forum', 'forum.hapus', { id }));
      return json({ ok: true }, 200, env);
    }

    // ---- uji email dan push ----
    if (a === 'uji/email' && req.method === 'POST') {
      const { to } = await req.json();
      const hasil = await kirimEmail(env, {
        to, template: 'verifikasi', data: { nama: 'Admin', kode: '123456' },
      });
      return json(hasil, hasil.ok ? 200 : 502, env);
    }
    if (a === 'uji/push' && req.method === 'POST') {
      const { user_id, pesan } = await req.json();
      const hasil = await kirimPush(env, {
        userId: user_id, judul: 'Uji notifikasi', pesan: pesan || 'Halo dari XyCloudStore',
      });
      return json(hasil, hasil.ok ? 200 : 502, env);
    }

    // ---- push builder (dashboard): siarkan ke semua user atau satu user ----
    // Hanya pemilik yang bisa lewat (push tidak masuk izin cs/moderator di HAK_PERAN).
    if (a === 'push' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const judul = String(b.judul || '').trim().slice(0, 120);
      const pesan = String(b.pesan || '').trim().slice(0, 400);
      if (!judul || !pesan) return err('Judul dan pesan wajib diisi', 400, env);
      const tipe = ['promo', 'banner', 'order', 'sesi', 'wallet', 'akun', 'forum', 'komunitas', 'cs', 'sistem']
        .includes(String(b.tipe || '')) ? String(b.tipe) : 'sistem';
      const urlKirim = typeof b.url === 'string' && b.url.startsWith('https://') ? b.url.slice(0, 300) : undefined;
      const data = { tipe, ...(typeof b.id === 'string' && b.id ? { id: b.id } : {}) };

      if (b.mode === 'user') {
        const userId = String(b.user_id || '');
        if (!userId) return err('user_id wajib diisi untuk sasaran pengguna', 400, env);
        const ada = await env.DB.prepare('SELECT nama FROM users WHERE id = ? AND deleted_at IS NULL')
          .bind(userId).first();
        if (!ada) return err('Pengguna tidak ditemukan', 404, env);
        const hasil = await kirimPush(env, { userId, judul, pesan, data, url: urlKirim });
        if (!hasil.ok) return err(hasil.alasan || 'Push gagal dikirim ke penyedia', 502, env);
        ctx.waitUntil(catatAdmin(env, admin, 'kirim push', `${ada.nama} (${userId}) · ${judul}`));
        return json({ ok: true, id: hasil.id, sasaran: 'user', user_id: userId }, 200, env);
      }

      const hasil = await siarkanPush(env, { judul, pesan, data });
      if (!hasil.ok) return err(hasil.alasan || 'Push gagal dikirim ke penyedia', 502, env);
      ctx.waitUntil(catatAdmin(env, admin, 'siarkan push', `semua user · ${judul}`));
      return json({ ok: true, id: hasil.id, sasaran: 'semua' }, 200, env);
    }


    // ---- alias & missing endpoints for dashboard v3.3 full migration ----
    if (a === 'audit' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM log_admin ORDER BY waktu DESC LIMIT 120').all();
      return json(results, 200, env);
    }
    if ((a === 'unit' || a === 'units') && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM agen ORDER BY dibuat DESC').all();
      const sekarang = Date.now();
      return json(results.map((r) => ({
        ...r,
        spec: r.spec ? JSON.parse(r.spec) : {},
        hidup: r.terakhir ? sekarang - new Date(r.terakhir).getTime() < 90000 : false,
      })), 200, env);
    }
    if (a === 'sistem' && req.method === 'GET') {
      const mulai = Date.now();
      let dbOk = true;
      try { await env.DB.prepare('SELECT 1').first(); } catch (_) { dbOk = false; }
      const ukuran = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM orders) orders,
                (SELECT COUNT(*) FROM cs_messages) pesan, (SELECT COUNT(*) FROM forum_post) forum,
                (SELECT COUNT(*) FROM log_sistem) log`
      ).first().catch(() => ({}));
      const mode = await setelan(env, 'mode_pemeliharaan', '0');
      const cakupan = await setelan(env, 'pemeliharaan_cakupan', 'semua');
      const pesan = await setelan(env, 'pesan_pemeliharaan', '');
      const versi = await setelan(env, 'versi_minimal', '');
      const sampai = await setelan(env, 'mode_pemeliharaan_sampai', '');
      const mulaiPm = await setelan(env, 'mode_pemeliharaan_mulai', '');
      return json({
        database: { hidup: dbOk, jedaMs: Date.now()-mulai, baris: ukuran },
        pemeliharaan: {
          aktif: mode==='1', cakupan, pesan, versi_minimal: versi,
          halaman: await halamanPemeliharaan(env),
          sampai: sampai || null, mulai: mulaiPm || null,
          bebas: await daftarBebasPemeliharaan(env),
        },
        email: Boolean(env.RESEND_API_KEY),
        push: Boolean(env.ONESIGNAL_API_KEY),
        gambar: Boolean(env.CLOUDINARY_KEY),
        pembayaran: penyediaBayar(env),
        waktu: new Date().toISOString(),
      }, 200, env);
    }
    if (a === 'rilis' && req.method === 'GET') {
      const info = await infoRilis(env, ctx);
      return json(info, 200, env);
    }
    if (a === 'alat' && req.method === 'GET') {
      return json({ ok: true, endpoints: ['uji/email','uji/push','sistem/kesehatan'] }, 200, env);
    }
    if (a === 'keuangan' && req.method === 'GET') {
      const [rev, top, biaya, provider] = await Promise.all([
        env.DB.prepare("SELECT COALESCE(SUM(ABS(nominal)),0) c FROM transaksi WHERE nominal<0 AND tipe NOT IN ('transfer_keluar','transfer_masuk','penyesuaian','refund')").first(),
        env.DB.prepare("SELECT COALESCE(SUM(nominal),0) c,COUNT(*) n FROM transaksi WHERE tipe='topup'").first(),
        env.DB.prepare("SELECT COALESCE(SUM(provider_fee),0) c FROM topup WHERE status='disetujui'").first(),
        env.DB.prepare(
          `SELECT provider,COUNT(*) transaksi,COALESCE(SUM(nominal),0) nominal,
                  COALESCE(SUM(provider_fee),0) biaya
             FROM topup WHERE status='disetujui' GROUP BY provider ORDER BY nominal DESC`
        ).all(),
      ]);
      return json({
        pendapatan: Number(rev?.c || 0),
        topup: Number(top?.c || 0),
        jumlah_topup: Number(top?.n || 0),
        biaya_provider: Number(biaya?.c || 0),
        provider: provider.results || [],
      }, 200, env);
    }
    if (a === 'live' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM agen ORDER BY terakhir DESC LIMIT 20').all();
      return json(results, 200, env);
    }
    if (a === 'favorit' && req.method === 'GET') {
      let total = 0;
      let top = [];
      try {
        const t = await env.DB.prepare('SELECT COUNT(*) AS c FROM favorit').first();
        total = Number(t?.c || 0);
      } catch (_) { total = 0; }
      try {
        // Agregasi wishlist per produk (akun_produk / pc_plans / generic)
        const { results } = await env.DB.prepare(
          `SELECT f.ref_jenis AS jenis, f.ref_id AS ref_id,
                  COUNT(*) AS jumlah,
                  COALESCE(p.nama, pl.nama, f.ref_id) AS nama,
                  COALESCE(p.gambar, pl.gambar, NULL) AS gambar
           FROM favorit f
           LEFT JOIN akun_produk p ON f.ref_jenis IN ('produk','akun','akun_produk') AND p.id = f.ref_id
           LEFT JOIN pc_plans pl ON f.ref_jenis IN ('plan','paket','pc') AND pl.id = f.ref_id
           GROUP BY f.ref_jenis, f.ref_id
           ORDER BY jumlah DESC
           LIMIT 50`
        ).all();
        top = results || [];
      } catch (e) {
        // Skema lama mungkin beda kolom — fallback count-only
        try {
          const { results } = await env.DB.prepare(
            `SELECT ref_id AS ref_id, COUNT(*) AS jumlah FROM favorit GROUP BY ref_id ORDER BY jumlah DESC LIMIT 50`
          ).all();
          top = (results || []).map((r) => ({ ...r, jenis: 'item', nama: r.ref_id }));
        } catch (_) { top = []; }
      }
      return json({ total, top, produk_top: top[0]?.nama || null }, 200, env);
    }
    // brand logos for new dash (admin path fallback)
    if (a === 'brand/logo-full' && req.method === 'GET') {
      return new Response(LOGO_FULL_PNG, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (a === 'brand/logo' && req.method === 'GET') {
      return new Response(LOGO_PNG, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    }

    return err('Endpoint admin tidak dikenal: '+a, 404, env);

}
