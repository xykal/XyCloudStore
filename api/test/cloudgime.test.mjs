/**
 * Uji proksi CloudGime: pemetaan state, cache 20 dtk, fallback, timeout, booking.
 * Fetch mitra di-inject — tes tidak memanggil cloudgime.my.id.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buatCloudGime, CloudGimeError } from '../src/cloudgime.js';
import { harness } from './harness.mjs';

function jsonRes(status, body) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

function mockFetch(peta, { delayMs = 0 } = {}) {
  const panggil = [];
  const fetchImpl = async (url, init) => {
    panggil.push(String(url));
    if (init?.signal?.aborted) {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    for (const [kunci, nilai] of Object.entries(peta)) {
      if (path.includes(kunci) || String(url).includes(kunci)) {
        if (typeof nilai === 'function') return nilai(url, init);
        return jsonRes(nilai.status ?? 200, nilai.body ?? nilai);
      }
    }
    return jsonRes(404, { error: 'tidak ada', code: 'NOT_FOUND' });
  };
  fetchImpl.panggil = panggil;
  return fetchImpl;
}

const STATUS_OK = {
  server_time: '2026-09-20T20:25:00+07:00',
  timezone: 'Asia/Jakarta',
  maintenance: false,
  pcs: [
    {
      id: 'PC 1',
      name: 'PC 1',
      spec: 'E5 + GTX 1080',
      price_per_hour: 6000,
      state: 'in_use',
      current: {
        start_at: '2026-09-20T19:01:00+07:00',
        end_at: '2026-09-21T01:01:00+07:00',
        remaining_minutes: 158,
      },
      next: {
        start_at: '2026-09-21T15:20:00+07:00',
        end_at: '2026-09-21T16:20:00+07:00',
      },
    },
    {
      id: 'PC 2',
      name: 'PC 2',
      spec: 'Ryzen',
      price_per_hour: 6000,
      state: 'available',
      current: null,
      next: null,
    },
  ],
};

test('CloudGime: in_use→dipakai, available→tersedia, sisa menit dari mitra', async () => {
  const fetchImpl = mockFetch({ '/status': STATUS_OK });
  const cg = buatCloudGime({ fetchImpl, now: () => Date.parse('2026-09-20T22:23:00+07:00') });
  const d = await cg.status({});
  assert.equal(d.pcs.length, 2);
  assert.equal(d.pcs[0].keadaan, 'dipakai');
  assert.equal(d.pcs[0].sisaMenit, 158);
  assert.equal(d.pcs[0].sedang.mulai, '2026-09-20T19:01:00+07:00');
  assert.match(d.pcs[0].sedang.selesai, /\+07:00$/);
  assert.equal(d.pcs[1].keadaan, 'tersedia');
  assert.equal(d.pcs[1].sisaMenit, 0);
  assert.equal(d.serverTime, '2026-09-20T20:25:00+07:00');
  assert.equal(d.maintenance, false);
  assert.ok(Array.isArray(d.jadwal));
});

test('CloudGime: nama pemesan dari /availability menempel ke slot + jadwal', async () => {
  const fetchImpl = mockFetch({
    '/status': STATUS_OK,
    '/availability': {
      bookings: [
        {
          pc_name: 'PC 1',
          booking_date: '2026-09-20',
          start_time: '19:01',
          end_date: '2026-09-21',
          end_time: '01:01',
          status: 'approved',
          booker_name: 'Oji',
        },
        {
          pc_name: 'PC 2',
          booking_date: '2026-09-21',
          start_time: '15:20',
          end_date: '2026-09-21',
          end_time: '16:20',
          status: 'approved',
          booker_name: 'Jerrzzz',
        },
      ],
    },
  });
  const d = await buatCloudGime({
    fetchImpl,
    now: () => Date.parse('2026-09-20T22:23:00+07:00'),
  }).status({});
  assert.equal(d.pcs[0].sedang.nama, 'Oji');
  assert.equal(d.jadwal.length, 2);
  assert.equal(d.jadwal[0].nama, 'Oji');
  assert.equal(d.jadwal[0].pc, 'PC 1');
  assert.match(d.jadwal[0].mulai, /\+07:00$/);
});

test('CloudGime: disabled→nonaktif', async () => {
  const fetchImpl = mockFetch({
    '/status': {
      server_time: '2026-09-20T20:00:00+07:00',
      pcs: [{ id: 'PC 3', name: 'PC 3', state: 'disabled', current: null, next: null }],
    },
  });
  const d = await buatCloudGime({ fetchImpl }).status({});
  assert.equal(d.pcs[0].keadaan, 'nonaktif');
});

test('CloudGime: cache 20 detik — fetch /status hanya sekali', async () => {
  let sekarang = 1_000_000;
  const fetchImpl = mockFetch({ '/status': STATUS_OK });
  const cg = buatCloudGime({ fetchImpl, now: () => sekarang, cacheMs: 20_000 });
  await cg.status({});
  await cg.status({});
  sekarang += 19_000;
  await cg.status({});
  assert.equal(fetchImpl.panggil.filter((u) => u.includes('/status')).length, 1);
  sekarang += 2_000;
  await cg.status({});
  assert.equal(fetchImpl.panggil.filter((u) => u.includes('/status')).length, 2);
});

test('CloudGime: fallback /config+/availability bila /status non-200', async () => {
  const fetchImpl = mockFetch({
    '/status': { status: 500, body: { error: 'boom' } },
    '/config': {
      maintenance: { enabled: false },
      pcs: [
        { id: 'PC 1', name: 'PC 1', spec: 'E5', pricePerHour: 6000, status: 'available' },
        { id: 'PC 2', name: 'PC 2', spec: 'R5', pricePerHour: 6000, status: 'available' },
      ],
    },
    '/availability': {
      bookings: [
        {
          pc_name: 'PC 1',
          booking_date: '2026-09-20',
          start_time: '19:01',
          end_date: '2026-09-21',
          end_time: '01:01',
          status: 'approved',
        },
      ],
    },
  });
  const now = Date.parse('2026-09-20T20:00:00+07:00');
  const d = await buatCloudGime({ fetchImpl, now: () => now }).status({});
  assert.equal(d.pcs[0].keadaan, 'dipakai');
  assert.equal(d.pcs[0].sedang.mulai, '2026-09-20T19:01:00+07:00');
  assert.equal(d.pcs[0].sedang.selesai, '2026-09-21T01:01:00+07:00');
  assert.ok(d.pcs[0].sisaMenit > 0);
  assert.equal(d.pcs[1].keadaan, 'tersedia');
  assert.match(d.serverTime, /\+07:00$/);
});

test('CloudGime: timeout → UPSTREAM_DOWN 502', async () => {
  const fetchImpl = mockFetch({ '/status': STATUS_OK }, { delayMs: 500 });
  const cg = buatCloudGime({ fetchImpl, timeoutMs: 20 });
  await assert.rejects(
    () => cg.status({}),
    (e) => e instanceof CloudGimeError && e.code === 'UPSTREAM_DOWN' && e.status === 502,
  );
});

test('CloudGime: booking token/id tidak valid → 404 tanpa fetch', async () => {
  const fetchImpl = mockFetch({});
  const cg = buatCloudGime({ fetchImpl });
  await assert.rejects(
    () => cg.booking({}, 'x', ''),
    (e) => e.status === 404 && e.code === 'NOT_FOUND',
  );
  await assert.rejects(
    () => cg.booking({}, '../etc', 'tokenkuu'),
    (e) => e.status === 404,
  );
  assert.equal(fetchImpl.panggil.length, 0);
});

test('CloudGime: booking 404 mitra diteruskan; 200 dipetakan', async () => {
  const fetchImpl = mockFetch({
    '/bookings/b_8f2a1c': (url) => {
      assert.equal(String(url).includes('token='), true);
      if (String(url).includes('token=salah')) {
        return jsonRes(404, { error: 'Booking tidak ditemukan', code: 'NOT_FOUND' });
      }
      return jsonRes(200, {
        id: 'b_8f2a1c',
        status: 'approved',
        pc_name: 'PC 2',
        start_at: '2026-09-20T19:09:00+07:00',
        end_at: '2026-09-20T22:19:00+07:00',
        duration_minutes: 190,
        pay_amount: 19000,
        payment: { status: 'verified' },
        can_reschedule: true,
      });
    },
  });
  const cg = buatCloudGime({ fetchImpl });
  await assert.rejects(
    () => cg.booking({}, 'b_8f2a1c', 'salahxxxx'),
    (e) => e.status === 404 && e.code === 'NOT_FOUND',
  );
  const d = await cg.booking({}, 'b_8f2a1c', 'token-asli-xyz');
  assert.equal(d.status, 'approved');
  assert.equal(d.pcNama, 'PC 2');
  assert.equal(d.bayar, 19000);
  assert.equal(d.paymentStatus, 'verified');
  assert.equal(d.bisaReschedule, true);
  assert.match(d.mulai, /\+07:00$/);
});

test('CloudGime: booking 429 diteruskan', async () => {
  const fetchImpl = mockFetch({
    '/bookings/b_1': { status: 429, body: { error: 'rate', code: 'RATE_LIMIT' } },
  });
  await assert.rejects(
    () => buatCloudGime({ fetchImpl }).booking({}, 'b_1', 'token-asli'),
    (e) => e.status === 429 && e.code === 'RATE_LIMIT',
  );
});

test('Rute Worker: /cloudgime/status dan booking publik; lolos pemeliharaan', async () => {
  const { mf, db, call } = await harness();
  try {
    const kosong = await call('/cloudgime/booking/x');
    assert.equal(kosong.status, 404, 'tanpa token harus 404, bukan 401');
    assert.equal(kosong.json.code, 'NOT_FOUND');
    assert.equal(kosong.json.data, undefined, 'err() tidak membungkus {data}');

    await db.prepare("INSERT INTO setelan(kunci,nilai) VALUES('mode_pemeliharaan','1')").run();
    await db.prepare("INSERT INTO setelan(kunci,nilai) VALUES('pemeliharaan_cakupan','semua')").run();

    const st = await call('/cloudgime/status');
    assert.notEqual(st.status, 503, 'CloudGime harus lolos gate pemeliharaan');
    assert.notEqual(st.status, 401);
    assert.notEqual(st.status, 404);
    assert.ok([200, 502].includes(st.status), `status aktual ${st.status}`);
    if (st.status === 200) {
      assert.ok(st.json.data, 'json() membungkus {data}');
      assert.ok(Array.isArray(st.json.data.pcs));
      assert.equal(st.json.data.data, undefined, 'jangan bungkus dua kali');
    } else {
      assert.equal(st.json.code, 'UPSTREAM_DOWN');
    }

    const me = await call('/me');
    assert.equal(me.status, 503, 'endpoint biasa tetap kena pemeliharaan');
  } finally {
    await mf.dispose();
  }
});


test('CloudGime: POST booking divalidasi lalu diteruskan ke mitra', async () => {
  const panggil = [];
  const fetchImpl = async (url, init) => {
    panggil.push({ url: String(url), init });
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (path.endsWith('/bookings') && init?.method === 'POST') {
      const b = JSON.parse(init.body);
      assert.equal(b.customer_name, 'Budi');
      assert.equal(b.customer_phone, '081234567890');
      assert.equal(b.pc_name, 'PC 1');
      assert.equal(b.billing_mode, 'manual');
      assert.ok(b.request_id);
      return jsonRes(200, {
        booking: {
          id: 'b_baru',
          status: 'pending',
          pc_name: 'PC 1',
          booking_date: '2026-09-21',
          start_time: '15:00',
          end_time: '16:00',
          duration_minutes: 60,
        },
        pay_amount: 6000,
        reschedule_token: 'r_abc',
      });
    }
    return jsonRes(404, { error: 'tidak ada' });
  };
  const cg = buatCloudGime({ fetchImpl });
  await assert.rejects(
    () => cg.buat({}, { customer_name: 'B', customer_phone: '12', pc_name: 'PC 1' }),
    (e) => e.status === 400 && e.code === 'BAD_BOOKING',
  );
  const d = await cg.buat({}, {
    customer_name: 'Budi',
    customer_phone: '081234567890',
    pc_name: 'PC 1',
    booking_date: '2026-09-21',
    start_time: '15:00',
    duration_minutes: 60,
  });
  assert.equal(d.id, 'b_baru');
  assert.equal(d.status, 'pending');
  assert.equal(d.pcNama, 'PC 1');
  assert.equal(d.bayar, 6000);
  assert.equal(d.rescheduleToken, 'r_abc');
  assert.equal(panggil.length, 1);
});
