# ── Builder ───────────────────────────────────────────────────────────────────
# linux/amd64 ensures megadetector's mkl dependency has wheels (mkl is x86-only).
# Local ARM Macs use QEMU emulation; GCP Cloud Build runs natively on amd64.
FROM --platform=linux/amd64 python:3.10-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        cmake \
        build-essential \
        protobuf-compiler \
        libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .

RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Runtime ───────────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 python:3.10-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /venv /venv

WORKDIR /app
COPY inference.py .

ENV PATH="/venv/bin:$PATH"
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 CMD /venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/healthz').read()"

CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 300 inference:app"]
