# Deploy & Local Build

## Local build now works

This machine has the toolchain installed, so you can typecheck and build **locally**
before pushing — instead of finding out about errors from a failed Vercel build.

Installed:

- **Node** (LTS) — installed via `winget install OpenJS.NodeJS.LTS`
- **Bun** — installed via `irm bun.sh/install.ps1 | iex` (lives in `C:\Users\lee\.bun\bin`)
- **Dependencies** — `node_modules` created with `bun install` (gitignored, never committed)

The project is a **TanStack Start + Vite** app. Scripts: `dev` = `vite dev`, `build` = `vite build`.

## Verify-before-push workflow

Run these from the repo root (`C:\Users\lee\Documents\survive-accounting-hub`) **before every push**:

```sh
bunx tsc --noEmit   # typecheck — must finish with no errors
bun run build       # production build — must complete and write .vercel/output
```

If both pass, the Vercel build will almost certainly pass too. If either fails,
fix the error before pushing rather than letting Vercel catch it.

> Note: plain `npx tsc` does **not** work on this machine — it fetches an unrelated
> deprecated `tsc` package instead of the project's TypeScript. Use `bunx tsc --noEmit`
> (or `node node_modules/typescript/bin/tsc --noEmit`).

## Preview the app locally

```sh
bun run dev
```

This starts the dev server and prints a local URL — **http://localhost:8080/**.
Open it in your browser to see the app running locally. Press `Ctrl+C` to stop it.

## First-time setup on a new machine

If `node_modules` is missing or you're on a fresh machine:

```sh
bun install
```

After installing Node or Bun for the first time, **open a new terminal** so the new
command is found on your PATH — a tool installed in an already-open terminal won't be
visible until you reopen it.
