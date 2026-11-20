-- Rollback migration 0005: kembalikan constraint ketat TANPA menghapus data.
--
-- Kolom `payments.tendered_drift` sengaja TIDAK di-drop: nilainya bukti kas
-- (shortage yang sudah terjadi) dan menghapusnya berarti menghapus audit trail.
-- Setelah rollback kolom tetap ada dengan DEFAULT 0 dan constraint ketat
-- dipasang kembali, sehingga aplikasi versi lama bisa menulis seperti semula.
--
-- Constraint `payments_tendered_drift_non_negative` dan
-- `payments_tendered_drift_cash_only` sengaja dipertahankan: keduanya tidak
-- menghalangi aplikasi versi lama (drift selalu 0) dan menjaga data tetap jujur.
--
-- Rollback menolak berjalan bila masih ada baris dengan tendered_drift > 0:
-- constraint ketat akan menolak baris itu, dan memaksa lolos berarti mengarang
-- `tendered`. Selesaikan dulu shortage-nya (atau catat koreksi kas), baru
-- rollback. Idempotent: DROP CONSTRAINT IF EXISTS sebelum ADD.

BEGIN;

DO $$
DECLARE
  drifted BIGINT;
BEGIN
  SELECT count(*) INTO drifted FROM payments WHERE tendered_drift <> 0;
  IF drifted > 0 THEN
    RAISE EXCEPTION
      '0005 rollback ditolak: % baris masih punya tendered_drift > 0. '
      'Selesaikan shortage/koreksi kas dulu; constraint lama tidak bisa menampung baris itu.',
      drifted;
  END IF;
END $$;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_cash_fields;
ALTER TABLE payments ADD CONSTRAINT payments_cash_fields CHECK (
  method <> 'cash'
  OR (tendered IS NOT NULL AND change_due IS NOT NULL AND tendered >= amount)
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_change_check;
ALTER TABLE payments ADD CONSTRAINT payments_change_check CHECK (
  method <> 'cash'
  OR change_due = tendered - amount
);

COMMIT;
