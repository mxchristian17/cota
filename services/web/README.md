# services/web — the CAD app

The Cota web app: the whole CAD engine and its user interface. TypeScript, React, Vite, Three.js,
three-bvh-csg and Zustand.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload (proxies `/api` to `http://localhost:8000`) |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built site |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; run `npx playwright install chromium` once) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

Build without the optional server (no login, files only): `VITE_CLOUD=off npm run build`. Serve from a
subfolder: `COTA_BASE=/cota/ npm run build`.

- `src/core/` — the CAD engine (document, commands, geometry, snapping, dimensions, layouts, file formats, PDF).
  Most of it has no React or Three.js dependency and is tested headless.
- `src/render/` — Three.js viewports, cameras and boolean evaluation.
- `src/ui/` — React components.
- `src/store/store.ts` — application state; connects the UI, the engine and the viewports.

See [architecture](../../docs/architecture.md) and [self-hosting](../../docs/self-hosting.md) for the
environment variables.
