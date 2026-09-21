import 'package:flutter_test/flutter_test.dart';
import 'package:xycloud_order/game/relay_proxy.dart';

void main() {
  test('frame roundtrip (TCP/UDP/OPEN/CLOSE/PING)', () {
    for (final kind in [
      RelayFrame.kTcp,
      RelayFrame.kUdp,
      RelayFrame.kOpen,
      RelayFrame.kClose,
      RelayFrame.kPing,
      RelayFrame.kPong,
    ]) {
      final data = kind == RelayFrame.kUdp
          ? List<int>.generate(1200, (i) => i % 251)
          : [1, 2, 3, 250];
      final b = RelayFrame.encode(kind, 2, 77, 0, data);
      final f = RelayFrame.decode(b)!;
      expect(f.kind, kind);
      expect(f.idx, 2);
      expect(f.conn, 77);
      expect(f.flags, 0);
      expect(f.payload, data);
    }
  });

  test('frame cacat ditolak', () {
    expect(RelayFrame.decode([]), isNull);
    expect(RelayFrame.decode([0x02, 0, 0, 0, 0, 0, 1, 9]), isNull); // ver salah
    expect(RelayFrame.decode([0x01, 0, 0, 0, 0, 0]), isNull); // kurang header
    expect(RelayFrame.decode([0x01, 1, 0, 0, 0, 0, 5, 1, 2]), isNull); // len > isi
  });

  test('payload dipotong 64KB', () {
    final besar = List<int>.filled(70000, 7);
    final b = RelayFrame.encode(RelayFrame.kUdp, 0, 0, 0, besar);
    expect(b.length, 7 + 65535);
    expect(RelayFrame.decode(b)!.payload.length, 65535);
  });
}
