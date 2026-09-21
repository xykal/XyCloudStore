import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

// ---------------------------------------------------------------------------
// XY-RELAY mode named: Worker membuatkan tunnel+DNS per unit (CF_MOCK=1 agar
// test tidak menyentuh api.cloudflare.com asli).
// ---------------------------------------------------------------------------
test('Relay named: setup idempotent, token kembali, hapus bersih',
     {timeout: 120000}, async () => {
  const {mf, db, call} = await harness({CF_MOCK: '1'});
  try {
    const agen = (path, method, body, kode = 'test-agent') =>
      call(path, method, body, {'x-agen-kode': kode});
    const ambil = async (sql, kolom, ...bind) => (await db.prepare(sql).bind(...bind).first())?.[kolom];

    await db.prepare("INSERT INTO agen(id,nama,kode,plan_id,host,versi,terakhir) VALUES('ag9','Unit 9','test-agent','p','203.0.113.7','1.6.0',datetime('now'))").run();

    // Tanpa kode -> 401 (dijaga blok agen umum).
    const anon = await call('/agen/relay/named', 'POST', {});
    assert.equal(anon.status, 401);

    // Setup pertama: hostname + token + kolom DB terisi.
    const s1 = await agen('/agen/relay/named', 'POST', {});
    assert.equal(s1.status, 200, JSON.stringify(s1.json));
    assert.equal(s1.json.data.hostname, 'relay-ag9.xycloud.my.id');
    assert.ok(String(s1.json.data.tunnel_token).length > 10);
    assert.ok(String(s1.json.data.tunnel_id).length > 5);
    assert.equal(await ambil('SELECT cf_tunnel_id FROM agen WHERE id=?', 'cf_tunnel_id', 'ag9'),
      s1.json.data.tunnel_id);
    assert.equal(await ambil('SELECT cf_hostname FROM agen WHERE id=?', 'cf_hostname', 'ag9'),
      'relay-ag9.xycloud.my.id');

    // Setup kedua: idempotent, tunnel sama.
    const s2 = await agen('/agen/relay/named', 'POST', {});
    assert.equal(s2.status, 200, JSON.stringify(s2.json));
    assert.equal(s2.json.data.tunnel_id, s1.json.data.tunnel_id);
    assert.equal(s2.json.data.hostname, s1.json.data.hostname);

    // Hapus: DNS+tunnel dibuang (mock), kolom dikosongkan.
    const h = await agen('/agen/relay/named', 'DELETE');
    assert.equal(h.status, 200, JSON.stringify(h.json));
    assert.equal(await ambil('SELECT cf_tunnel_id FROM agen WHERE id=?', 'cf_tunnel_id', 'ag9'), null);
    assert.equal(await ambil('SELECT cf_hostname FROM agen WHERE id=?', 'cf_hostname', 'ag9'), null);
  } finally {
    await mf.dispose();
  }
});

test('Relay named: tanpa token CF dan tanpa mock -> 503 tanpa fetch keluar',
     {timeout: 120000}, async () => {
  const {mf, db, call} = await harness();
  try {
    await db.prepare("INSERT INTO agen(id,nama,kode,plan_id,host,versi,terakhir) VALUES('ag9','Unit 9','test-agent','p','203.0.113.7','1.6.0',datetime('now'))").run();
    const r = await call('/agen/relay/named', 'POST', {}, {'x-agen-kode': 'test-agent'});
    assert.equal(r.status, 503, JSON.stringify(r.json));
  } finally {
    await mf.dispose();
  }
});
