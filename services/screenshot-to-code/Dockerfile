FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git curl build-essential && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/abi/screenshot-to-code.git /app

WORKDIR /app/backend

RUN pip install --no-cache-dir poetry && poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

ENV IS_PROD=true
ENV PORT=7001

EXPOSE 7001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7001"]
