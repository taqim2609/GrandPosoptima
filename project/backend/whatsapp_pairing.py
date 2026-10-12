import ipaddress
import re
import socket
from urllib.parse import urlsplit


BLOCKED_EVOLUTION_HOSTS = {"metadata.google.internal"}


def normalize_whatsapp_pairing_number(value: str) -> str:
    """Ubah input nomor Indonesia menjadi digit internasional untuk Evolution API."""
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0"):
        digits = f"62{digits[1:]}"
    if not digits.startswith("62") or not 10 <= len(digits) <= 15:
        return ""
    return digits


def validate_evolution_url(value: str, allow_private: bool = False) -> str:
    """Validasi target Evolution API; private host hanya boleh dari konfigurasi server."""
    url = (value or "").strip().rstrip("/")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL Evolution API harus memakai http:// atau https://")
    if parsed.username or parsed.password:
        raise ValueError("URL Evolution API tidak boleh berisi username/password")
    if parsed.hostname.endswith("."):
        # "localhost." / "metadata.google.internal." mem-bypass cek blokir & cache DNS lokal.
        raise ValueError("Host Evolution API tidak diizinkan")
    if parsed.hostname.lower() in BLOCKED_EVOLUTION_HOSTS:
        raise ValueError("Host Evolution API tidak diizinkan")

    try:
        addresses = {
            info[4][0]
            for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise ValueError("Host Evolution API tidak dapat ditemukan") from exc

    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global and not allow_private:
            raise ValueError("Evolution API harus menggunakan alamat publik")
    return url
