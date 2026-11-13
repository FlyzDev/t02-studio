# Linux/ARM64 and x86_64 friendly, local-only T02 Studio web runtime.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
RUN useradd --create-home --uid 10001 t02
USER 10001:10001
EXPOSE 8062

# The host publishes only a private LAN interface. Binding 0.0.0.0 here
# is strictly inside the container; it does NOT expose host-wide sockets.
CMD ["python", "-c", "from waitress import serve; from t02studio.server import create_app; serve(create_app(), host='0.0.0.0', port=8062, threads=4)"]
