import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

// Admin CS boleh membalas dengan teks, gambar, atau keduanya.
// Sebelumnya API menolak teks kosong (400) dan mengabaikan field gambar,
// sehingga tombol kirim-gambar console lama selalu gagal diam-diam.
test('CS reply admin: teks, gambar URL, validasi, dan dataURI tanpa kredensial', async () => {
  const h = await harness();
  try {
    const adminH = { 'x-admin-key': 'test-admin' };

    // tanpa kunci admin -> 403
    const tanpa = await h.call('/admin/cs/reply', 'POST', { room: 'user:u1', teks: 'halo' });
    assert.equal(tanpa.status, 403);

    // room tidak valid -> 400
    const roomBuruk = await h.call('/admin/cs/reply', 'POST', { room: 'salah', teks: 'halo' }, adminH);
    assert.equal(roomBuruk.status, 400);

    // teks kosong tanpa gambar -> 400
    const kosong = await h.call('/admin/cs/reply', 'POST', { room: 'user:u1', teks: '  ' }, adminH);
    assert.equal(kosong.status, 400);

    // gambar bukan URL https / dataURI -> 400
    const gambarBuruk = await h.call('/admin/cs/reply', 'POST',
      { room: 'user:u1', teks: '', gambar: 'bukan-url' }, adminH);
    assert.equal(gambarBuruk.status, 400);

    // teks biasa tetap jalan
    const teks = await h.call('/admin/cs/reply', 'POST', { room: 'user:u1', teks: 'halo kak' }, adminH);
    assert.equal(teks.status, 201);
    assert.equal(teks.json.data.tipe, 'teks');
    assert.equal(teks.json.data.gambar, null);

    // gambar URL + teks kosong -> 201 tipe gambar, tersimpan di DB
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/xycloudstore/chat/coba.png';
    const g = await h.call('/admin/cs/reply', 'POST', { room: 'user:u1', teks: '', gambar: url }, adminH);
    assert.equal(g.status, 201);
    assert.equal(g.json.data.tipe, 'gambar');
    assert.equal(g.json.data.gambar, url);
    const simpan = await h.db.prepare('SELECT tipe, gambar FROM cs_messages WHERE id = ?')
      .bind(g.json.data.id).first();
    assert.equal(simpan.tipe, 'gambar');
    assert.equal(simpan.gambar, url);

    // teks + gambar -> 201, gambar ikut tersimpan
    const dua = await h.call('/admin/cs/reply', 'POST',
      { room: 'user:u1', teks: 'lihat ini', gambar: url }, adminH);
    assert.equal(dua.status, 201);
    assert.equal(dua.json.data.gambar, url);

    // dataURI tanpa kredensial Cloudinary -> 502 dengan alasan jelas (bukan 500)
    const b64 = await h.call('/admin/cs/reply', 'POST',
      { room: 'user:u1', teks: '', gambar: 'data:image/png;base64,iVBORw0KGgo=' }, adminH);
    assert.equal(b64.status, 502);
    assert.ok(JSON.stringify(b64.json).toLowerCase().includes('kredensial'), JSON.stringify(b64.json));
  } finally {
    await h.mf.dispose();
  }
});
