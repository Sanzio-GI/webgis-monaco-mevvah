# WebGIS Monaco — Mevvah

Interactive WebGIS map for Monaco with routing, layers, basemaps, and ambient jazz.

## Stack

- React + Vite (`artifacts/webgis`)
- Leaflet + OpenStreetMap data
- pnpm workspace monorepo

## Local development

```bash
pnpm install
cd artifacts/webgis
PORT=26061 BASE_PATH=/ pnpm run dev
```

## Deploy

- **GitHub Pages**: push to `main` — workflow `.github/workflows/deploy-pages.yml` builds and deploys automatically (enable Pages → GitHub Actions in repo settings).
- **Vercel**: import [Sanzio-GI/webgis-monaco-mevvah](https://github.com/Sanzio-GI/webgis-monaco-mevvah) — `vercel.json` is preconfigured for the WebGIS app.
