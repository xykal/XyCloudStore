import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifikasiJwtAccess, buatGerbangAccessAdmin, ambilTokenAccess, AccessError, _resetCacheJwks } from '../src/access_admin.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const TEAM = 'contoh-tim.cloudflareaccess.com';
const AUD = 'aud-uji-0123456789abcdef';
const KINI = 1_800_000_000;

function b64url(masukan) {
  const buf = typeof masukan === 'string' ? Buffer.from(masukan, 'utf8') : Buffer.from(masukan);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function buatPenandatangan(kid) {
  const pasangan = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pasangan.publicKey);
  const publik = { kty: 'RSA', kid, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' };
  async function tandaTangani(klaim, kepala = { alg: 'RS256', kid, typ: 'JWT' }) {
    const badan = `${b64url(JSON.stringify(kepala))}.${b64url(JSON.stringify(klaim))}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pasangan.privateKey, Buffer.from(badan, 'utf8'));
    return `${badan}.${b64url(sig)}`;
  }
  return { publik, tandaTangani };
}

const klaimSah = () => ({
  aud: [AUD], iss: `https://${TEAM}`, email: 'admin@contoh.test',
  iat: KINI - 10, nbf: KINI - 10, exp: KINI + 3600, sub: 'uji', type: 'app',
});

const penandatangan = await buatPenandatangan('kid-a');
let jumlahAmbil = 0;
const ambilJwks = async () => { jumlahAmbil++; return [penandatangan.publik]; };
const opsi = { teamDomain: TEAM, aud: AUD, ambilJwks, sekarang: () => KINI };

async function tolakDengan(kode, janji) {
  await assert.rejects(janji, (err) => err instanceof AccessError && err.kode === kode, `harus ditolak dengan ${kode}`);
}

test('JWT sah diterima dan klaim email dikembalikan', async () => {
  _resetCacheJwks();
  const klaim = await verifikasiJwtAccess(await penandatangan.tandaTangani(klaimSah()), opsi);
  assert.equal(klaim.email, 'admin@contoh.test');
  assert.equal(jumlahAmbil, 1);
});

test('JWKS di-cache: verifikasi kedua tidak mengambil ulang', async () => {
  const sebelum = jumlahAmbil;
  await verifikasiJwtAccess(await penandatangan.tandaTangani(klaimSah()), opsi);
  assert.equal(jumlahAmbil, sebelum);
});

test('aud berbeda ditolak', async () => {
  await tolakDengan('jwt_aud', verifikasiJwtAccess(await penandatangan.tandaTangani({ ...klaimSah(), aud: ['aud-lain'] }), opsi));
});

test('issuer berbeda ditolak', async () => {
  await tolakDengan('jwt_iss', verifikasiJwtAccess(await penandatangan.tandaTangani({ ...klaimSah(), iss: 'https://penyerang.cloudflareaccess.com' }), opsi));
});

test('token kedaluwarsa ditolak', async () => {
  await tolakDengan('jwt_kedaluwarsa', verifikasiJwtAccess(await penandatangan.tandaTangani({ ...klaimSah(), exp: KINI - 600 }), opsi));
});

test('tanda tangan dimanipulasi ditolak', async () => {
  const token = await penandatangan.tandaTangani(klaimSah());
  const [h, p, s] = token.split('.');
  const rusak = `${h}.${p}.${s.slice(0, -2)}${s.endsWith('AA') ? 'BB' : 'AA'}`;
  await tolakDengan('jwt_tanda_tangan', verifikasiJwtAccess(rusak, opsi));
});

test('payload diganti tanpa tanda tangan ulang ditolak', async () => {
  const token = await penandatangan.tandaTangani(klaimSah());
  const [h, , s] = token.split('.');
  const palsu = `${h}.${b64url(JSON.stringify({ ...klaimSah(), email: 'penyerang@contoh.test' }))}.${s}`;
  await tolakDengan('jwt_tanda_tangan', verifikasiJwtAccess(palsu, opsi));
});

test('alg selain RS256 ditolak (termasuk none)', async () => {
  const token = await penandatangan.tandaTangani(klaimSah(), { alg: 'none', kid: 'kid-a' });
  await tolakDengan('jwt_alg', verifikasiJwtAccess(token, opsi));
});

test('kid asing ditolak setelah muat ulang', async () => {
  _resetCacheJwks();
  const lain = await buatPenandatangan('kid-z');
  const sebelum = jumlahAmbil;
  await tolakDengan('jwt_kid', verifikasiJwtAccess(await lain.tandaTangani(klaimSah()), opsi));
  assert.ok(jumlahAmbil > sebelum);
});

test('tanpa konfigurasi gagal tertutup 503, tanpa token 401', async () => {
  await tolakDengan('access_belum_dikonfigurasi', verifikasiJwtAccess('x.y.z', { ...opsi, aud: '' }));
  await tolakDengan('jwt_tidak_ada', verifikasiJwtAccess('', opsi));
});

test('ambilTokenAccess membaca header lalu cookie', () => {
  const dariHeader = new Request('https://admin.contoh.test/', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c', Cookie: 'CF_Authorization=d.e.f' } });
  assert.equal(ambilTokenAccess(dariHeader), 'a.b.c');
  const dariCookie = new Request('https://admin.contoh.test/', { headers: { Cookie: 'lain=1; CF_Authorization=d.e.f; x=2' } });
  assert.equal(ambilTokenAccess(dariCookie), 'd.e.f');
  assert.equal(ambilTokenAccess(new Request('https://admin.contoh.test/')), '');
});

test('gerbang: lolos dengan JWT sah, menolak 403 JSON tanpa JWT', async () => {
  _resetCacheJwks();
  const gerbang = buatGerbangAccessAdmin({ ambilJwks, sekarang: () => KINI });
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const sah = await gerbang(new Request('https://admin.contoh.test/api/x', { headers: { 'Cf-Access-Jwt-Assertion': await penandatangan.tandaTangani(klaimSah()) } }), env);
  assert.equal(sah.tolak, null);
  assert.equal(sah.email, 'admin@contoh.test');
  const kosong = await gerbang(new Request('https://admin.contoh.test/'), env);
  assert.equal(kosong.tolak.status, 401);
  assert.equal(kosong.tolak.headers.get('Cache-Control'), 'no-store');
  assert.equal((await kosong.tolak.json()).error, 'jwt_tidak_ada');
  const tanpaKonfig = await gerbang(new Request('https://admin.contoh.test/'), {});
  assert.equal(tanpaKonfig.tolak.status, 503);
});
