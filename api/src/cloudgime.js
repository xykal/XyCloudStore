/**
 * Proksi publik ke API CloudGime (sewa PC fisik mitra).
 *
 * Worker yang menghitung/meneruskan status — klien Flutter tidak merakit
 * jadwal dari /availability kecuali /status mitra gagal.
 *
 * Waktu selalu ISO 8601 dengan offset +07:00. Jangan melewati parser
 * tanggalServer() di aplikasi (itu menambahkan Z dan geser 7 jam).
 *
 * Nama pemesan diambil dari /availability (sudah tampil di situs mitra)
 * lalu ditempel ke slot sedang/berikutnya. Booking dari APK diteruskan
 * POST ke /bookings mitra supaya muncul di web CloudGime.
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
const MODE_BILLING = new Set(['manual', 'package', 'money']);

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

function kunciMenit(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? Math.round(t / 60000) : null;
}

function slotDari(obj, nowMs) {
  if (!obj || typeof obj !== 'object') return null;
  const mulai = obj.start_at || obj.mulai || gabungWib(obj.booking_date || obj.start_date, obj.start_time);
  const selesai = obj.end_at || obj.selesai || gabungWib(obj.end_date || obj.booking_date, obj.end_time);
  if (!mulai && !selesai) return null;
  const nama = String(obj.booker_name || obj.nama || obj.customer_name || '').trim();
  return {
    mulai: mulai || null,
    selesai: selesai || null,
    sisaMenit: selesai ? sisaDari(selesai, nowMs) : 0,
    ...(nama ? { nama } : {}),
  };
}

function daftarJadwal(avail, nowMs) {
  const bookings = Array.isArray(avail?.bookings) ? avail.bookings : [];
  const keluar = [];
  for (const b of bookings) {
    const st = String(b.status || 'approved').toLowerCase();
    if (st && !['approved', 'pending', 'ongoing', 'waiting'].includes(st)) continue;
    const slot = slotDari(b, nowMs);
    if (!slot?.mulai) continue;
    const pc = String(b.pc_name || b.pcNama || '').trim();
    if (!pc) continue;
    keluar.push({
      pc,
      nama: String(b.booker_name || b.customer_name || b.nama || '').trim(),
      mulai: slot.mulai,
      selesai: slot.selesai,
      status: st || 'approved',
    });
  }
  keluar.sort((a, b) => Date.parse(a.mulai || 0) - Date.parse(b.mulai || 0));
  return keluar;
}

function tempelJadwal(mapped, jadwal, nowMs) {
  mapped.jadwal = jadwal;
  for (const pc of mapped.pcs) {
    const milik = jadwal.filter((j) => j.pc === pc.nama || j.pc === pc.id);
    if (pc.sedang) {
      const k = kunciMenit(pc.sedang.mulai);
      const hit = milik.find((j) => kunciMenit(j.mulai) === k)
        || milik.find((j) => {
          const a = Date.parse(j.mulai || 0);
          const b = Date.parse(j.selesai || 0);
          return Number.isFinite(a) && Number.isFinite(b) && a <= nowMs && nowMs < b;
        });
      if (hit?.nama) pc.sedang = { ...pc.sedang, nama: hit.nama };
    }
    if (pc.berikutnya) {
      const k = kunciMenit(pc.berikutnya.mulai);
      const hit = milik.find((j) => kunciMenit(j.mulai) === k);
      if (hit?.nama) pc.berikutnya = { ...pc.berikutnya, nama: hit.nama };
    }
  }
  return mapped;
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

  async function unduh(url, init = {}) {
    const ctrl = new AbortController();
    const method = String(init.method || 'GET').toUpperCase();
    const batas = method === 'GET' ? timeoutMs : Math.max(timeoutMs, 12_000);
    const t = setTimeout(() => ctrl.abort(), batas);
    try {
      const r = await fetchImpl(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(init.headers || {}),
        },
        signal: ctrl.signal,
        ...(init.body ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) } : {}),
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
      sedang: current ? { mulai: current.mulai, selesai: current.selesai, ...(current.nama ? { nama: current.nama } : {}) } : null,
      berikutnya: next ? { mulai: next.mulai, selesai: next.selesai, ...(next.nama ? { nama: next.nama } : {}) } : null,
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
      jadwal: [],
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
        sedang: sekarang ? { mulai: sekarang.mulai, selesai: sekarang.selesai, ...(sekarang.nama ? { nama: sekarang.nama } : {}) } : null,
        berikutnya: berikutnya ? { mulai: berikutnya.mulai, selesai: berikutnya.selesai, ...(berikutnya.nama ? { nama: berikutnya.nama } : {}) } : null,
      };
    });
    return tempelJadwal({
      sumber: 'cloudgime.my.id',
      serverTime: isoWib(nowMs),
      timezone: 'Asia/Jakarta',
      maintenance,
      pcs,
      jadwal: [],
    }, daftarJadwal(avail, nowMs), nowMs);
  }

  async function status(env = {}) {
    const nowMs = nowFn();
    if (cache.data && nowMs - cache.at < cacheMs) return cache.data;
    const base = baseDari(env);
    let mapped = null;
    let availBody = null;
    try {
      const [st, av] = await Promise.all([
        unduh(`${base}/status`).catch(() => null),
        unduh(`${base}/availability`).catch(() => null),
      ]);
      if (av && av.status >= 200 && av.status < 300) availBody = av.body;
      if (st && st.status >= 200 && st.status < 300 && Array.isArray(st.body?.pcs)) {
        mapped = mapStatus(st.body, nowMs);
      }
    } catch (_) {
      mapped = null;
    }
    if (!mapped) {
      try {
        const cfg = await unduh(`${base}/config`);
        if (cfg.status >= 200 && cfg.status < 300) {
          if (!availBody) {
            try {
              const av = await unduh(`${base}/availability`);
              if (av.status >= 200 && av.status < 300) availBody = av.body;
            } catch (_) { /* availability opsional di fallback */ }
          }
          mapped = dariConfigAvailability(cfg.body, availBody || { bookings: [] }, nowMs);
        }
      } catch (_) {
        mapped = null;
      }
    } else {
      mapped = tempelJadwal(mapped, daftarJadwal(availBody, nowMs), nowMs);
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
      bayar: Math.round(angka(body.pay_amount ?? body.bayar ?? body.estimated_total, 0)),
      paymentStatus: String(pay.status || body.payment_status || ''),
      bisaReschedule: body.can_reschedule === true || body.bisaReschedule === true,
      token: String(body.token || body.access_token || ''),
      rescheduleToken: String(body.reschedule_token || ''),
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

  function bersihkanBuat(mentah) {
    const b = mentah && typeof mentah === 'object' ? mentah : {};
    const customer_name = String(b.customer_name || b.nama || '').trim().slice(0, 80);
    const customer_phone = String(b.customer_phone || b.telepon || '').replace(/[^\d+]/g, '').slice(0, 20);
    const pc_name = String(b.pc_name || b.pcNama || '').trim().slice(0, 40);
    const booking_date = String(b.booking_date || b.tanggal || '').slice(0, 10);
    const start_time = String(b.start_time || b.jam || '').slice(0, 5);
    const duration_minutes = Math.round(angka(b.duration_minutes ?? b.durasiMenit, 0));
    const billing_mode = MODE_BILLING.has(String(b.billing_mode || '')) ? String(b.billing_mode) : 'manual';
    const note = String(b.note || b.catatan || '').trim().slice(0, 300);
    const payment_proof = String(b.payment_proof || b.bukti || '');
    const package_id = billing_mode === 'package' ? (String(b.package_id || '').slice(0, 80) || null) : null;
    const expectedRaw = b.expected_payment_amount ?? b.bayar;
    const expected_payment_amount = expectedRaw == null || expectedRaw === '' ? null : angka(expectedRaw, NaN);
    if (customer_name.length < 2) {
      throw new CloudGimeError('Nama pemesan tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (!/^\+?\d{8,16}$/.test(customer_phone)) {
      throw new CloudGimeError('Nomor WhatsApp tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (!pc_name) {
      throw new CloudGimeError('Pilih PC yang akan dipesan.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) {
      throw new CloudGimeError('Tanggal booking tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (!/^\d{2}:\d{2}$/.test(start_time)) {
      throw new CloudGimeError('Jam mulai tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (!Number.isFinite(duration_minutes) || duration_minutes < 30 || duration_minutes > 1440) {
      throw new CloudGimeError('Durasi booking tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    if (payment_proof.length > 1_600_000) {
      throw new CloudGimeError('Bukti transfer terlalu besar.', { status: 413, code: 'TOO_LARGE' });
    }
    if (expected_payment_amount != null && !Number.isFinite(expected_payment_amount)) {
      throw new CloudGimeError('Nominal pembayaran tidak valid.', { status: 400, code: 'BAD_BOOKING' });
    }
    const request_id = String(b.request_id || crypto.randomUUID()).slice(0, 80);
    return {
      customer_name,
      customer_phone,
      pc_name,
      booking_date,
      start_time,
      duration_minutes,
      billing_mode,
      package_id,
      note,
      payment_proof,
      expected_payment_amount,
      request_id,
    };
  }

  async function buat(env, mentah) {
    const data = bersihkanBuat(mentah);
    const base = baseDari(env);
    let r;
    try {
      r = await unduh(`${base}/bookings`, { method: 'POST', body: data });
    } catch (e) {
      if (e instanceof CloudGimeError) throw e;
      throw new CloudGimeError('Server CloudGime tidak dapat dihubungi.', { status: 502, code: 'UPSTREAM_DOWN' });
    }
    if (r.status === 429) {
      throw new CloudGimeError('Terlalu banyak permintaan ke CloudGime.', {
        status: 429,
        code: r.body?.code || 'RATE_LIMIT',
      });
    }
    if (r.status === 400 || r.status === 409 || r.status === 422) {
      throw new CloudGimeError(r.body?.error || 'Data booking tidak valid.', {
        status: 400,
        code: r.body?.code || 'BAD_BOOKING',
      });
    }
    if (r.status < 200 || r.status >= 300) {
      throw new CloudGimeError(r.body?.error || 'Booking gagal dikirim ke CloudGime.', {
        status: r.status >= 400 && r.status < 500 ? r.status : 502,
        code: r.body?.code || 'UPSTREAM_DOWN',
      });
    }
    const body = r.body && typeof r.body === 'object' ? r.body : {};
    const booking = body.booking && typeof body.booking === 'object' ? body.booking : body;
    const mapped = mapBooking({
      ...booking,
      pay_amount: body.pay_amount ?? booking.pay_amount ?? booking.estimated_total,
      reschedule_token: body.reschedule_token ?? booking.reschedule_token,
      token: body.token ?? booking.token,
    });
    cache = { at: 0, data: null };
    return mapped;
  }

  return {
    status,
    booking,
    buat,
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

export function buatBookingCloudGime(env, body) {
  return bawaan.buat(env, body);
}
