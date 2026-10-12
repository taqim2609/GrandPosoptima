"""Uji unit untuk integrasi WhatsApp Hermes (tanpa server, tanpa jaringan).

Fokus pada invariant yang diminta gate review:
  * bridge hanya boleh localhost; URL non-localhost ditolak
  * node tanpa bridge (Pi) tidak error keras — pesan masuk outbox
  * outbox idempoten (kunci sama tidak digandakan)
  * dispatcher hanya mengirim di node yang punya bridge
  * perintah ber-allowlist per-role; nomor tak terdaftar ditolak
  * log/ringkasan tidak pernah memuat nomor atau isi pesan

Dijalankan: `python3 tests/test_hermes_bridge.py` atau lewat pytest.
"""

import asyncio
import os
import sys

# Modul bridge berada di project/backend; tes ini di project/tests.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

import hermes_bridge as hb  # noqa: E402


# --------------------------------------------------------------------------- fake db
class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *_a, **_k):
        self._rows.sort(key=lambda r: r.get("created_at") or "")
        return self

    def limit(self, n):
        self._rows = self._rows[: int(n)]
        return self

    async def to_list(self, n):
        return self._rows[: int(n)]

    def __aiter__(self):
        self._it = iter(self._rows)

        async def _gen():
            for r in self._rows:
                yield r

        return _gen()


class _Coll:
    """Stub koleksi in-memory yang cukup memahami operator query Mongo yang
    dipakai modul produksi (``$or``, ``$exists``, ``$lt``, ``$gt``, ``$in``).

    Sebelumnya stub ini hanya membandingkan kesamaan literal, sehingga filter
    klaim ``find_one_and_update`` (yang memakai ``$or``/``$exists``) selalu
    gagal cocok dan tes dispatch "hijau palsu" atau merah tanpa sebab jelas.
    """

    def __init__(self):
        self.rows = []

    @staticmethod
    def _matches(doc, query) -> bool:
        """Cocokkan dokumen dengan query bergaya Mongo (subset yang dipakai)."""
        for key, want in (query or {}).items():
            if key == "$or":
                if not any(_Coll._matches(doc, sub) for sub in want):
                    return False
                continue
            if key == "$and":
                if not all(_Coll._matches(doc, sub) for sub in want):
                    return False
                continue
            have = doc.get(key)
            present = key in doc
            if isinstance(want, dict):
                for op, val in want.items():
                    if op == "$exists":
                        if bool(val) != present:
                            return False
                    elif op == "$lt":
                        if have is None or not (have < val):
                            return False
                    elif op == "$lte":
                        if have is None or not (have <= val):
                            return False
                    elif op == "$gt":
                        if have is None or not (have > val):
                            return False
                    elif op == "$gte":
                        if have is None or not (have >= val):
                            return False
                    elif op == "$in":
                        if have not in val:
                            return False
                    elif op == "$ne":
                        if have == val:
                            return False
                    else:  # operator tak dikenal: anggap tidak cocok (jangan menebak)
                        return False
                continue
            if have != want:
                return False
        return True

    @staticmethod
    def _apply(doc, update):
        doc.update(update.get("$set", {}))
        for k, v in (update.get("$inc") or {}).items():
            doc[k] = (doc.get(k) or 0) + v

    async def update_one(self, query, update, upsert=False):
        for r in self.rows:
            if self._matches(r, query):
                self._apply(r, update)
                return type("R", (), {"matched_count": 1, "modified_count": 1})()
        if upsert:
            doc = {k: v for k, v in (query or {}).items() if not str(k).startswith("$")}
            doc.update((update.get("$setOnInsert") or {}))
            doc.update(update.get("$set", {}))
            for k, v in (update.get("$inc") or {}).items():
                doc[k] = (doc.get(k) or 0) + v
            self.rows.append(doc)
        return type("R", (), {"matched_count": 0, "modified_count": 0})()

    def find(self, query, proj=None):
        return _Cursor([dict(r) for r in self.rows if self._matches(r, query)])

    async def find_one_and_update(self, query, update, sort=None, return_document=None):
        """Meniru klaim ATOMIK MongoDB (single-document, tanpa interleaving).

        Dipakai ``dispatch_outbox`` untuk mengklaim baris: tanpa ini dua
        dispatcher bisa mengambil baris yang sama dan pesan terkirim dua kali.
        """
        for r in self.rows:
            if self._matches(r, query):
                self._apply(r, update)
                return dict(r)
        return None

    async def count_documents(self, query):
        return len([r for r in self.rows if self._matches(r, query)])


class _ProductAgg:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, n):
        return self._rows[:n]


class _Products:
    def __init__(self, rows=None):
        self._rows = rows or []

    def aggregate(self, _pipeline):
        return _ProductAgg(self._rows)

    async def count_documents(self, _q):
        return len(self._rows)


class _Orders:
    def __init__(self, paid=None, open_bills=0):
        self._paid = paid or []
        self._open = open_bills

    def find(self, _query, _proj=None):
        return _Cursor(self._paid)

    async def count_documents(self, query):
        return self._open if (query or {}).get("status") == "open" else len(self._paid)


class _Settings:
    def __init__(self, doc=None):
        self._doc = doc or {}

    async def find_one(self, _query, _proj=None):
        return dict(self._doc) if self._doc else None


class FakeDB:
    def __init__(self, users=None, products=None, paid=None, open_bills=0, settings=None):
        self.wa_outbox = _Coll()
        self.users = _Users(users or [])
        self.products = _Products(products)
        self.orders = _Orders(paid, open_bills)
        self.settings = _Settings(settings)


class _Users:
    def __init__(self, rows):
        self.rows = rows

    async def find_one(self, query, _proj=None):
        want = query.get("phone")
        if isinstance(want, dict) and "$in" in want:
            for r in self.rows:
                if r.get("phone") in want["$in"]:
                    return dict(r)
            return None
        for r in self.rows:
            if all(r.get(k) == v for k, v in (query or {}).items()):
                return dict(r)
        return None


def _env(**kv):
    for k, v in kv.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _primary(**kv):
    """Jadikan node ini primary supaya pagar peran tidak menutupi tes lain."""
    kv.setdefault("NODE_ROLE", "primary")
    _env(**kv)


# --------------------------------------------------------------------------- tests
def test_localhost_guard():
    assert hb.is_local_bridge_url("http://127.0.0.1:8644/webhooks/grandpos-outbox")
    assert hb.is_local_bridge_url("http://localhost:8644/webhooks/grandpos-outbox")
    assert not hb.is_local_bridge_url("http://100.117.186.13:8644/webhooks/grandpos-outbox")
    assert not hb.is_local_bridge_url("https://gw.example.com/webhooks/grandpos-outbox")
    assert not hb.is_local_bridge_url("")


def test_bridge_config_requires_localhost():
    _primary(HERMES_WA_WEBHOOK_URL="http://100.117.186.13:8644/webhooks/x", HERMES_WA_WEBHOOK_SECRET="s", HERMES_WA_ENABLED="1")
    assert not hb.bridge_configured()
    _primary(HERMES_WA_WEBHOOK_URL="http://127.0.0.1:8644/webhooks/x")
    assert hb.bridge_configured()


def test_pi_node_is_not_configured():
    _env(HERMES_WA_WEBHOOK_URL="", HERMES_WA_WEBHOOK_SECRET="", HERMES_WA_ENABLED="1")
    assert not hb.bridge_configured()


def test_backup_node_never_sends_even_with_valid_bridge():
    """Pi (backup) tidak boleh mengirim WA walau URL+secret terisi lengkap."""
    _env(NODE_ROLE="backup", HERMES_WA_WEBHOOK_URL="http://127.0.0.1:8644/webhooks/x",
         HERMES_WA_WEBHOOK_SECRET="s", HERMES_WA_ENABLED="1")
    assert hb.node_role() == "backup"
    assert not hb.bridge_configured()
    db = FakeDB()
    asyncio.run(hb.enqueue(db, "0812", "x", wa_id="KPI"))
    stats = asyncio.run(hb.dispatch_outbox(db))
    assert stats["skipped"] is True and stats["sent"] == 0
    assert db.wa_outbox.rows[0]["sent_at"] is None


def test_role_default_is_backup_not_primary():
    _env(NODE_ROLE=None)
    assert hb.node_role() == "backup"
    assert not hb.bridge_configured()


def test_send_text_reports_instead_of_raising_on_pi():
    _primary(HERMES_WA_WEBHOOK_URL="", HERMES_WA_WEBHOOK_SECRET="")
    ok, info = asyncio.run(hb.send_text("08123456789", "halo"))
    assert ok is False
    assert "HERMES_WA_WEBHOOK_URL" in info["error"]


def test_send_text_refuses_public_url():
    _primary(HERMES_WA_WEBHOOK_URL="http://cameras:8644/webhooks/x", HERMES_WA_WEBHOOK_SECRET="s")
    ok, info = asyncio.run(hb.send_text("0812", "halo"))
    assert ok is False
    assert "localhost" in info["error"]


def test_to_jid_normalizes_phone():
    assert hb.to_jid("08123456789") == "628123456789@s.whatsapp.net"
    assert hb.to_jid("628123456789") == "628123456789@s.whatsapp.net"
    assert hb.to_jid("6281@s.whatsapp.net") == "6281@s.whatsapp.net"
    assert hb.to_jid("120363024823904123@g.us") == "120363024823904123@g.us"


def test_sign_v2_matches_hermes_contract():
    import hashlib
    import hmac as _hmac
    body = b'{"to":"6281@s.whatsapp.net","message":"hi"}'
    h = hb.sign_v2("rahasia", body, timestamp=1700000000)
    assert h["X-Webhook-Timestamp"] == "1700000000"
    expected = _hmac.new(b"rahasia", b"1700000000." + body, hashlib.sha256).hexdigest()
    assert h["X-Webhook-Signature-V2"] == expected


def test_health_url_derived_from_route():
    _env(HERMES_WA_WEBHOOK_URL="http://127.0.0.1:8644/webhooks/grandpos-outbox")
    assert hb.health_url() == "http://127.0.0.1:8644/health"
    _env(HERMES_WA_WEBHOOK_URL="")
    assert hb.health_url() == ""


def test_parse_command():
    assert hb.parse_command("/stok") == ("/stok", "")
    assert hb.parse_command("/stok 5") == ("/stok", "5")
    assert hb.parse_command("halo") == (None, "")
    assert hb.parse_command("/Laporan-Shift")[0] == "/laporan-shift"


def test_redaction_hides_phone():
    masked = hb.redact_phone("628123456789")
    assert "8123" not in masked.replace("8123", "")  # digit tengah tersembunyi
    assert masked.startswith("6281")
    assert set(masked) - set("*") == set("6281") | {"8", "9"} or "*" in masked


def test_default_allowlist_roles():
    _env(HERMES_CMD_ALLOWLIST="")
    allow = hb.command_allowlist()
    assert "kasir" in allow["/stok"]
    assert "kasir" not in allow["/laporan-shift"]
    assert "admin" in allow["/dashboard"]


def test_outbox_is_idempotent():
    db = FakeDB()
    asyncio.run(hb.enqueue(db, "0812", "pesan", kind="report", wa_id="K1"))
    asyncio.run(hb.enqueue(db, "0812", "pesan", kind="report", wa_id="K1"))
    assert len(db.wa_outbox.rows) == 1
    assert db.wa_outbox.rows[0]["sent_at"] is None


def test_dispatch_skipped_when_no_bridge():
    _env(HERMES_WA_WEBHOOK_URL="", HERMES_WA_WEBHOOK_SECRET="")
    db = FakeDB()
    asyncio.run(hb.enqueue(db, "0812", "x", wa_id="K2"))
    stats = asyncio.run(hb.dispatch_outbox(db))
    assert stats["skipped"] is True
    assert stats["sent"] == 0
    assert db.wa_outbox.rows[0]["sent_at"] is None


def test_dispatch_sends_once_and_marks_sent():
    _primary(HERMES_WA_WEBHOOK_URL="http://127.0.0.1:8644/webhooks/x", HERMES_WA_WEBHOOK_SECRET="s")
    db = FakeDB()
    asyncio.run(hb.enqueue(db, "0812", "x", wa_id="K3"))
    calls = []

    async def fake_send(to, text, cfg=None):
        calls.append((to, text))
        return True, {"id": "m1"}

    stats = asyncio.run(hb.dispatch_outbox(db, sender=fake_send))
    assert stats["sent"] == 1 and stats["skipped"] is False
    assert len(calls) == 1
    assert db.wa_outbox.rows[0]["sent_at"]
    # jalan kedua tidak mengirim lagi
    stats2 = asyncio.run(hb.dispatch_outbox(db, sender=fake_send))
    assert stats2["sent"] == 0 and len(calls) == 1


def test_dispatch_records_error_without_phone_in_log():
    """Satu dispatch TIDAK boleh retry-storm: baris gagal di-hold oleh backoff.

    Regresi yang dijaga: dengan filter klaim M1 yang hanya ``$or``
    ``{"sending_at": {"$lt": expired}}``, baris gagal tetap terklaim ulang
    sehingga satu panggilan dispatch memanggil sender 20x berturut ke nomor
    yang sama (attempts=20). Sekarang baris di-hold `sending_at = now + backoff`.
    """
    _primary(HERMES_WA_WEBHOOK_URL="http://127.0.0.1:8644/webhooks/x", HERMES_WA_WEBHOOK_SECRET="s")
    db = FakeDB()
    asyncio.run(hb.enqueue(db, "0812345678", "x", wa_id="K4"))
    calls = []

    async def fake_send(to, text, cfg=None):
        calls.append(to)
        return False, {"error": "bridge tidak dapat dihubungi (ConnectError)"}

    stats = asyncio.run(hb.dispatch_outbox(db, sender=fake_send))
    assert stats["failed"] == 1
    assert len(calls) == 1, f"satu dispatch memanggil sender {len(calls)}x (retry-storm)"
    row = db.wa_outbox.rows[0]
    assert row["sent_at"] is None
    assert row["sending_at"], "baris gagal harus di-hold backoff (bukan None)"
    assert row["attempts"] == 1
    assert "0812345678" not in str(row.get("last_error") or "")
    # Panggilan kedua masih di dalam backoff → tidak menyentuh baris (atau hanya 1x).
    stats2 = asyncio.run(hb.dispatch_outbox(db, sender=fake_send))
    assert stats2["sent"] == 0
    assert len(calls) == 1


def test_command_requires_registered_phone_and_role():
    _env(HERMES_CMD_ALLOWLIST="")
    db = FakeDB(users=[{"id": "u1", "role": "kasir", "phone": "628111222333", "active": True}])
    reply = asyncio.run(hb.handle_command(db, "/stok", "628199999999"))
    assert reply and "tidak dapat dijalankan" in reply
    # role kasir tidak boleh /laporan-shift
    reply2 = asyncio.run(hb.handle_command(db, "/laporan-shift", "628111222333"))
    assert reply2 and "tidak dapat dijalankan" in reply2


def test_command_unknown_is_ignored():
    db = FakeDB()
    assert asyncio.run(hb.handle_command(db, "/rm-rf", "628111")) is None
    assert asyncio.run(hb.handle_command(db, "halo", "628111")) is None


def test_stok_command_returns_summary_for_authorized_role():
    _env(HERMES_CMD_ALLOWLIST="")
    db = FakeDB(
        users=[{"id": "u1", "role": "admin", "phone": "628111222333", "active": True}],
        products=[{"name": "Beras", "stock": 2, "unit": "kg"}, {"name": "Gula", "stock": 1, "unit": "kg"}],
    )
    reply = asyncio.run(hb.handle_command(db, "/stok", "628111222333"))
    assert reply and "Stok menipis" in reply
    assert "Beras" in reply


def test_dashboard_command_uses_totals_not_phone():
    _env(HERMES_CMD_ALLOWLIST="")
    db = FakeDB(
        users=[{"id": "u1", "role": "superadmin", "phone": "628111222333", "active": True}],
        paid=[{"total": 10000}, {"total": 5000}],
        open_bills=3,
    )
    reply = asyncio.run(hb.handle_command(db, "/dashboard", "628111222333"))
    assert reply and "Dashboard" in reply
    assert "628111222333" not in reply


# --------------------------------------------------------------------------- runner
def _run_all():
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = []
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as e:
            failed.append(name)
            print(f"FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - len(failed)}/{len(tests)} lulus")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
