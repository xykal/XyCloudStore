// Gerbang lapis kedua untuk host admin: memverifikasi JWT Cloudflare Access
// (header Cf-Access-Jwt-Assertion atau cookie CF_Authorization) di dalam Worker,
// sehingga host admin tetap tertutup walau aplikasi Access di edge terhapus
// atau salah setel. Gagal tertutup: tanpa konfigurasi atau tanpa JWT sah
// permintaan ditolak.

const TTL_JWKS_MS = 60 * 60 * 1000;
const TOLERANSI_DETIK = 60;

const cacheJwks = { teamDomain: '', diambil: 0, kunci: new Map() };

export class AccessError extends Error {
  constructor(kode, status = 403) {
    super(kode);
    this.kode = kode;
    this.status = status;
  }
}

function dekodeBase64Url(bagian) {
  const b64 = bagian.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const biner = atob(b64 + pad);
  const keluar = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i++) keluar[i] = biner.charCodeAt(i);
  return keluar;
}

function bacaJsonBase64Url(bagian) {
  try {
    return JSON.parse(new TextDecoder().decode(dekodeBase64Url(bagian)));
  } catch (_) {
    throw new AccessError('jwt_rusak');
  }
}

async function ambilJwksBawaan(teamDomain) {
  const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!r.ok) throw new AccessError('jwks_tidak_tersedia', 503);
  const data = await r.json();
  return Array.isArray(data?.keys) ? data.keys : [];
}

async function muatJwks(teamDomain, ambilJwks) {
  const daftar = await ambilJwks(teamDomain);
  const peta = new Map();
  for (const jwk of daftar) {
    if (jwk?.kty !== 'RSA' || !jwk.kid) continue;
    try {
      const kunci = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      peta.set(jwk.kid, kunci);
    } catch (_) { /* kunci tidak valid dilewati */ }
  }
  cacheJwks.teamDomain = teamDomain;
  cacheJwks.diambil = Date.now();
  cacheJwks.kunci = peta;
}

async function kunciUntukKid(kid, teamDomain, ambilJwks) {
  const basi = cacheJwks.teamDomain !== teamDomain || Date.now() - cacheJwks.diambil > TTL_JWKS_MS;
  if (basi) await muatJwks(teamDomain, ambilJwks);
  let kunci = cacheJwks.kunci.get(kid);
  // kid asing: muat ulang sekali (rotasi kunci), tapi tidak lebih sering dari 60 detik
  if (!kunci && Date.now() - cacheJwks.diambil > 60_000) {
    await muatJwks(teamDomain, ambilJwks);
    kunci = cacheJwks.kunci.get(kid);
  }
  return kunci || null;
}

export function _resetCacheJwks() {
  cacheJwks.teamDomain = '';
  cacheJwks.diambil = 0;
  cacheJwks.kunci = new Map();
}

export function ambilTokenAccess(req) {
  const header = req.headers.get('Cf-Access-Jwt-Assertion');
  if (header && header.split('.').length === 3) return header.trim();
  const cookie = req.headers.get('Cookie') || '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

/**
 * Verifikasi JWT Cloudflare Access. Mengembalikan klaim bila sah, melempar
 * AccessError bila tidak. `opsi.ambilJwks(teamDomain)` dan `opsi.sekarang()`
 * dapat disuntik untuk pengujian.
 */
export async function verifikasiJwtAccess(token, { teamDomain, aud, ambilJwks = ambilJwksBawaan, sekarang = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!teamDomain || !aud) throw new AccessError('access_belum_dikonfigurasi', 503);
  if (!token || typeof token !== 'string') throw new AccessError('jwt_tidak_ada', 401);
  const bagian = token.split('.');
  if (bagian.length !== 3) throw new AccessError('jwt_rusak');
  const kepala = bacaJsonBase64Url(bagian[0]);
  if (kepala.alg !== 'RS256' || !kepala.kid) throw new AccessError('jwt_alg');
  const klaim = bacaJsonBase64Url(bagian[1]);
  const kini = sekarang();
  const audiens = Array.isArray(klaim.aud) ? klaim.aud : [klaim.aud];
  if (!audiens.includes(aud)) throw new AccessError('jwt_aud');
  if (klaim.iss !== `https://${teamDomain}`) throw new AccessError('jwt_iss');
  if (typeof klaim.exp !== 'number' || klaim.exp <= kini - TOLERANSI_DETIK) throw new AccessError('jwt_kedaluwarsa', 401);
  if (typeof klaim.nbf === 'number' && klaim.nbf > kini + TOLERANSI_DETIK) throw new AccessError('jwt_belum_berlaku');
  if (typeof klaim.iat === 'number' && klaim.iat > kini + TOLERANSI_DETIK) throw new AccessError('jwt_iat');

  const kunci = await kunciUntukKid(kepala.kid, teamDomain, ambilJwks);
  if (!kunci) throw new AccessError('jwt_kid');
  const data = new TextEncoder().encode(`${bagian[0]}.${bagian[1]}`);
  const sah = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kunci, dekodeBase64Url(bagian[2]), data);
  if (!sah) throw new AccessError('jwt_tanda_tangan');
  return klaim;
}

function tolak(err) {
  const status = err instanceof AccessError ? err.status : 403;
  const kode = err instanceof AccessError ? err.kode : 'access_gagal';
  return new Response(JSON.stringify({ ok: false, error: kode, pesan: 'Host admin memerlukan sesi Cloudflare Access yang sah.' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Dipanggil di awal penanganan host admin. Mengembalikan Response penolakan
 * bila permintaan tidak membawa JWT Access yang sah, atau null bila lolos.
 * Klaim yang lolos dilampirkan sebagai header internal X-Admin-Access-Email
 * pada objek permintaan baru yang dikembalikan lewat `hasil.req`.
 */
export function buatGerbangAccessAdmin(opsi = {}) {
  return async function gerbangAccessAdmin(req, env) {
    try {
      const klaim = await verifikasiJwtAccess(ambilTokenAccess(req), {
        teamDomain: env.ACCESS_TEAM_DOMAIN,
        aud: env.ACCESS_AUD,
        ...opsi,
      });
      return { tolak: null, email: typeof klaim.email === 'string' ? klaim.email : '' };
    } catch (err) {
      return { tolak: tolak(err), email: '' };
    }
  };
}

export const gerbangAccessAdmin = buatGerbangAccessAdmin();
