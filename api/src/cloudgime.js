/**
 * Proksi publik ke API CloudGime (sewa PC fisik mitra).
 *
 * Worker yang menghitung/meneruskan status — klien Flutter tidak merakit
 * jadwal dari /availability kecuali /status mitra gagal.
 *
 * Waktu selalu ISO 8601 dengan offset +07:00. Jangan melewati parser
 * tanggalServer() di aplikasi (itu menambahkan Z dan geser 7 jam).
 */

export class CloudGimeError extends Error {
  constructor(message, { status = 502, code = 'UPSTREAM_DOWN' } = {}) {
    super(message);
    this.name = 'CloudGimeError';
    this.status = status;
    this.code = code;
  }
}

const STATE = {
  available: 'tersedia',
  in_use: 'dipakai',
  disabled: 'nonaktif',
  maintenance: 'maintenance',
};

const DEFAULT_BASE = 'https://cloudgime.my.id/api/booking';
const TIMEOUT_MS = 8000;
const CACHE_MS = 20_000;
const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

function isoWib(ms) {
  const local = new Date(ms + 7 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`
    + `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}+07:00`;
}

function gabungWib(tanggal, jam) {
  const tgl = String(tanggal || '').slice(0, 10);
  const jm = String(jam || '00:00').padStart(5, '0').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return null;
  if (!/^\d{2}:\d{2}$/.test(jm)) return null;
  return `${tgl}T${jm}:00+07:00`;
}

function sisaDari(endAt, nowMs) {
  const t = Date.parse(endAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - nowMs) / 60000));
}

function angka(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {() => number} [opts.now]
 * @param {string} [opts.base]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.cacheMs]
 */
export function buatCloudGime(opts = {}) {
  let cache = { at: 0, data: null };
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const cacheMs = opts.cacheMs ?? CACHE_MS;
  const fetchImpl = opts.fetchImpl || globalThis.fetch.bind(globalThis);
  const nowFn = opts.now || Date.now;

  function baseDari(env) {
    const raw = env?.CLOUDGIME_BASE || opts.base || DEFAULT_BASE;
    return String(raw).replace(/\/$/, '');
  }

  async function unduh(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: ctrl.signal,
      });
      const text = await r.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      return { status: r.status, body };
    } catch (e) {
      const abort = e?.name === 'AbortError' || /abort/i.test(String(e?.message || e));
      throw new CloudGimeError(
        abort
          ? 'Server CloudGime tidak merespons.'
          : 'Server CloudGime tidak dapat dihubungi.',
        { status: 502, code: 'UPSTREAM_DOWN' },
      );
    } finally {
      clearTimeout(t);
    }
  }

  function slotDari(obj, nowMs) {
    if (!obj || typeof obj !== 'object') return null;
    const mulai = obj.start_at || obj.mulai || gabungWib(obj.booking_date || obj.start_date, obj.start_time);
    const selesai = obj.end_at || obj.selesai || gabungWib(obj.end_date || obj.booking_date, obj.end_time);
    if (!mulai && !selesai) return null;
    return {
      mulai: mulai || null,
      selesai: selesai || null,
      sisaMenit: selesai ? sisaDari(selesai, nowMs) : 0,
    };
  }

  function mapPc(pc, { maintenance, nowMs }) {
    const state = String(pc.state || pc.status || '').toLowerCase();
    let keadaan = STATE[state] || (state === 'available' ? 'tersedia' : 'nonaktif');
    if (maintenance && keadaan === 'tersedia') keadaan = 'maintenance';
    if (state === 'maintenance') keadaan = 'maintenance';
    const current = pc.current ? slotDari(pc.current, nowMs) : null;
    const next = pc.next ? slotDari(pc.next, nowMs) : null;
    const sisa = angka(pc.current?.remaining_minutes, current?.sisaMenit || 0);
    return {
      id: String(pc.id || pc.name || pc.nama || ''),
      nama: String(pc.name || pc.nama || pc.id || 'PC'),
      spek: String(pc.spec || pc.spek || ''),
      hargaPerJam: Math.round(angka(pc.price_per_hour ?? pc.pricePerHour ?? pc.hargaPerJam, 0)),
      keadaan,
      sisaMenit: keadaan === 'dipakai' ? sisa : 0,
      sedang: current ? { mulai: current.mulai, selesai: current.selesai } : null,
      berikutnya: next ? { mulai: next.mulai, selesai: next.selesai } : null,
    };
  }

  function mapStatus(raw, nowMs) {
    const maintenance = Boolean(raw.maintenance?.enabled ?? raw.maintenance);
    const pcs = Array.isArray(raw.pcs) ? raw.pcs.map((pc) => mapPc(pc, { maintenance, nowMs })) : [];
    return {
      sumber: 'cloudgime.my.id',
      serverTime: String(raw.server_time || raw.serverTime || isoWib(nowMs)),
      timezone: String(raw.timezone || 'Asia/Jakarta'),
      maintenance,
      pcs,
    };
  }

  function dariConfigAvailability(cfg, avail, nowMs) {
    const maintenance = Boolean(cfg?.maintenance?.enabled ?? cfg?.maintenance);
    const bookings = Array.isArray(avail?.bookings) ? avail.bookings : [];
    const pcsSrc = Array.isArray(cfg?.pcs) ? cfg.pcs : [];
    const pcs = pcsSrc.map((pc) => {
      const nama = String(pc.name || pc.nama || pc.id || '');
      const milik = bookings.filter((b) => String(b.pc_name || b.pcNama || '') === nama);
      const slots = milik.map((b) => slotDari(b, nowMs)).filter(Boolean)
        .sort((a, b) => Date.parse(a.mulai || 0) - Date.parse(b.mulai || 0));
      const sekarang = slots.find((s) => {
        const a = Date.parse(s.mulai || 0);
        const b = Date.parse(s.selesai || 0);
        return Number.isFinite(a) && Number.isFinite(b) && a <= nowMs && nowMs < b;
      }) || null;
      const berikutnya = slots.find((s) => Date.parse(s.mulai || 0) > nowMs) || null;
      const st = String(pc.status || pc.state || 'available').toLowerCase();
      let keadaan = STATE[st] || (st === 'available' ? 'tersedia' : 'nonaktif');
      if (sekarang) keadaan = 'dipakai';
      if (maintenance) keadaan = 'maintenance';
      if (st === 'disabled' || st === 'nonaktif') keadaan = 'nonaktif';
      return {
        id: String(pc.id || nama),
        nama: nama || 'PC',
        spek: String(pc.spec || pc.spek || ''),
        hargaPerJam: Math.round(angka(pc.pricePerHour ?? pc.price_per_hour, 0)),
        keadaan,
        sisaMenit: sekarang ? sekarang.sisaMenit : 0,
        sedang: sekarang ? { mulai: sekarang.mulai, selesai: sekarang.selesai } : null,
        berikutnya: berikutnya ? { mulai: berikutnya.mulai, selesai: berikutnya.selesai } : null,
      };
    });
    return {
      sumber: 'cloudgime.my.id',
      serverTime: isoWib(nowMs),
      timezone: 'Asia/Jakarta',
      maintenance,
      pcs,
    };
  }

  async function status(env = {}) {
    const nowMs = nowFn();
    if (cache.data && nowMs - cache.at < cacheMs) return cache.data;
    const base = baseDari(env);
    let mapped = null;
    try {
      const r = await unduh(`${base}/status`);
      if (r.status >= 200 && r.status < 300 && Array.isArray(r.body?.pcs)) {
        mapped = mapStatus(r.body, nowMs);
      }
    } catch (_) {
      mapped = null;
    }
    if (!mapped) {
      try {
        const [cfg, avail] = await Promise.all([
          unduh(`${base}/config`),
          unduh(`${base}/availability`),
        ]);
        if (cfg.status >= 200 && cfg.status < 300) {
          mapped = dariConfigAvailability(cfg.body, avail.status < 300 ? avail.body : { bookings: [] }, nowMs);
        }
      } catch (_) {
        mapped = null;
      }
    }
    if (!mapped) {
      throw new CloudGimeError('Server CloudGime tidak dapat dihubungi.', { status: 502, code: 'UPSTREAM_DOWN' });
    }
    cache = { at: nowMs, data: mapped };
    return mapped;
  }

  function mapBooking(body) {
    const pay = body.payment && typeof body.payment === 'object' ? body.payment : {};
    return {
      id: String(body.id || ''),
      status: String(body.status || 'pending'),
      pcNama: String(body.pc_name || body.pcNama || ''),
      mulai: body.start_at || body.mulai || gabungWib(body.booking_date, body.start_time),
      selesai: body.end_at || body.selesai || gabungWib(body.end_date || body.booking_date, body.end_time),
      durasiMenit: Math.round(angka(body.duration_minutes ?? body.durasiMenit, 0)),
      bayar: Math.round(angka(body.pay_amount ?? body.bayar, 0)),
      paymentStatus: String(pay.status || body.payment_status || ''),
      bisaReschedule: body.can_reschedule === true || body.bisaReschedule === true,
    };
  }

  async function booking(env, id, token) {
    const sid = String(id || '');
    const tok = String(token || '');
    // Token salah / id aneh → 404 seragam (jangan bocorkan apakah id ada).
    if (!ID_OK.test(sid) || tok.length < 4 || tok.length > 240) {
      throw new CloudGimeError('Booking tidak ditemukan', { status: 404, code: 'NOT_FOUND' });
    }
    const base = baseDari(env);
    const url = `${base}/bookings/${encodeURIComponent(sid)}?token=${encodeURIComponent(tok)}`;
    let r;
    try {
      r = await unduh(url);
    } catch (e) {
      if (e instanceof CloudGimeError) throw e;
      throw new CloudGimeError('Server CloudGime tidak dapat dihubungi.', { status: 502, code: 'UPSTREAM_DOWN' });
    }
    if (r.status === 404) {
      throw new CloudGimeError(r.body?.error || 'Booking tidak ditemukan', {
        status: 404,
        code: r.body?.code || 'NOT_FOUND',
      });
    }
    if (r.status === 429) {
      throw new CloudGimeError('Terlalu banyak permintaan ke CloudGime.', {
        status: 429,
        code: r.body?.code || 'RATE_LIMIT',
      });
    }
    if (r.status < 200 || r.status >= 300) {
      throw new CloudGimeError('Server CloudGime tidak dapat dihubungi.', { status: 502, code: 'UPSTREAM_DOWN' });
    }
    return mapBooking(r.body || {});
  }

  return {
    status,
    booking,
    /** @internal uji */
    _cache: () => cache,
    _setCache: (c) => { cache = c; },
  };
}

const bawaan = buatCloudGime();

export function statusCloudGime(env) {
  return bawaan.status(env);
}

export function bookingCloudGime(env, id, token) {
  return bawaan.booking(env, id, token);
}
