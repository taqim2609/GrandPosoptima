-- GrandPOS migration 0005: payments.tendered_drift — fakta kas vs alokasi buku.
--
-- Masalah yang diselesaikan
-- ------------------------
-- Saat kiosk mengirim harga basi dan gudang memakai harga katalog yang lebih
-- tinggi, total otoritatif naik. `amount` boleh disesuaikan (itu alokasi buku),
-- tetapi `tendered` adalah uang yang benar-benar diterima kasir dan tidak boleh
-- dikarang. Constraint lama (`tendered >= amount`, `change_due = tendered - amount`)
-- memaksa aplikasi menaikkan `tendered` — mengarang penerimaan tunai, membuat
-- change_due 0, dan menyembunyikan shortage saat tutup shift.
--
-- Kontrak baru
-- ------------
--   tendered_drift = bagian `amount` yang tidak pernah diterima kasir.
--   change_due     = tendered + tendered_drift - amount  (>= 0)
--   tendered + tendered_drift >= amount                  (baris tunai)
--
-- Drift adalah shortage operasional (kurang bayar), bukan surplus. Kas fisik
-- tetap `tendered`, sedangkan `cash_movements.sale_cash` memakai `amount`,
-- sehingga selisihnya muncul sendiri sebagai variance negatif di tutup shift.
--
-- Urutan aman
-- -----------
--   1. tambah kolom NOT NULL DEFAULT 0 (PG12+: metadata-only, tanpa rewrite)
--   2. validasi baris lama: drift wajib 0 karena transaksi lama tidak pernah
--      mencatatnya; baris non-cash wajib 0. Tidak ada backfill karena baris
--      lama selalu memenuhi `change_due = tendered - amount`, yang identik
--      dengan kontrak baru saat drift = 0.
--   3. ganti dua constraint menjadi bentuk yang menyertakan drift.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS sebelum ADD,
-- jadi aman dijalankan berulang kali. Rollback ada di
-- 0005_payment_tendered_drift_rollback.sql dan TIDAK menghapus kolom/datanya.

BEGIN;

-- 1. Kolom drift.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tendered_drift BIGINT NOT NULL DEFAULT 0;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_tendered_drift_non_negative;
ALTER TABLE payments
  ADD CONSTRAINT payments_tendered_drift_non_negative CHECK (tendered_drift >= 0);

-- Drift hanya bermakna untuk baris tunai: QRIS/kartu tidak punya "uang
-- diterima" yang bisa kurang, jadi drift di sana selalu salah catat.
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_tendered_drift_cash_only;
ALTER TABLE payments
  ADD CONSTRAINT payments_tendered_drift_cash_only CHECK (method = 'cash' OR tendered_drift = 0);

COMMENT ON COLUMN payments.tendered_drift IS
  'Bagian `amount` yang tidak pernah diterima kasir (shortage operasional). '
  'tendered + tendered_drift = amount yang dialokasikan ke baris ini.';

-- 2. Validasi baris lama sebelum constraint baru dipasang. Kalau ada data yang
-- tidak bisa dijelaskan oleh kontrak baru, migrasi berhenti di sini — lebih
-- baik gagal daripada menimpa fakta kas.
DO $$
DECLARE
  bad_non_cash BIGINT;
  bad_cash     BIGINT;
BEGIN
  SELECT count(*) INTO bad_non_cash
    FROM payments
   WHERE method <> 'cash' AND tendered_drift <> 0;

  SELECT count(*) INTO bad_cash
    FROM payments
   WHERE method = 'cash'
     AND (tendered IS NULL OR change_due IS NULL
          OR change_due <> tendered + tendered_drift - amount);

  IF bad_non_cash > 0 THEN
    RAISE EXCEPTION '0005: % baris non-cash sudah punya tendered_drift tidak nol', bad_non_cash;
  END IF;
  IF bad_cash > 0 THEN
    RAISE EXCEPTION '0005: % baris cash melanggar change_due = tendered + tendered_drift - amount', bad_cash;
  END IF;
END $$;

-- 3. Ganti constraint lama dengan bentuk yang menyertakan drift.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_cash_fields;
ALTER TABLE payments ADD CONSTRAINT payments_cash_fields CHECK (
  method <> 'cash'
  OR (tendered IS NOT NULL AND change_due IS NOT NULL
      AND tendered + tendered_drift >= amount)
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_change_check;
ALTER TABLE payments ADD CONSTRAINT payments_change_check CHECK (
  method <> 'cash'
  OR change_due = tendered + tendered_drift - amount
);

COMMIT;
