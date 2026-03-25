FROM python:3.11-slim

# Install LibreOffice and system dependencies
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-impress \
    fonts-noto-cjk \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p ./data/uploads

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
