# BETCCO Frontend

The BETCCO frontend is a Next.js App Router application with Arabic/English support, RTL/LTR layouts, React Query API integration, and GSAP motion that respects reduced-motion preferences.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/ar`. The API is proxied through `/api/v1` to `BETCCO_API_URL` or, by default, `http://localhost:5085`.

For Windows PowerShell environments where the `pnpm` script is blocked:

```powershell
& "C:\Program Files\nodejs\npx.cmd" --yes pnpm@11.19.0 --dir .\frontend dev
```

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Set `BETCCO_NEXT_DIST_DIR` only when an isolated Next build output is required, such as a OneDrive-safe local verification build.
