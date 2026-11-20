# GrandPOS API image.
# No secrets are baked in: every credential arrives at runtime via env_file.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/grandpos

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root runtime user.
RUN useradd --create-home --uid 10001 grandpos \
    && chown -R grandpos:grandpos /srv/grandpos
USER grandpos

EXPOSE 8000

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
