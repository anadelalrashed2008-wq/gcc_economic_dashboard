# GCC Economic Monitor

Live macroeconomic dashboard for the six GCC countries, built on the World Bank Open Data API.
By Anadel AlRashed.

## Run it locally first (recommended)

You'll need [Node.js](https://nodejs.org) installed (any recent LTS version).

```bash
npm install
npm run dev
```

This opens the dashboard at `http://localhost:5173`. Because it's now a real webpage
(not a Claude.ai artifact preview), the live fetch to the World Bank API will work
normally — you should see real data load within a few seconds.

## Deploy it — pick one

### Option A: Vercel (easiest, free)
1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click "Add New Project."
3. Select the repo. Vercel auto-detects Vite — just click Deploy.
4. You'll get a live URL like `gcc-economic-monitor.vercel.app` in about a minute.

### Option B: Netlify (also easy, free)
1. Push this folder to GitHub.
2. Go to [netlify.com](https://netlify.com) → "Add new site" → "Import an existing project."
3. Build command: `npm run build`. Publish directory: `dist`.
4. Deploy.

### Option C: GitHub Pages (free, a bit more manual)
1. `npm run build` — this creates a `dist/` folder.
2. Push `dist/` to a `gh-pages` branch (or use the `gh-pages` npm package).
3. Enable GitHub Pages on that branch in your repo settings.

## Notes

- No API key or backend is required — the World Bank Open Data API is free and public.
- If you ever want a custom domain, all three hosts above support connecting one for free
  (you just point your DNS at them).
- The dashboard refetches live on every page load. If World Bank's API is briefly down,
  you'll see the same "couldn't reach" banner — that's expected and will clear on retry.
