import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

// ---------------------------------------------------------------------------
// Heartbeat agen sebagai sumber kebenaran jalur streaming (tanpa set manual).
// Agen 1.5.9+ mengirim host publik (auto-deteksi) + host_lan tiap detak 20 dtk;
// API menyimpan jalur itu dan menyinkronkannya ke sesi aktif bila berubah.
// ---------------------------------------------------------------------------
test('Heartbeat: jalur LAN/tunnel/relay tersimpan & IP baru tersync ke sesi aktif',
     {timeout: 120000}, async () => {
  const {mf, db, token, call} = await harness();
  try {
    const auth = await token('u');
    const user = (path, method, body) => call(path, method, body, {Authorization: 'Bearer ' + auth});
    const detak = (body) => call('/agen/heartbeat', 'POST',
      {status: 'online', versi: '1.5.9', ...body}, {'x-agen-kode': 'test-agent'});
    const agen = (path, method, body) => call(path, method, body, {'x-agen-kode': 'test-agent'});
    const ambil = async (sql, kolom, ...bind) => (await db.prepare(sql).bind(...bind).first())?.[kolom];

    await db.prepare("INSERT INTO users(id,nama,email,password,saldo) VALUES('u','U','u@example.invalid','test',100000)").run();
    await db.prepare("INSERT INTO pc_plans(id,nama,gpu,cpu,ram_gb,storage_gb,harga_per_jam,harga_per_hari,region,total_unit,unit_tersedia) VALUES('p','PC test','G','C',16,100,10000,100000,'test',2,2)").run();
    await db.prepare("INSERT INTO agen(id,nama,kode,plan_id,host,versi,spec,terakhir) VALUES('a','Unit test','test-agent','p','203.0.113.7','1.5.9',?,datetime('now'))")
      .bind(JSON.stringify({sunshine: {siap: true}})).run();

    // ---- 1. jalur dilaporkan agen tersimpan --------------------------------
    const d1 = await detak({host: '203.0.113.7', host_lan: '192.168.1.50',
      tunnel_host: 'pc-abc.trycloudflare.com', relay_host: 'relay.xycloud.id:48010'});
    assert.equal(d1.status, 200, JSON.stringify(d1.json));
    assert.equal(await ambil('SELECT host_lan FROM agen WHERE id=?', 'host_lan', 'a'), '192.168.1.50');
    assert.equal(await ambil('SELECT tunnel_host FROM agen WHERE id=?', 'tunnel_host', 'a'), 'pc-abc.trycloudflare.com');
    assert.equal(await ambil('SELECT relay_host FROM agen WHERE id=?', 'relay_host', 'a'), 'relay.xycloud.id:48010');

    // ---- 2. input jalur jahat ditolak, nilai lama bertahan -----------------
    const d2 = await detak({host_lan: 'a b;DROP', tunnel_host: '<script>x</script>'});
    assert.equal(d2.status, 200, JSON.stringify(d2.json));
    assert.equal(await ambil('SELECT host_lan FROM agen WHERE id=?', 'host_lan', 'a'), '192.168.1.50',
      'host_lan ber-spasi harus ditolak');
    assert.equal(await ambil('SELECT tunnel_host FROM agen WHERE id=?', 'tunnel_host', 'a'), 'pc-abc.trycloudflare.com',
      'tunnel_host ber-kurung siku harus ditolak');

    // ---- 3. sesi aktif ikut IP publik baru (DHCP ISP berubah mid-sewa) -----
    const buat = await user('/orders', 'POST', {plan_id: 'p', durasi_jam: 1, metode: 'saldo', request_id: 'req-hb-000001'});
    assert.equal(buat.status, 201, JSON.stringify(buat.json));
    const order = buat.json.data;
    const mulai = await user('/sesi/mulai', 'POST', {order_id: order.id});
    assert.equal(mulai.status, 201, JSON.stringify(mulai.json));
    const sesi = mulai.json.data;
    const cmd = await db.prepare("SELECT * FROM perintah WHERE jenis='mulai_sesi'").first();
    const konfirm = await agen('/agen/perintah/' + cmd.id, 'POST',
      {ok: true, sesi_id: sesi.id, host: '203.0.113.7'});
    assert.equal(konfirm.status, 200, JSON.stringify(konfirm.json));
    assert.equal(await ambil('SELECT status FROM sesi WHERE id=?', 'status', sesi.id), 'siap');

    // IP publik berubah; heartbeat berikutnya harus menyinkronkan sesi aktif.
    const d3 = await detak({host: '198.51.100.9', host_lan: '192.168.1.50'});
    assert.equal(d3.status, 200, JSON.stringify(d3.json));
    assert.equal(await ambil('SELECT host FROM sesi WHERE id=?', 'host', sesi.id), '198.51.100.9',
      'sesi aktif harus ikut IP publik baru tanpa mulai ulang sewa');
    assert.equal(await ambil('SELECT host FROM agen WHERE id=?', 'host', 'a'), '198.51.100.9');
    assert.equal(await ambil('SELECT host_lan FROM sesi WHERE id=?', 'host_lan', sesi.id), '192.168.1.50',
      'jalur LAN ikut tersync ke sesi aktif');
  } finally {
    await mf.dispose();
  }
});
