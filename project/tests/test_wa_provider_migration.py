"""Uji pemetaan provider WhatsApp legacy -> Hermes tanpa mengimpor server besar.

Ekstrak AST helper murni agar tes tidak memerlukan Mongo/FastAPI berjalan.
"""
import ast
import pathlib

SERVER = pathlib.Path(__file__).parents[1] / "backend" / "server.py"
TREE = ast.parse(SERVER.read_text(encoding="utf-8"))
WANTED = {"_WA_LEGACY_PROVIDERS", "_wa_effective_provider"}
parts = []
for node in TREE.body:
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        names = {n.id for n in getattr(node, "targets", []) if isinstance(n, ast.Name)}
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        if names & WANTED:
            parts.append(node)
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in WANTED:
        parts.append(node)
ns = {}
exec(compile(ast.Module(body=parts, type_ignores=[]), str(SERVER), "exec"), ns)
provider = ns["_wa_effective_provider"]


def test_legacy_providers_map_to_hermes():
    for raw in (None, "", "wacloud", "WACloud", "wacloud.id", "evolution", "Evolution"):
        assert provider({"provider": raw}) == "hermes"


def test_hermes_remains_hermes():
    assert provider({"provider": "hermes"}) == "hermes"


def test_unknown_is_not_silently_repaired():
    assert provider({"provider": "future-provider"}) == "future-provider"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("PASS", name)
