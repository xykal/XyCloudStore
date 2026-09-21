// Named tunnel Cloudflare per unit PC — XY-RELAY v1 mode "named".
//
// Token Cloudflare (CF_API_TOKEN, secret Worker) HANYA ada di sisi Worker.
// Agen meminta setup sekali per sesi via POST /agen/relay/named dan menerima
// {hostname, tunnel_token}; token itu lalu dipakai agen untuk menjalankan
// `cloudflared tunnel run --token ...`. Quick tunnel tetap jadi fallback bila
// named gagal (kode agen), sehingga sewa tidak mati saat API CF gangguan.
//
// Alur per agen (idempotent):
//   1. hostname tetap: relay-<slug-id-agen>.xycloud.my.id
//   2. bila agen.cf_tunnel_id ada -> verifikasi tunnel via API; bila hilang,
//      buat ulang. Ambil tunnel token via GET .../token.
//   3. bila belum ada -> create tunnel, PUT ingress (hostname -> 127.0.0.1:48101),
//      create DNS CNAME, simpan cf_tunnel_id + cf_hostname.
//   4. DELETE /agen/relay/named -> hapus DNS + tunnel, kosongkan kolom.
//
// Untuk test: env.CF_MOCK==='1' memakai simulasi lokal tanpa fetch keluar.

const CF_API = 'https://api.cloudflare.com/client/v4';
const DOMAIN = 'xycloud.my.id';
export const RELAY_PORT_TETAP = 48101;

export function fail(pesan, status = 400) {
  const e = new Error(pesan);
  e.status = status;
  throw e;
}

/** Slug DNS aman dari id agen: huruf kecil, angka, strip, maks 24 char. */
export function slugAgen(id) {
  const s = String(id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 24);
  if (!s) fail('ID agen tidak valid untuk hostname.', 500);
  return s;
}

export function hostnameUntuk(agen) {
  return `relay-${slugAgen(agen.id)}.${DOMAIN}`;
}

/** Panggil API Cloudflare; lempar Error berstatus bila gagal. */
async function cf(env, path, method = 'GET', data) {
  if (env.CF_MOCK === '1') return mockCf(path, method, data);
  const token = env.CF_API_TOKEN || '';
  if (!token) fail('Relay named belum dikonfigurasi (token Cloudflare kosong).', 503);
  let r;
  try {
    r = await fetch(CF_API + path, {
      method,
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      ...(data !== undefined ? {body: JSON.stringify(data)} : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    fail('Cloudflare tidak menjawab: ' + String(e && e.message || e).slice(0, 120), 502);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const info = ((j.errors || []).map((x) => x.message).join('; ') || ('HTTP ' + r.status)).slice(0, 200);
    fail('Cloudflare: ' + info, r.status === 404 ? 404 : 502);
  }
  return j.result;
}

let cacheAkun = '';
async function akunId(env) {
  if (env.CF_MOCK === '1') return 'akun-mock';
  if (env.CF_ACCOUNT_ID) return env.CF_ACCOUNT_ID;
  if (cacheAkun) return cacheAkun;
  const daftar = await cf(env, '/accounts?per_page=5');
  if (!daftar || !daftar.length) fail('Akun Cloudflare tidak ditemukan.', 503);
  cacheAkun = daftar[0].id;
  return cacheAkun;
}

async function zonaId(env) {
  const daftar = await cf(env, '/zones?name=' + DOMAIN + '&status=active');
  if (!daftar || !daftar.length) fail(`Zona ${DOMAIN} tidak aktif.`, 503);
  return daftar[0].id;
}

/** Simulasi stateful-minimal API CF untuk test (tanpa network). */
const mockDb = {tunnel: {}, dns: {}};
function mockCf(path, method, data) {
  const mTun = path.match(/\/accounts\/[^/]+\/cfd_tunnel(?:\/([^/]+))?(\/\w+)?/);
  if (mTun && !mTun[1] && method === 'POST') {
    const nama = String((data && data.name) || 'mock');
    const id = 'tun-mock-' + nama.replace(/[^a-z0-9]+/gi, '-').slice(0, 30);
    mockDb.tunnel[id] = {id, name: nama};
    return {id, name: nama, token: 'token-mock-untuk-' + nama};
  }
  if (mTun && mTun[1]) {
    const t = mockDb.tunnel[mTun[1]];
    if (!t) fail('Cloudflare: HTTP 404', 404);
    if (mTun[2] === '/token') return 'token-mock-untuk-' + t.name;
    if (mTun[2] === '/configurations' && method === 'PUT') return {config: (data && data.config) || {}};
    if (!mTun[2] && method === 'DELETE') {
      delete mockDb.tunnel[mTun[1]];
      return {id: mTun[1]};
    }
    if (!mTun[2]) return t;
  }
  if (path.startsWith('/zones?')) return [{id: 'zona-mock', name: DOMAIN}];
  const mDns = path.match(/\/zones\/([^/]+)\/dns_records(?:\/([^/]+))?/);
  if (mDns && method === 'POST') {
    const id = 'dns-mock-' + String(data.name).replace(/[^a-z0-9]+/gi, '-');
    mockDb.dns[id] = {id, name: data.name, content: data.content};
    return {id, ...mockDb.dns[id]};
  }
  if (mDns && mDns[2] && method === 'DELETE') {
    delete mockDb.dns[mDns[2]];
    return {id: mDns[2]};
  }
  if (mDns && method === 'GET') return Object.values(mockDb.dns);
  fail('Mock CF: endpoint tak dikenal ' + path, 500);
}

/**
 * Pastikan tunnel+DNS unit ini ada. Kembalikan {tunnel_id, hostname, tunnel_token}.
 * Idempotent: aman dipanggil tiap mulai_sesi.
 */
export async function pastikanTunnel(env, agen) {
  const hostname = hostnameUntuk(agen);
  const akun = await akunId(env);
  let tunnelId = agen.cf_tunnel_id || '';
  let perluDns = true;

  if (tunnelId) {
    try {
      await cf(env, `/accounts/${akun}/cfd_tunnel/${tunnelId}`);
    } catch (e) {
      if (e.status !== 404) throw e;
      tunnelId = ''; // tunnel dihapus -> buat ulang
    }
    // CATATAN: API CF mengembalikan HTTP 200 basi untuk tunnel yang sudah
    // dihapus (terbukti 2026-09-21: GET + GET token tetap 200, hanya LIST yang
    // benar). Deteksi penghapusan manual di dashboard TIDAK bisa dari sini;
    // agen yang mendeteksinya (cloudflared "Unauthorized: Tunnel not found")
    // lalu memanggil DELETE endpoint ini untuk reset + coba lagi sekali.
  }
  if (!tunnelId) {
    const nama = 'xyr-' + slugAgen(agen.id);
    const buat = await cf(env, `/accounts/${akun}/cfd_tunnel`, 'POST', {name: nama});
    tunnelId = buat.id;
    await cf(env, `/accounts/${akun}/cfd_tunnel/${tunnelId}/configurations`, 'PUT', {
      config: {ingress: [
        {hostname, service: `http://127.0.0.1:${RELAY_PORT_TETAP}`},
        {service: 'http_status:404'},
      ]},
    });
  } else if (agen.cf_hostname === hostname) {
    // Tunnel lama masih ada dan hostname sama -> DNS kemungkinan sudah ada.
    // Tetap pastikan ingress menunjuk port tetap (murah, idempotent).
    try {
      await cf(env, `/accounts/${akun}/cfd_tunnel/${tunnelId}/configurations`, 'PUT', {
        config: {ingress: [
          {hostname, service: `http://127.0.0.1:${RELAY_PORT_TETAP}`},
          {service: 'http_status:404'},
        ]},
      });
      perluDns = false;
    } catch (e) { /* abaikan; token di bawah yang penting */ }
  }
  if (perluDns) {
    const zid = await zonaId(env);
    const ada = await cf(env, `/zones/${zid}/dns_records?type=CNAME&name=${hostname}`);
    if (!ada || !ada.length) {
      await cf(env, `/zones/${zid}/dns_records`, 'POST', {
        type: 'CNAME', name: hostname.split('.')[0],
        content: `${tunnelId}.cfargotunnel.com`, proxied: true,
        comment: 'XY-RELAY named per unit (otomatis)',
      });
    }
  }
  const token = await cf(env, `/accounts/${akun}/cfd_tunnel/${tunnelId}/token`);
  await env.DB.prepare('UPDATE agen SET cf_tunnel_id=?, cf_hostname=? WHERE id=?')
    .bind(tunnelId, hostname, agen.id).run();
  return {tunnel_id: tunnelId, hostname, tunnel_token: token};
}

/**
 * Hapus DNS + tunnel unit (dipakai saat unit dihapus/direset, dan oleh agen
 * untuk self-healing saat token ditolak). 404 = sudah hilang = sukses.
 * Kegagalan non-404 dilaporkan (kolom DB dipertahankan agar bisa di-retry,
 * menghindari tunnel yatim).
 */
export async function hapusTunnel(env, agen) {
  const akun = await akunId(env);
  const hostname = agen.cf_hostname || hostnameUntuk(agen);
  const gagal = [];
  try {
    const zid = await zonaId(env);
    const ada = await cf(env, `/zones/${zid}/dns_records?type=CNAME&name=${hostname}`);
    for (const r of (ada || [])) {
      await cf(env, `/zones/${zid}/dns_records/${r.id}`, 'DELETE');
    }
  } catch (e) {
    if (e.status !== 404) gagal.push('dns: ' + e.message);
  }
  if (agen.cf_tunnel_id) {
    try {
      await cf(env, `/accounts/${akun}/cfd_tunnel/${agen.cf_tunnel_id}?cascade=true`, 'DELETE');
    } catch (e) {
      if (e.status !== 404) gagal.push('tunnel: ' + e.message);
    }
  }
  if (gagal.length) fail('Gagal hapus sebagian: ' + gagal.join('; ').slice(0, 200), 502);
  await env.DB.prepare('UPDATE agen SET cf_tunnel_id=NULL, cf_hostname=NULL WHERE id=?')
    .bind(agen.id).run();
  return {ok: true};
}
