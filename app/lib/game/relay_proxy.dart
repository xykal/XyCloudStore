import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

/// Proxy XY-RELAY v1 sisi HP (lihat docs/protokol-xy-relay.md).
///
/// Membungkus 8 port GameStream ke satu WebSocket aman (wss://) menuju agen
/// PC lewat Quick Tunnel Cloudflare — dipakai otomatis saat jalur langsung
/// gagal (PC di balik CGNAT). Moonlight cukup hubungkan ke 127.0.0.1.
class RelayFrame {
  static const ver = 0x01;
  static const kTcp = 0;
  static const kUdp = 1;
  static const kOpen = 2;
  static const kClose = 3;
  static const kPing = 4;
  static const kPong = 5;
  static const tcpPorts = [47984, 47989, 48010];
  static const udpPorts = [47998, 47999, 48000, 48002, 48010];

  final int kind;
  final int idx;
  final int conn;
  final int flags;
  final Uint8List payload;

  const RelayFrame(this.kind, this.idx, this.conn, this.flags, this.payload);

  static Uint8List encode(
      int kind, int idx, int conn, int flags, List<int> data) {
    final d = data.length > 65535 ? data.sublist(0, 65535) : data;
    final out = Uint8List(7 + d.length);
    out[0] = ver;
    out[1] = kind & 0xFF;
    out[2] = idx & 0xFF;
    out[3] = conn & 0xFF;
    out[4] = flags & 0xFF;
    out[5] = (d.length >> 8) & 0xFF;
    out[6] = d.length & 0xFF;
    out.setRange(7, 7 + d.length, d);
    return out;
  }

  /// Null bila frame cacat (versi salah / kurang panjang).
  static RelayFrame? decode(List<int> bytes) {
    if (bytes.length < 7 || bytes[0] != ver) return null;
    final len = (bytes[5] << 8) | bytes[6];
    if (bytes.length < 7 + len) return null;
    return RelayFrame(bytes[1], bytes[2], bytes[3], bytes[4],
        Uint8List.fromList(bytes.sublist(7, 7 + len)));
  }
}

class RelayProxy {
  RelayProxy._(this._ws);

  final WebSocket _ws;
  final List<ServerSocket?> _tcp = [null, null, null];
  final List<RawDatagramSocket?> _udp = [null, null, null, null, null];
  final Map<String, Socket> _koneksiTcp = {};
  final Map<int, InternetAddress> _udpAddr = {};
  final Map<int, int> _udpPort = {};
  int _connSeq = 0;
  Timer? _ping;
  bool _hidup = true;
  StreamSubscription? _wsSub;

  bool get hidup => _hidup;

  static Future<RelayProxy> hubungkan(String urlWss) async {
    final ws = await WebSocket.connect(urlWss)
        .timeout(const Duration(seconds: 25));
    final p = RelayProxy._(ws);
    try {
      await p._bindLokal();
    } catch (e) {
      await p.berhenti();
      rethrow;
    }
    p._jalankan();
    return p;
  }

  Future<void> _bindLokal() async {
    for (var i = 0; i < RelayFrame.tcpPorts.length; i++) {
      final srv =
          await ServerSocket.bind(InternetAddress.loopbackIPv4, RelayFrame.tcpPorts[i]);
      _tcp[i] = srv;
      srv.listen((sok) => _tcpMasuk(i, sok));
    }
    for (var i = 0; i < RelayFrame.udpPorts.length; i++) {
      final u = await RawDatagramSocket.bind(
          InternetAddress.loopbackIPv4, RelayFrame.udpPorts[i]);
      _udp[i] = u;
      u.listen((ev) {
        if (ev == RawSocketEvent.read) {
          Datagram? dg;
          while ((dg = u.receive()) != null) {
            _udpAddr[i] = dg!.address;
            _udpPort[i] = dg.port;
            _kirim(RelayFrame.encode(
                RelayFrame.kUdp, i, 0, 0, dg.data));
          }
        }
      });
    }
  }

  void _jalankan() {
    _wsSub = _ws.listen((data) {
      if (data is! List<int>) return;
      final f = RelayFrame.decode(
          data is Uint8List ? data : Uint8List.fromList(data));
      if (f == null) return;
      _frameMasuk(f);
    }, onError: (_) => berhenti(), onDone: () => berhenti());
    _ping = Timer.periodic(const Duration(seconds: 20), (_) {
      _kirim(RelayFrame.encode(RelayFrame.kPing, 0, 0, 0, const []));
    });
  }

  void _tcpMasuk(int idx, Socket sok) {
    _connSeq = (_connSeq % 255) + 1;
    final conn = _connSeq;
    final kunci = '$idx:$conn';
    _koneksiTcp[kunci] = sok;
    _kirim(RelayFrame.encode(RelayFrame.kOpen, idx, conn, 0, const []));
    sok.listen((data) {
      _kirim(RelayFrame.encode(RelayFrame.kTcp, idx, conn, 0, data));
    }, onError: (_) => _tcpTutup(idx, conn),
        onDone: () => _tcpTutup(idx, conn));
  }

  void _tcpTutup(int idx, int conn) {
    final kunci = '$idx:$conn';
    final sok = _koneksiTcp.remove(kunci);
    if (sok != null) {
      _kirim(RelayFrame.encode(RelayFrame.kClose, idx, conn, 0, const []));
      try {
        sok.destroy();
      } catch (_) {}
    }
  }

  void _frameMasuk(RelayFrame f) {
    switch (f.kind) {
      case RelayFrame.kTcp:
        _koneksiTcp['${f.idx}:${f.conn}']?.add(f.payload);
        break;
      case RelayFrame.kUdp:
        final u = (f.idx >= 0 && f.idx < _udp.length) ? _udp[f.idx] : null;
        final addr = _udpAddr[f.idx];
        final port = _udpPort[f.idx];
        if (u != null && addr != null && port != null) {
          try {
            u.send(f.payload, addr, port);
          } catch (_) {}
        }
        break;
      case RelayFrame.kClose:
        final sok = _koneksiTcp.remove('${f.idx}:${f.conn}');
        try {
          sok?.destroy();
        } catch (_) {}
        break;
      case RelayFrame.kPong:
        break;
      default:
        break;
    }
  }

  void _kirim(Uint8List frame) {
    if (!_hidup) return;
    try {
      _ws.add(frame);
    } catch (_) {
      berhenti();
    }
  }

  Future<void> berhenti() async {
    if (!_hidup) return;
    _hidup = false;
    _ping?.cancel();
    _ping = null;
    await _wsSub?.cancel();
    _wsSub = null;
    try {
      await _ws.close();
    } catch (_) {}
    for (final s in _koneksiTcp.values) {
      try {
        s.destroy();
      } catch (_) {}
    }
    _koneksiTcp.clear();
    for (var i = 0; i < _tcp.length; i++) {
      try {
        await _tcp[i]?.close();
      } catch (_) {}
      _tcp[i] = null;
    }
    for (var i = 0; i < _udp.length; i++) {
      try {
        _udp[i]?.close();
      } catch (_) {}
      _udp[i] = null;
    }
  }
}
