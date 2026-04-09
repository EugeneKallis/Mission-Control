FROM python:3.11-slim

WORKDIR /app

ENV TZ=America/New_York

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5056

CMD ["python", "main.py"]
