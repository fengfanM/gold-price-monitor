FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV CHRONOS_MODEL_ID=amazon/chronos-bolt-base
ENV CHRONOS_DEVICE=cpu
ENV CHRONOS_TORCH_DTYPE=float32
ENV CHRONOS_ENABLE_FALLBACK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
