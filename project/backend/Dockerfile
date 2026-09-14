FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ \
    -r requirements.txt

COPY . .

EXPOSE 8001
# Jumlah worker diatur env UVICORN_WORKERS (default 2). Satu worker membuat laporan
# berat (mis. laporan periode 30 hari, ~1 detik CPU) MENAHAN semua request lain di
# proses yang sama — kasir ikut menunggu, walau CPU masih lengang. Lihat
# docs/PANDUAN-WORKER-UVICORN.md untuk cara menakar jumlah worker dengan RAM Pi.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port 8001 --workers ${UVICORN_WORKERS:-2}"]
