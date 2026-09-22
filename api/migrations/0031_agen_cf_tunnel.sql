-- 0031: named tunnel Cloudflare per unit PC (XY-RELAY v1 mode named).
--
-- Worker memegang CF_API_TOKEN (secret, bukan di repo) dan membuatkan satu
-- tunnel + hostname relay-<idunit>.xycloud.my.id per agen. Tunnel token hanya
-- dikirim ke agen pemilik dan TIDAK disimpan di DB; bila agen butuh lagi,
-- Worker mengambilnya ulang via API Cloudflare (GET .../token).
ALTER TABLE agen ADD COLUMN cf_tunnel_id TEXT;
ALTER TABLE agen ADD COLUMN cf_hostname TEXT;
