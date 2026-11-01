import hashlib
import json
import os

root = "/root/grandpos/pos-engine"
ota_dir = os.path.join(root, "project", "frontend", "public", "ota")
v = json.load(open(os.path.join(ota_dir, "version.json")))
bundle_path = os.path.join(ota_dir, "bundle.zip")
raw = open(bundle_path, "rb").read()
actual = "sha256:" + hashlib.sha256(raw).hexdigest()
print("version      :", v["version"])
print("declared sha :", v["checksum"])
print("actual   sha :", actual)
print("checksum MATCH:", v["checksum"] == actual)
print("declared size:", v["bundle_size"], "actual:", len(raw), "MATCH:", v["bundle_size"] == len(raw))
import zipfile
z = zipfile.ZipFile(bundle_path)
bad = z.testzip()
print("zip entries  :", len(z.namelist()))
print("zip integrity:", "OK" if bad is None else f"CORRUPT at {bad}")
