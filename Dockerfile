FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
COPY wheels /wheels
RUN if ls /wheels/*.whl >/dev/null 2>&1; then \
      pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt; \
    else pip install --no-cache-dir -r requirements.txt; fi
COPY manage.py ./
COPY stockroom ./stockroom
COPY inventory ./inventory
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["waitress-serve", "--listen=0.0.0.0:8000", "--threads=8", "stockroom.wsgi:application"]
