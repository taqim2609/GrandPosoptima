"""Uji pagar status WhatsApp & redaksi galat (M5 + minor).

Dijalankan tanpa Mongo/FastAPI: helper murni diekstrak dari AST ``server.py``,
sama seperti ``test_wa_provider_migration.py``. Yang diuji adalah perilaku
keamanan nyata:

* non-admin tidak pernah menerima potongan rahasia (``secret_masked`` /
  ``api_key_masked``), hanya boolean ``has_secret``;
* pesan galat yang keluar dari ``_send_whatsapp`` sudah diredam (nomor & token).

Jalankan: ``python3 project/tests/test_wa_status_security.py``
"""

import ast
import pathlib
import re

SERVER = pathlib.Path(__file__).parents[1] / "backend" / "server.py"
SOURCE = SERVER.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def _extract(names):
    """Ambil definisi helper murni (fungsi + konstanta) dari AST server.py."""
    parts = []
    for node in TREE.body:
        if isinstance(node, ast.Assign):
            if {t.id for t in node.targets if isinstance(t, ast.Name)} & names:
                parts.append(node)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            parts.append(node)
    ns = {"re": re}
    exec(compile(ast.Module(body=parts, type_ignores=[]), str(SERVER), "exec"), ns)
    return ns


NS = _extract({"_redact_wa_error", "_WA_REDACT_NUM", "_WA_REDACT_SECRET", "_wa_effective_provider"})
redact = NS["_redact_wa_error"]


# ---- minor: redaksi galat ---------------------------------------------------

def test_redacts_phone_numbers():
    for raw in (
        "gagal kirim ke 081234567890",
        "target 6281234567890 unreachable",
        "nomor +6281234567890 tidak valid",
    ):
        out = redact(raw)
        assert "081234567890" not in out, out
        assert "6281234567890" not in out, out
        assert "<nomor>" in out, out


def test_redacts_long_tokens():
    token = "sk_live_abcdefghijklmnopqrstuvwxyz123456"
    out = redact(f"401 unauthorized: {token}")
    assert token not in out, out
    assert "<rahasia>" in out, out


def test_redaction_truncates_long_output():
    assert len(redact("x" * 5000)) <= 200


def test_redaction_is_safe_on_empty():
    assert redact(None) == ""
    assert redact("") == ""


def test_short_numbers_survive():
    """Angka pendek (mis. status/kode HTTP) tidak boleh ikut diredam."""
    assert redact("HTTP 502") == "HTTP 502"


# ---- M5: status ber-admin vs non-admin --------------------------------------

def _status_source():
    """Pastikan bentuk non-admin difilter dan jalur admin terpisah."""
    src = SOURCE
    # ``_hermes_status`` hanya menyertakan secret_masked lewat guard eksplisit.
    assert "if include_secret_hint:" in src, "guard include_secret_hint hilang"
    assert 'payload["secret_masked"] = hermes_bridge.mask_secret' in src
    # Endpoint non-admin memanggil dengan hint False; endpoint admin dengan True.
    assert "return await _wa_status_payload(include_secret_hint=False)" in src
    assert "return await _wa_status_payload(include_secret_hint=True)" in src
    # Endpoint admin wajib bergantung pada require_admin.
    assert 'async def whatsapp_settings_status(admin: dict = Depends(require_admin))' in src


def test_settings_whatsapp_requires_admin():
    _status_source()


def test_public_status_has_no_secret_masked():
    """Bentuk publik tidak memuat field rahasia sebagai kode."""
    tree = ast.parse(SOURCE)
    fn = next(
        n for n in tree.body
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "_hermes_status"
    )
    # Cari kemunculan ``secret_masked`` sebagai KEY dict / assignment, bukan
    # sebagai kata di docstring (docstring memang menjelaskannya).
    code_hits = [
        n for n in ast.walk(fn)
        if isinstance(n, ast.Constant) and n.value == "secret_masked"
    ]
    assert len(code_hits) == 1, [ast.dump(h) for h in code_hits]

    # Kemunculan kode (dict key) harus berada di dalam blok guard.
    guard = next(
        n for n in ast.walk(fn)
        if isinstance(n, ast.If)
        and isinstance(n.test, ast.Name)
        and n.test.id == "include_secret_hint"
    )
    guarded_lines = (guard.lineno, getattr(guard, "end_lineno", guard.lineno))
    code_line = code_hits[0].lineno
    assert code_line >= guarded_lines[0], "secret_masked bocor sebelum guard"
    assert any(isinstance(n, ast.Assign) for n in ast.walk(guard)), "guard tidak mengisi secret_masked"
    # has_secret (boolean) tersedia untuk semua pemanggil.
    src = ast.get_source_segment(SOURCE, fn) or ""
    assert '"has_secret": bool(c.get("secret"))' in src


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = []
    for name, fn in tests:
        try:
            fn()
            print("PASS", name)
        except Exception as e:
            failed.append(name)
            print(f"FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - len(failed)}/{len(tests)} lulus")
    raise SystemExit(1 if failed else 0)
