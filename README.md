# ClawTrading

Night Army Trader dashboard and APIs, deployed at:

- **Production URL:** https://trade.nightsub.ir

A Next.js-based trading web app with live market endpoints and dashboard pages.

## Current Development Focus (IMPORTANT)

Project is intentionally narrowed to one active scope:
- **Polymarket BTC, 5-minute market only**

Phase 2 and Phase 3 are intentionally on hold and moved to:
- `future-phases/phase-2-observer/`
- `future-phases/phase-3-platform/`

See `PROJECT_PHASES.md` for full policy.

## Features

- Landing page and trading modules (`/`, `/scalper`)
- Server API routes for live trading data:
  - `/api/price`
  - `/api/chart`
  - `/api/signals`
  - `/api/news`
  - `/api/fear-greed`
- Optional Python bot workspace under `bot/`

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

## Project Structure

```text
app/
  api/
  components/
  scalper/
bot/
public/
services/
rust-indexer/
```

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production Run

```bash
npm install
npm run build
npm run start
```

## Environment Variables

Copy `.env.example` to `.env` and set values as needed:

```bash
cp .env.example .env
```

Main vars:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `CRYPTOCOMPARE_API_KEY`
- `CRYPTOPANIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Nginx Example

```nginx
server {
    listen 80;
    server_name trade.nightsub.ir;

    root /var/www/trade.nightsub.ir/server/app;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/static/ {
        alias /var/www/trade.nightsub.ir/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }
}
```

## Notes

- `next.config.ts` uses `distDir: 'dist'`.
- Keep `node_modules`, `dist`, and `.env` out of git.
