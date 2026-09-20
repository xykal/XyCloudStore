-- 0029: kolom agen.host_lan
--
-- src/sewa.js membaca agen.host_lan saat membuat sesi sewa (INSERT..SELECT
-- ... FROM agen) dan mengisinya dari heartbeat agen. Kolom ini belum pernah
-- ada di schema.sql maupun migrasi mana pun (host_lan pada migrasi 0028 adalah
-- kolom tabel sesi, bukan agen), sehingga mulai sewa bisa gagal 500
-- "no such column: host_lan" ketika agen mengirim host LAN.
ALTER TABLE agen ADD COLUMN host_lan TEXT;
