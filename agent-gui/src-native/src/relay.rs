//! Relay otomatis XY-RELAY v1 (lihat docs/protokol-xy-relay.md).
//!
//! Untuk PC di balik CGNAT: membungkus 8 port GameStream ke satu WebSocket
//! lokal, lalu mempublikasikannya via `cloudflared tunnel --url` (Quick
//! Tunnel: gratis, tanpa akun). Std-only kecuali helper agen yang sudah ada.

use super::{dir_data, minta, perintah, unduh_berkas, Logger};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

// ---------- konstanta protokol ----------
const VER: u8 = 1;
const K_TCP: u8 = 0;
const K_UDP: u8 = 1;
const K_OPEN: u8 = 2;
const K_CLOSE: u8 = 3;
const K_PING: u8 = 4;
const K_PONG: u8 = 5;
const TCP_PORTS: [u16; 3] = [47984, 47989, 48010];
const UDP_PORTS: [u16; 5] = [47998, 47999, 48000, 48002, 48010];
const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const CLOUDFLARED_URL: &str =
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";

// ---------- state ----------
struct RelayAktif {
    url_wss: String,
    sesi: String,
    jalan: Arc<AtomicBool>,
}

static RELAY: Mutex<Option<RelayAktif>> = Mutex::new(None);
static CF_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

/// URL WSS publik yang sedang aktif (format `wss://host/xy/{sesi}`).
pub fn url_aktif() -> Option<String> {
    RELAY.lock().ok().and_then(|r| r.as_ref().map(|x| x.url_wss.clone()))
}

/// Heuristik: butuh relay bila host direct jelas tak bisa dijangkau HP
/// (IP privat/CGNAT/loopback, atau bukan domain/IP publik).
pub fn perlu_relay_otomatis(stream: &str) -> bool {
    let s = stream.trim();
    if s.is_empty() {
        return true;
    }
    if let Ok(ip) = s.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v) => {
                let o = v.octets();
                o[0] == 10
                    || o[0] == 127
                    || o[0] == 0
                    || (o[0] == 100 && (64..=127).contains(&o[1]))
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168)
                    || (o[0] == 169 && o[1] == 254)
            }
            // IPv6: diasumsikan publik (direct); relay manual via `relay:on`.
            std::net::IpAddr::V6(_) => false,
        };
    }
    // Domain publik (ada titik) => direct dulu; nama PC tanpa titik => relay.
    !s.contains('.')
}

/// Hentikan relay (cloudflared + proxy). Idempotent.
pub fn berhenti() {
    if let Ok(mut r) = RELAY.lock() {
        if let Some(st) = r.take() {
            st.jalan.store(false, Ordering::SeqCst);
        }
    }
    if let Ok(mut c) = CF_CHILD.lock() {
        if let Some(mut anak) = c.take() {
            let _ = anak.kill();
        }
    }
}

/// Port lokal TETAP untuk mode named (harus sama dengan ingress di Worker).
pub const PORT_NAMED: u16 = 48101;

fn url_sesi_aktif(sesi_id: &str) -> Option<String> {
    RELAY.lock().ok().and_then(|r| {
        r.as_ref().and_then(|st| {
            if st.sesi == sesi_id && st.jalan.load(Ordering::SeqCst) {
                Some(st.url_wss.clone())
            } else {
                None
            }
        })
    })
}

/// Buka proxy WS lokal (`port_minta`: 0 = acak, atau port tetap mode named).
fn siapkan_ws(
    port_minta: u16,
    sesi_id: &str,
    log: &Logger,
) -> Result<(u16, Arc<AtomicBool>), String> {
    let pendengar = TcpListener::bind(format!("127.0.0.1:{port_minta}"))
        .map_err(|e| e.to_string())?;
    let port = pendengar.local_addr().map_err(|e| e.to_string())?.port();
    pendengar.set_nonblocking(true).map_err(|e| e.to_string())?;
    log(&format!("Relay: proxy WS lokal di 127.0.0.1:{port}"));
    let jalan = Arc::new(AtomicBool::new(true));
    let sesi = sesi_id.to_string();
    {
        let jalan = jalan.clone();
        let sesi = sesi.clone();
        let log = log.clone();
        thread::spawn(move || {
            while jalan.load(Ordering::SeqCst) {
                match pendengar.accept() {
                    Ok((alir, _)) => {
                        let jalan2 = jalan.clone();
                        let sesi2 = sesi.clone();
                        let log2 = log.clone();
                        thread::spawn(move || layani_ws(alir, jalan2, &sesi2, &log2));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(150));
                    }
                    Err(_) => break,
                }
            }
        });
    }
    Ok((port, jalan))
}

/// Jalankan cloudflared dengan argumen bebas; kembalikan proses + baris stderr.
fn jalankan_cloudflared(
    bin: &std::path::Path,
    args: &[&str],
) -> Result<(std::process::Child, mpsc::Receiver<String>), String> {
    let bin_s = bin.to_string_lossy().to_string();
    let mut cmd = perintah(&bin_s);
    for a in args {
        cmd.arg(*a);
    }
    let mut anak = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cloudflared gagal jalan: {e}"))?;
    let stderr = anak.stderr.take().ok_or("cloudflared tanpa stderr")?;
    let (tx_log, rx_log) = mpsc::channel::<String>();
    thread::spawn(move || {
        use std::io::BufRead;
        let baca = std::io::BufReader::new(stderr);
        for baris in baca.lines().map_while(Result::ok) {
            if tx_log.send(baris).is_err() {
                break;
            }
        }
    });
    Ok((anak, rx_log))
}

fn simpan_aktif(
    anak: std::process::Child,
    sesi_id: &str,
    url_wss: &str,
    jalan: Arc<AtomicBool>,
    log: &Logger,
) -> Result<String, String> {
    if let Ok(mut c) = CF_CHILD.lock() {
        *c = Some(anak);
    }
    log(&format!("Relay AKTIF: {url_wss}"));
    if let Ok(mut r) = RELAY.lock() {
        *r = Some(RelayAktif {
            url_wss: url_wss.to_string(),
            sesi: sesi_id.to_string(),
            jalan,
        });
    }
    Ok(url_wss.to_string())
}

/// Nyalakan relay QUICK untuk sesi (fallback tanpa domain). ID sesi sama => pakai yang ada.
pub fn mulai(sesi_id: &str, log: &Logger) -> Result<String, String> {
    if let Some(u) = url_sesi_aktif(sesi_id) {
        return Ok(u);
    }
    berhenti();
    let (port, jalan) = siapkan_ws(0, sesi_id, log)?;
    let bin = pastikan_cloudflared(log)?;
    log("Relay: membuka Quick Tunnel (maks 90 dtk)…");
    let url_lokal = format!("http://127.0.0.1:{port}");
    let args = vec!["tunnel", "--url", url_lokal.as_str(), "--no-autoupdate"];
    let (mut anak, rx_log) = jalankan_cloudflared(&bin, &args)?;
    let batas = std::time::Instant::now() + Duration::from_secs(90);
    let mut host: Option<String> = None;
    while std::time::Instant::now() < batas {
        match rx_log.recv_timeout(Duration::from_secs(2)) {
            Ok(baris) => {
                if let Some(h) = petik_trycloudflare(&baris) {
                    host = Some(h);
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    let host = match host {
        Some(h) => h,
        None => {
            let _ = anak.kill();
            jalan.store(false, Ordering::SeqCst);
            return Err("Quick Tunnel tidak memberi URL dalam 90 dtk".into());
        }
    };
    simpan_aktif(anak, sesi_id, &format!("wss://{host}/xy/{sesi_id}"), jalan, log)
}

fn hostname_valid(h: &str) -> bool {
    if h.len() < 4 || h.len() > 253 || !h.contains('.') {
        return false;
    }
    h.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    })
}

/// Satu percobaan relay NAMED. Token ditolak => Err diawali "TOKEN_DITOLAK".
fn mulai_named_sekali(
    server: &str,
    kode: &str,
    sesi_id: &str,
    log: &Logger,
) -> Result<String, String> {
    if let Some(u) = url_sesi_aktif(sesi_id) {
        return Ok(u);
    }
    berhenti();
    // 1) minta setup ke Worker (idempotent; 503 bila token CF belum diset).
    let url_api = format!("{}/api/agen/relay/named", server.trim_end_matches('/'));
    let (status, body) = minta(
        &url_api,
        Some(serde_json::json!({})),
        "POST",
        Some(vec![("x-agen-kode".to_string(), kode.to_string())]),
    )
    .map_err(|e| format!("API relay named tak terjangkau: {e}"))?;
    if !(200..300).contains(&status) {
        let pesan = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        return Err(format!("API relay named HTTP {status}: {pesan}"));
    }
    let data = body.get("data").unwrap_or(&body);
    let hostname = data
        .get("hostname")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let token = data
        .get("tunnel_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if !hostname_valid(&hostname) {
        return Err("API relay named memberi hostname cacat".into());
    }
    if token.len() < 20 || token.len() > 4096 || token.chars().any(|c| c.is_whitespace()) {
        return Err("API relay named memberi token cacat".into());
    }
    // 2) WS lokal port tetap (sesuai ingress di Worker).
    let (_port, jalan) = match siapkan_ws(PORT_NAMED, sesi_id, log) {
        Ok(x) => x,
        Err(e) => {
            berhenti();
            thread::sleep(Duration::from_millis(500));
            siapkan_ws(PORT_NAMED, sesi_id, log)
                .map_err(|_| format!("port relay {PORT_NAMED} dipakai: {e}"))?
        }
    };
    // 3) cloudflared run --token …; siap saat "Registered tunnel connection".
    let bin = pastikan_cloudflared(log)?;
    log("Relay: membuka named tunnel (maks 90 dtk)…");
    let args = vec!["tunnel", "--no-autoupdate", "run", "--token", token.as_str()];
    let (mut anak, rx_log) = jalankan_cloudflared(&bin, &args)?;
    let batas = std::time::Instant::now() + Duration::from_secs(90);
    let mut siap = false;
    let mut salah_token = false;
    while std::time::Instant::now() < batas {
        match rx_log.recv_timeout(Duration::from_secs(2)) {
            Ok(baris) => {
                if baris.contains("Registered tunnel connection") {
                    siap = true;
                    break;
                }
                let rendah = baris.to_lowercase();
                if rendah.contains("unauthorized")
                    || (rendah.contains("token")
                        && (rendah.contains("invalid")
                            || rendah.contains("expired")
                            || rendah.contains("malform")))
                {
                    salah_token = true;
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    if !siap {
        let _ = anak.kill();
        jalan.store(false, Ordering::SeqCst);
        if salah_token {
            return Err("TOKEN_DITOLAK: tunnel token ditolak Cloudflare".into());
        }
        return Err("named tunnel tidak terhubung dalam 90 dtk".into());
    }
    simpan_aktif(
        anak,
        sesi_id,
        &format!("wss://{hostname}/xy/{sesi_id}"),
        jalan,
        log,
    )
}

fn petik_trycloudflare(baris: &str) -> Option<String> {
    let i = baris.find("https://")?;
    let sisa = &baris[i + 8..];
    let akhir = sisa
        .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ')')
        .unwrap_or(sisa.len());
    let host = sisa[..akhir].trim_end_matches('/').to_string();
    if host.ends_with(".trycloudflare.com") && !host.contains(' ') {
        Some(host)
    } else {
        None
    }
}

fn pastikan_cloudflared(log: &Logger) -> Result<std::path::PathBuf, String> {
    let bin = dir_data().join("cloudflared.exe");
    if let Ok(m) = std::fs::metadata(&bin) {
        if m.len() > 1_000_000 {
            return Ok(bin);
        }
    }
    log("Relay: mengunduh cloudflared (~35 MB, sekali saja)…");
    unduh_berkas(CLOUDFLARED_URL, &bin, log)?;
    Ok(bin)
}

// ---------- server WebSocket minimal (std-only) ----------

/// Nyalakan relay NAMED (hostname tetap relay-<unit>.xycloud.my.id).
/// Meminta setup idempotent ke Worker, lalu `cloudflared run --token`.
/// Token TIDAK PERNAH ditulis ke log. Gagal => pemanggil fallback quick.
///
/// Self-healing: API Cloudflare tidak bisa mendeteksi tunnel yang dihapus
/// manual (GET basi tetap 200). Bila cloudflared menolak token, agen me-reset
/// setup via DELETE lalu mencoba sekali lagi (membuat tunnel baru).
pub fn mulai_named(
    server: &str,
    kode: &str,
    sesi_id: &str,
    log: &Logger,
) -> Result<String, String> {
    match mulai_named_sekali(server, kode, sesi_id, log) {
        Ok(u) => Ok(u),
        Err(e) if e.starts_with("TOKEN_DITOLAK") => {
            log("Relay: token ditolak (tunnel mungkin dihapus manual); reset lalu coba lagi…");
            let url_api = format!("{}/api/agen/relay/named", server.trim_end_matches('/'));
            let _ = minta(
                &url_api,
                None,
                "DELETE",
                Some(vec![("x-agen-kode".to_string(), kode.to_string())]),
            );
            berhenti();
            mulai_named_sekali(server, kode, sesi_id, log).map_err(|e2| {
                e2.replacen("TOKEN_DITOLAK: ", "", 1)
            })
        }
        Err(e) => Err(e),
    }
}

fn layani_ws(alir: TcpStream, jalan: Arc<AtomicBool>, sesi: &str, log: &Logger) {
    let _ = alir.set_read_timeout(Some(Duration::from_secs(1)));
    // 1) baca HTTP Upgrade (maks 16 KB).
    let mut kepala = Vec::with_capacity(1024);
    let mut buf = [0u8; 512];
    let mut baca = match alir.try_clone() {
        Ok(b) => b,
        Err(_) => return,
    };
    let ok_baca = (|| -> bool {
        loop {
            if !jalan.load(Ordering::SeqCst) || kepala.len() > 16384 {
                return false;
            }
            match baca.read(&mut buf) {
                Ok(0) => return false,
                Ok(n) => {
                    kepala.extend_from_slice(&buf[..n]);
                    if kepala.windows(4).any(|w| w == b"\r\n\r\n") {
                        return true;
                    }
                }
                Err(e)
                    if e.kind() == std::io::ErrorKind::TimedOut
                        || e.kind() == std::io::ErrorKind::WouldBlock =>
                {
                    continue
                }
                Err(_) => return false,
            }
        }
    })();
    if !ok_baca {
        return;
    }
    let teks = String::from_utf8_lossy(&kepala);
    let mut baris = teks.lines();
    let permintaan = baris.next().unwrap_or("");
    let mut kunci: Option<String> = None;
    let mut upgrade_ws = false;
    for h in baris {
        let kecil = h.to_ascii_lowercase();
        if kecil.starts_with("sec-websocket-key:") {
            kunci = h.split(':').nth(1).map(|x| x.trim().to_string());
        }
        if kecil.starts_with("upgrade:") && kecil.contains("websocket") {
            upgrade_ws = true;
        }
    }
    let path_ok = permintaan
        .split_whitespace()
        .nth(1)
        .map(|p| p == "/" || p == format!("/xy/{sesi}"))
        .unwrap_or(false);
    let kunci = match (kunci, upgrade_ws, path_ok) {
        (Some(k), true, true) => k,
        _ => {
            let _ = baca.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
            return;
        }
    };
    if permintaan.contains("GET / ") {
        log("Relay: WS tanpa sesi (kompatibilitas) — diterima dengan peringatan.");
    }
    let terima = b64_encode(&sha1(format!("{kunci}{WS_GUID}").as_bytes()));
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {terima}\r\n\r\n"
    );
    if baca.write_all(resp.as_bytes()).is_err() {
        return;
    }
    // 2) loop pesan: baca frame => proses; tulis via channel.
    let tulis = match baca.try_clone() {
        Ok(t) => Arc::new(Mutex::new(t)),
        Err(_) => return,
    };
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    {
        let tulis = tulis.clone();
        let jalan = jalan.clone();
        thread::spawn(move || {
            while jalan.load(Ordering::SeqCst) {
                match rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(frame) => {
                        let pesan = bingkai_ws_keluar(&frame);
                        if let Ok(mut t) = tulis.lock() {
                            if t.write_all(&pesan).is_err() {
                                break;
                            }
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });
    }
    // Soket UDP ke Sunshine (satu per port, per koneksi WS).
    let mut udp: Vec<Option<UdpSocket>> = Vec::new();
    for _ in UDP_PORTS {
        udp.push(None);
    }
    let tcp_map: Arc<Mutex<HashMap<(u8, u8), Arc<Mutex<TcpStream>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let mut sisa_frag: Vec<u8> = Vec::new();
    loop {
        if !jalan.load(Ordering::SeqCst) {
            break;
        }
        match baca_ws_pesan(&mut baca, &mut sisa_frag) {
            Ok(None) => continue, // timeout — cek flag lagi
            Ok(Some((opcode, muatan))) => {
                if opcode == 8 {
                    break;
                }
                if opcode == 9 {
                    let pong = bingkai_ws_keluar_opcode(0xA, &[]);
                    if let Ok(mut t) = tulis.lock() {
                        let _ = t.write_all(&pong);
                    }
                    continue;
                }
                if opcode != 1 && opcode != 2 {
                    continue;
                }
                proses_frame(&muatan, &tx, &mut udp, &tcp_map, &jalan, log);
            }
            Err(_) => break,
        }
    }
    // Tutup semua TCP yang dibuka koneksi ini.
    if let Ok(m) = tcp_map.lock() {
        for (_, s) in m.iter() {
            if let Ok(w) = s.lock() {
                let _ = w.shutdown(std::net::Shutdown::Both);
            }
        }
    }
}

fn proses_frame(
    muatan: &[u8],
    tx: &mpsc::Sender<Vec<u8>>,
    udp: &mut [Option<UdpSocket>],
    tcp_map: &Arc<Mutex<HashMap<(u8, u8), Arc<Mutex<TcpStream>>>>>,
    jalan: &Arc<AtomicBool>,
    log: &Logger,
) {
    if muatan.len() < 7 || muatan[0] != VER {
        return;
    }
    let (kind, idx, conn, flags) = (muatan[1], muatan[2], muatan[3], muatan[4]);
    let len = u16::from_be_bytes([muatan[5], muatan[6]]) as usize;
    if muatan.len() < 7 + len {
        return;
    }
    let data = &muatan[7..7 + len];
    let frame = |k: u8, i: u8, c: u8, f: u8, d: &[u8]| -> Vec<u8> {
        let mut v = Vec::with_capacity(7 + d.len());
        v.push(VER);
        v.push(k);
        v.push(i);
        v.push(c);
        v.push(f);
        v.extend_from_slice(&(d.len().min(65535) as u16).to_be_bytes());
        v.extend_from_slice(&d[..d.len().min(65535)]);
        v
    };
    match kind {
        K_PING => {
            let _ = tx.send(frame(K_PONG, 0, 0, 0, &[]));
        }
        K_UDP => {
            let i = idx as usize;
            if i >= UDP_PORTS.len() {
                return;
            }
            if udp[i].is_none() {
                match UdpSocket::bind("127.0.0.1:0") {
                    Ok(s) => {
                        if s
                            .connect(format!("127.0.0.1:{}", UDP_PORTS[i]))
                            .is_ok()
                        {
                            let _ = s.set_read_timeout(Some(Duration::from_secs(1)));
                            if let Ok(rx_s) = s.try_clone() {
                                let tx2 = tx.clone();
                                let jalan2 = jalan.clone();
                                thread::spawn(move || {
                                    let mut b = [0u8; 65535];
                                    loop {
                                        if !jalan2.load(Ordering::SeqCst) {
                                            break;
                                        }
                                        match rx_s.recv(&mut b) {
                                            Ok(0) => break,
                                            Ok(n) => {
                                                let mut v = Vec::with_capacity(7 + n);
                                                v.push(VER);
                                                v.push(K_UDP);
                                                v.push(idx);
                                                v.push(0);
                                                v.push(0);
                                                v.extend_from_slice(&(n as u16).to_be_bytes());
                                                v.extend_from_slice(&b[..n]);
                                                if tx2.send(v).is_err() {
                                                    break;
                                                }
                                            }
                                            Err(e)
                                                if e.kind() == std::io::ErrorKind::TimedOut
                                                    || e.kind()
                                                        == std::io::ErrorKind::WouldBlock =>
                                            {
                                                continue
                                            }
                                            Err(_) => break,
                                        }
                                    }
                                });
                            }
                            udp[i] = Some(s);
                        }
                    }
                    Err(e) => {
                        log(&format!("Relay: UDP {} gagal bind: {e}", UDP_PORTS[i]));
                        return;
                    }
                }
            }
            if let Some(s) = &udp[i] {
                let _ = s.send(data);
            }
        }
        K_OPEN => {
            let i = idx as usize;
            if i >= TCP_PORTS.len() {
                return;
            }
            let soket =
                std::net::SocketAddr::from(([127, 0, 0, 1], TCP_PORTS[i]));
            match TcpStream::connect_timeout(&soket, Duration::from_secs(8)) {
                Ok(s) => {
                    let _ = s.set_read_timeout(Some(Duration::from_secs(1)));
                    match s.try_clone() {
                        Ok(rx_s) => {
                            if let Ok(mut m) = tcp_map.lock() {
                                m.insert((idx, conn), Arc::new(Mutex::new(s)));
                            }
                            let tx2 = tx.clone();
                            let jalan2 = jalan.clone();
                            let tcp_map2 = tcp_map.clone();
                            thread::spawn(move || {
                                let mut rx_s = rx_s;
                                let mut b = [0u8; 32768];
                                loop {
                                    if !jalan2.load(Ordering::SeqCst) {
                                        break;
                                    }
                                    match rx_s.read(&mut b) {
                                        Ok(0) => break,
                                        Ok(n) => {
                                            let mut v = Vec::with_capacity(7 + n);
                                            v.push(VER);
                                            v.push(K_TCP);
                                            v.push(idx);
                                            v.push(conn);
                                            v.push(0);
                                            v.extend_from_slice(
                                                &(n as u16).to_be_bytes(),
                                            );
                                            v.extend_from_slice(&b[..n]);
                                            if tx2.send(v).is_err() {
                                                break;
                                            }
                                        }
                                        Err(e)
                                            if e.kind() == std::io::ErrorKind::TimedOut
                                                || e.kind()
                                                    == std::io::ErrorKind::WouldBlock =>
                                        {
                                            continue
                                        }
                                        Err(_) => break,
                                    }
                                }
                                if let Ok(mut m) = tcp_map2.lock() {
                                    m.remove(&(idx, conn));
                                }
                                let v = vec![VER, K_CLOSE, idx, conn, 0, 0, 0];
                                let _ = tx2.send(v);
                            });
                        }
                        Err(_) => {
                            let _ = tx.send(frame(K_CLOSE, idx, conn, 2, &[]));
                        }
                    }
                }
                Err(_) => {
                    let _ = tx.send(frame(K_CLOSE, idx, conn, 2, &[]));
                }
            }
        }
        K_TCP => {
            let penulis = tcp_map.lock().ok().and_then(|m| m.get(&(idx, conn)).cloned());
            if let Some(s) = penulis {
                if let Ok(mut w) = s.lock() {
                    let _ = w.write_all(data);
                }
            }
        }
        K_CLOSE => {
            if let Ok(mut m) = tcp_map.lock() {
                if let Some(s) = m.remove(&(idx, conn)) {
                    if let Ok(w) = s.lock() {
                        let _ = w.shutdown(std::net::Shutdown::Both);
                    }
                }
            }
            let _ = flags;
        }
        _ => {}
    }
}

// ---------- framing WebSocket ----------

/// Baca satu pesan WS utuh (gabung fragmentasi). Ok(None) = timeout sesaat.
fn baca_ws_pesan(
    baca: &mut TcpStream,
    frag: &mut Vec<u8>,
) -> Result<Option<(u8, Vec<u8>)>, String> {
    let mut head = [0u8; 2];
    match baca.read_exact(&mut head) {
        Ok(()) => {}
        Err(e)
            if e.kind() == std::io::ErrorKind::TimedOut
                || e.kind() == std::io::ErrorKind::WouldBlock =>
        {
            return Ok(None)
        }
        Err(e) => return Err(e.to_string()),
    }
    let fin = head[0] & 0x80 != 0;
    let opcode = head[0] & 0x0F;
    let masked = head[1] & 0x80 != 0;
    let mut len = (head[1] & 0x7F) as u64;
    if len == 126 {
        let mut e = [0u8; 2];
        baca.read_exact(&mut e).map_err(|e| e.to_string())?;
        len = u16::from_be_bytes(e) as u64;
    } else if len == 127 {
        let mut e = [0u8; 8];
        baca.read_exact(&mut e).map_err(|e| e.to_string())?;
        len = u64::from_be_bytes(e);
    }
    if len > 4 * 1024 * 1024 {
        return Err("frame WS terlalu besar".into());
    }
    let mask = if masked {
        let mut m = [0u8; 4];
        baca.read_exact(&mut m).map_err(|e| e.to_string())?;
        Some(m)
    } else {
        None
    };
    let mut data = vec![0u8; len as usize];
    baca.read_exact(&mut data).map_err(|e| e.to_string())?;
    if let Some(m) = mask {
        for (i, b) in data.iter_mut().enumerate() {
            *b ^= m[i % 4];
        }
    }
    if opcode == 8 || opcode == 9 || opcode == 10 {
        return Ok(Some((opcode, data)));
    }
    if opcode == 0 {
        frag.extend_from_slice(&data);
    } else {
        frag.clear();
        frag.extend_from_slice(&data);
    }
    if fin {
        let utuh = std::mem::take(frag);
        Ok(Some((if opcode == 0 { 2 } else { opcode }, utuh)))
    } else if frag.len() > 4 * 1024 * 1024 {
        Err("fragment WS terlalu besar".into())
    } else {
        // Belum lengkap: baca lanjutan (rekursi ekor manual via loop pemanggil).
        // Sederhanakan: anggap pesan kecil selalu satu frame; fragmentasi
        // lanjutan diproses pada pemanggilan berikut (frag dipertahankan).
        Ok(None)
    }
}

fn bingkai_ws_keluar(data: &[u8]) -> Vec<u8> {
    bingkai_ws_keluar_opcode(0x2, data)
}

fn bingkai_ws_keluar_opcode(opcode: u8, data: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(10 + data.len());
    v.push(0x80 | (opcode & 0x0F));
    if data.len() < 126 {
        v.push(data.len() as u8);
    } else if data.len() < 65536 {
        v.push(126);
        v.extend_from_slice(&(data.len() as u16).to_be_bytes());
    } else {
        v.push(127);
        v.extend_from_slice(&(data.len() as u64).to_be_bytes());
    }
    v.extend_from_slice(data);
    v
}

// ---------- base64 + SHA-1 minimal (untuk handshake WS) ----------

fn b64_encode(input: &[u8]) -> String {
    const ABJAD: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for pot in input.chunks(3) {
        let mut n: u32 = 0;
        for (i, &b) in pot.iter().enumerate() {
            n |= (b as u32) << (16 - 8 * i);
        }
        out.push(ABJAD[((n >> 18) & 63) as usize] as char);
        out.push(ABJAD[((n >> 12) & 63) as usize] as char);
        if pot.len() > 1 {
            out.push(ABJAD[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if pot.len() > 2 {
            out.push(ABJAD[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn sha1(pesan: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [
        0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0,
    ];
    let mut data = pesan.to_vec();
    let bit = (pesan.len() as u64).wrapping_mul(8);
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit.to_be_bytes());
    for blok in data.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                blok[4 * i],
                blok[4 * i + 1],
                blok[4 * i + 2],
                blok[4 * i + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let tmp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = tmp;
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }
    let mut out = [0u8; 20];
    for (i, x) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&x.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn jabat_tangan_ws_rfc6455() {
        // Vektor uji RFC 6455 §1.3.
        let terima = b64_encode(&sha1("dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11".as_bytes()));
        assert_eq!(terima, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn heuristik_relay() {
        assert!(perlu_relay_otomatis("192.168.1.5"));
        assert!(perlu_relay_otomatis("10.0.0.2"));
        assert!(perlu_relay_otomatis("100.64.0.9"));
        assert!(perlu_relay_otomatis("DESKTOP-ABC"));
        assert!(perlu_relay_otomatis(""));
        assert!(!perlu_relay_otomatis("203.0.113.7"));
        assert!(!perlu_relay_otomatis("pc.contoh.com"));
    }
}
