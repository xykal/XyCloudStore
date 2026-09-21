import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as jeda} from 'node:timers/promises';
import {harness} from './harness.mjs';
test('Verifikasi ulang tanpa OTP dan password penanda sosial tidak menerbitkan token',async()=>{
 const h=await harness();
 try{
  await h.db.prepare("INSERT INTO users(id,nama,email,password,email_verified) VALUES ('verified','V','v@example.invalid','test',1),('social','S','s@example.invalid','sosial:google',1)").run();
  const r=await h.call('/auth/verify','POST',{email:'v@example.invalid',kode:''});
  assert.equal(r.status,409);assert.ok(!JSON.stringify(r.json).includes('token'));
  const social=await h.call('/auth/login','POST',{email:'s@example.invalid',password:'sosial:google'});
  assert.equal(social.status,401);assert.ok(!JSON.stringify(social.json).includes('token'));
 }finally{await h.mf.dispose();}
});

test('Password baru memakai PBKDF2 dan hash warisan dimigrasikan saat login', {timeout:120000}, async()=>{
 const h=await harness();
 try{
  const device={'X-XY-Device':'f'.repeat(64),'X-XY-Device-Kind':'android'};
  let r=await h.call('/auth/register','POST',{nama:'Pengguna Aman',email:'aman@example.invalid',password:'tujuh77',phone:'08123456789'},device);
  assert.equal(r.status,400);
  r=await h.call('/auth/register','POST',{nama:'Pengguna Aman',email:'aman@example.invalid',password:'Aman-Sekali-2026',phone:'08123456789'},device);
  assert.equal(r.status,201,JSON.stringify(r.json));
  const baru=await h.db.prepare("SELECT password FROM users WHERE email='aman@example.invalid'").first('password');
  assert.match(baru,/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(baru.includes('Aman-Sekali-2026'),false);

  const sandiLama='warisan-yang-benar';
  const salt='0123456789abcdef';
  const hash=createHash('sha256').update(`${salt}:${sandiLama}`).digest('hex');
  await h.db.prepare("INSERT INTO users(id,nama,email,password,email_verified) VALUES('legacy','Legacy','legacy@example.invalid',?,1)").bind(`${salt}$${hash}`).run();
  r=await h.call('/auth/login','POST',{email:'legacy@example.invalid',password:sandiLama},device);
  assert.equal(r.status,200,JSON.stringify(r.json));
  await jeda(25);
  const upgraded=await h.db.prepare("SELECT password FROM users WHERE id='legacy'").first('password');
  assert.match(upgraded,/^pbkdf2-sha256\$100000\$/);
  assert.notEqual(upgraded,`${salt}$${hash}`);
  assert.equal((await h.call('/auth/login','POST',{email:'legacy@example.invalid',password:'salah-sekali'},device)).status,401);
 }finally{await h.mf.dispose();}
});

// REGRESI RUNTIME: Cloudflare Workers (workerd) menolak PBKDF2 dengan iterasi
// > 100.000 ("Iteration counts above 100000 are not supported"), sedangkan Node
// tidak membedakannya. Dua test ini mengunci: (1) hash baru selalu <= batas
// runtime Workers, (2) hash tersimpan yang melebihi batas ditolak sebagai 401,
// BUKAN melempar menjadi HTTP 500 yang mengunci semua login (insiden 2026-09-18).
test('Iterasi PBKDF2 hash baru tidak melebihi batas runtime Workers (100k)', {timeout:120000}, async()=>{
 const h=await harness();
 try{
  const device={'X-XY-Device':'e'.repeat(64),'X-XY-Device-Kind':'android'};
  const r=await h.call('/auth/register','POST',{nama:'Batas Runtime',email:'batas@example.invalid',password:'Aman-Sekali-2026',phone:'08123456789'},device);
  assert.equal(r.status,201,JSON.stringify(r.json));
  const hash=await h.db.prepare("SELECT password FROM users WHERE email='batas@example.invalid'").first('password');
  const iterasi=Number(String(hash).split('$')[1]);
  assert.ok(Number.isFinite(iterasi)&&iterasi<=100000,`iterasi ${iterasi} melebihi batas WebCrypto Workers (100000) - login produksi akan 500`);
 }finally{await h.mf.dispose();}
});

test('Hash tersimpan dengan iterasi di atas batas runtime ditolak 401, bukan 500', async()=>{
 const h=await harness();
 try{
  const over='pbkdf2-sha256$210000$'+'0'.repeat(32)+'$'+'0'.repeat(64);
  await h.db.prepare("INSERT INTO users(id,nama,email,password,email_verified) VALUES ('overcap','OC','overcap@example.invalid',?,1)").bind(over).run();
  const r=await h.call('/auth/login','POST',{email:'overcap@example.invalid',password:'apa-saja'});
  assert.equal(r.status,401,`diharapkan 401, dapat ${r.status}: ${JSON.stringify(r.json)}`);
 }finally{await h.mf.dispose();}
});

test('Login perangkat baru minta tautan email; HP sama model+IP lolos tanpa merge model kosong', {timeout:120000}, async()=>{
 const h=await harness();
 try{
  const d1={'X-XY-Device':'a'.repeat(64),'X-XY-Device-Kind':'android','X-XY-Device-Model':'Pixel 8'};
  const d2={'X-XY-Device':'b'.repeat(64),'X-XY-Device-Kind':'android'};
  const d3={'X-XY-Device':'c'.repeat(64),'X-XY-Device-Kind':'android','X-XY-Device-Model':'Pixel 8'};
  const d4={'X-XY-Device':'d'.repeat(64),'X-XY-Device-Kind':'android','X-XY-Device-Model':'iPhone 15'};
  let r=await h.call('/auth/register','POST',{nama:'Pengguna Uji',email:'otpfree@example.invalid',password:'Aman-Sekali-2026',phone:'08123456789'},d1);
  assert.equal(r.status,201,JSON.stringify(r.json));
  assert.equal(r.json.data.perluVerifikasi,true);
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d1);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.equal(r.json.data.perluVerifikasi,true);
  assert.equal(r.json.data.token,undefined);
  await h.db.prepare("UPDATE users SET email_verified=1 WHERE email='otpfree@example.invalid'").run();
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d1);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.ok(r.json.data.token,'perangkat daftar harus token');
  const tokenD1=r.json.data.token;
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d2);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.equal(r.json.data.perluLoginBaru,true);
  assert.equal(r.json.data.token,undefined);
  assert.equal(r.json.data.perluVerifikasi,undefined);
  assert.match(String(r.json.data.tautanUji||''),/\/api\/auth\/login-confirm\?token=[a-f0-9]{64}$/);
  const tautan=r.json.data.tautanUji;
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d3);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.ok(r.json.data.token,'twin Pixel 8 + IP sama <72 jam harus token');
  const html=await h.mf.dispatchFetch(tautan);
  const body=await html.text();
  assert.equal(html.status,200,body.slice(0,200));
  assert.match(String(html.headers.get('content-type')||''),/text\/html/);
  assert.doesNotMatch(body,/eyJ[A-Za-z0-9_-]+\./);
  assert.match(body,/dikonfirmasi/i);
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d2);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.ok(r.json.data.token,'setelah tautan, perangkat itu token');
  r=await h.call('/auth/login','POST',{email:'otpfree@example.invalid',password:'Aman-Sekali-2026'},d4);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.equal(r.json.data.perluLoginBaru,true);
  assert.equal(r.json.data.token,undefined);
  const dev=await h.call('/user/devices','GET',null,{Authorization:'Bearer '+tokenD1,...d1});
  assert.equal(dev.status,200,JSON.stringify(dev.json));
  const daftar=dev.json.data.devices||[];
  const pixel=daftar.filter((x)=>String(x.model).includes('Pixel'));
  assert.equal(pixel.length,1,'HP sama jangan dobel di daftar');
  r=await h.call('/auth/resend','POST',{email:'otpfree@example.invalid',tipe:'verifikasi'});
  assert.equal(r.status,409);
  const cfg=await h.call('/config','GET');
  assert.equal(cfg.json.data.rekening.bank,'DANA');
  assert.equal(cfg.json.data.rekening.nomor,'083116632566');
 }finally{await h.mf.dispose();}
});

test('Login tidak dibatasi 2 akun per perangkat; kuota hanya saat daftar (regresi 2026-09-21)', {timeout:120000}, async()=>{
 const h=await harness();
 try{
  const dA={'X-XY-Device':'a'.repeat(64),'X-XY-Device-Kind':'android','X-XY-Device-Model':'Pixel 8'};
  const dB={'X-XY-Device':'b'.repeat(64),'X-XY-Device-Kind':'android','X-XY-Device-Model':'Pixel 8'};
  // 2 akun didaftarkan dari perangkat A (kuota pendaftaran penuh).
  for(const [nama,email] of [['Akun Satu','satu@example.invalid'],['Akun Dua','dua@example.invalid']]){
   const r=await h.call('/auth/register','POST',{nama,email,password:'Aman-Sekali-2026'},dA);
   assert.equal(r.status,201,JSON.stringify(r.json));
  }
  await h.db.prepare("UPDATE users SET email_verified=1 WHERE email IN ('satu@example.invalid','dua@example.invalid')").run();
  // Akun ketiga didaftarkan dari perangkat B.
  let r=await h.call('/auth/register','POST',{nama:'Akun Tiga',email:'tiga@example.invalid',password:'Aman-Sekali-2026'},dB);
  assert.equal(r.status,201,JSON.stringify(r.json));
  await h.db.prepare("UPDATE users SET email_verified=1 WHERE email='tiga@example.invalid'").run();
  // Login akun ketiga DARI perangkat A: dulu 403 "batas maksimal 2 akun".
  r=await h.call('/auth/login','POST',{email:'tiga@example.invalid',password:'Aman-Sekali-2026'},dA);
  assert.equal(r.status,200,JSON.stringify(r.json));
  assert.ok(r.json.data.token||r.json.data.perluLoginBaru,'login harus diproses (token/tantangan), bukan ditolak perangkat');
  // Kuota PENDAFTARAN tetap berlaku: akun ke-3 dari perangkat A ditolak.
  r=await h.call('/auth/register','POST',{nama:'Akun Empat',email:'empat@example.invalid',password:'Aman-Sekali-2026'},dA);
  assert.equal(r.status,429,JSON.stringify(r.json));
  assert.equal(r.json.code,'DEVICE_LIMIT');
 }finally{await h.mf.dispose();}
});
