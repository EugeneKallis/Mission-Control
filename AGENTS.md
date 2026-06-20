# Mission Control — Agent Guide

## Project Overview

A server-hosted service built with Next.js (React frontend + TypeScript API routes backend).  
Supports one-off TypeScript scripts for admin tasks and automation.

## Stack

| Layer        | Technology                                 |
| ------------ | ------------------------------------------ |
| Framework    | Next.js (App Router)                       |
| Frontend     | React                                      |
| Backend      | Next.js API Routes (TypeScript)            |
| Language     | TypeScript (app + scripts)                 |
| Task Runner  | Just (justfile)                            |
| Scripts      | `tsx` for running TypeScript one-off files |

## Structure

```
├── src/
│   ├── app/              # Next.js App Router (pages + API routes)
│   │   ├── page.tsx      # Frontend pages
│   │   └── api/          # Backend API routes
│   └── lib/              # Shared utilities, db clients, config
├── scripts/              # One-off TypeScript scripts (run via `just script`)
├── public/               # Static assets
├── justfile              # Project commands
└── AGENTS.md             # ← You are here
```

## Commands

Run via `just <command>`:

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `just setup`   | Install dependencies                     |
| `just init`    | Full setup + typecheck                   |
| `just dev`     | Start Next.js dev server                 |
| `just build`   | Production build                         |
| `just start`   | Start production server                  |
| `just script`  | Run a one-off script                     |
| `just lint`    | Lint code                                |
| `just typecheck` | Type-check app + scripts              |

## Key Conventions

- **API routes** live under `src/app/api/<route>/route.ts`
- **Shared logic** (DB, auth, helpers) goes in `src/lib/`
- **One-off scripts** go in `scripts/` and use the separate `tsconfig.scripts.json`
- **Everything is TypeScript** — strict mode enabled
- **Justfile** is the single source of truth for project commands

## Future Plans

- **pi.dev SDK integration** — SDK will be added to `src/lib/pi/` when available; the project is structured to import it cleanly from there
- **Service deployment** — will run as a systemd service or container; the `just start` / `just stop` / `just restart` targets are stubs for that

## Important!

This file is the living scope and convention document.  
**When you add a new capability, update this file** — new directories, new commands, new patterns, new scripts.  
Keeping AGENTS.md current ensures agents and collaborators stay aligned with the project shape.
