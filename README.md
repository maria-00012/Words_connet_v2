# Words Connect

Words Connect is a one-time, teacher-led paraphrasing workshop. The application uses a React/Vite/Tailwind frontend and a Node.js/Express/Socket.IO backend. In production, one Node.js service serves the built frontend, API, and realtime connection.

## Requirements

- Node.js 20.20+ or 22.12+
- npm 10 or newer

## Install

From the repository root:

```sh
npm run install:all
```

The root npm workspace installs frontend and backend dependencies together. Copy `.env.example` to `.env` to customize local server settings; the backend loads that file in development and production. Shell environment variables override values from `.env`.

## Development

```sh
npm run dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api` and Socket.IO traffic to Express at `http://localhost:3001`.

## Production build and start

```sh
npm run build
npm start
```

The production server serves the frontend build and API/Socket.IO on the same port. Set `NODE_ENV=production` and optionally `PORT` in the environment. The default backend port is `3001`.

## Health check

`GET /api/health` returns `{"status":"ok"}` while the server is running.

This foundation does not include session management, a database, permanent accounts, or Groq integration.
