# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/lucias-kueche` (`@workspace/lucias-kueche`)

React + Vite recipe management SPA backed by the `@workspace/api-server`. Features:
- **Authentication**: JWT-based login (email/password). Single user system (lucia.aldering@googlemail.com). Protected by AuthContext/useAuth hook. Non-authenticated users redirected to login page.
- **Login Page** (`src/pages/Login.tsx`): Full-screen immersive design with real Unsplash kitchen/food photo as background, glassmorphism (frosted glass) card overlay containing the login form, script-font logo centered above the card, and inspirational quote below. No split-panel layout.
- **Onboarding** (`src/pages/Onboarding.tsx`): First-time welcome flow with 6 action cards. Shown when `user.onboardingCompleted === false`. Completing onboarding navigates to main app.
- **Profil Page** (`src/pages/Profil.tsx`): Route `/profil` accessible via nav tab and avatar dropdown. Includes: avatar upload, personal data editor, password change with strength indicator, cooking personality (level, styles, dietary), recipe statistics, and dynamic badge system.
- **App Shell Navigation** (`src/App.tsx`): Compact header (logo left + avatar right, no tab bar). Fixed bottom navigation with 4 icon+label tabs (Rezepte, Kochidee/Lightbulb, Wochenplan, Statistiken). Active tab highlighted with amber/orange indicator. Safe-area-inset support for iPhones. Avatar dropdown has: Mein Profil, Einstellungen, Abmelden.
- **Was koche ich heute? / Kochidee** (`src/pages/WasKocheIch.tsx`): New page reachable via "Kochidee" bottom nav tab. Three input sections: (1) ingredient chip selector loaded from `GET /api/ingredients` plus custom ingredient input; (2) fridge photo upload/camera trigger → analyzed via `POST /api/extract-fridge` (OpenAI vision) → detected ingredients auto-added as chips; (3) mood filter section with "Heute Lust auf..." (liked, green) and "Heute auf keinen Fall..." (disliked, red) chips for categories and time ranges. Recipe suggestions automatically appear (debounced 600ms) using `POST /api/recipes/suggest` sorted by ingredient match count + mood score. Clicking a suggestion opens the RecipeModal.
- **Meine Rezepte**: Recipe gallery with category/time filters, search, recipe detail modal. Upgraded recipe cards with 4:3 image ratio, category badge overlay, time chip overlay, warm shadow. FAB (Floating Action Button, terracotta round 56px) for quick new-recipe creation. "PDF hochladen" and "URL importieren" buttons. Mode toggle: Galerie / Verwalten.
- **Wochenplan & Einkaufsliste**: Date-based calendar weekly planner with navigation (previous/next week, "Heute" button to return to current week). Each day cell shows real calendar date. Meal plan entries are persisted in the DB (`meal_plans` table). Shopping list has date-range filter: "Diese Woche", "Nächste 7 Tage", or custom from/to date picker.
- **Statistiken & Muster**: Pie/bar/horizontal-bar charts (Recharts) for category distribution, cooking time, difficulty, top favorites (by rating + cook count), and Lucia's cook profile.
- **PDF Upload Modal** (`src/components/PdfUploadModal.tsx`): Drag-and-drop PDF upload → sends base64 to `/api/extract-pdf` → AI extracts recipes → user selects which ones to add.
- All recipe data fetched from API via `src/hooks/useRecipes.ts` — no hardcoded data in the frontend.
- Types defined in `src/types/recipe.ts` (rich model: structured ingredients, category string, rating string, prepTime/totalTime strings, etc.)
- Vite proxy configured: `/api` → `http://localhost:${API_PORT ?? 8080}`
- Color palette: warm cream gradient background (f9efe0→f2e4c8), rich forest green #3d6849/#4A7C59, terracotta #C1693A, amber accents. Richer/more saturated than before.
- All app pages have pb-28 padding at bottom to clear fixed bottom nav. Min 48px touch targets on interactive elements.
- Fonts: Dancing Script (script/title), Lora (serif headings), Inter (body)
- Packages: recharts, framer-motion, react-hook-form, date-fns, @hookform/resolvers

### Auth System

- **DB schema**: `lib/db/src/schema/users.ts` — `users` table with: id, displayName, email, passwordHash, avatarUrl, bio, cookingLevel, favoriteCategories, dietaryPreference, onboardingCompleted, createdAt
- **Seeded user**: lucia.aldering@googlemail.com / #weltbestekoechin2026 (bcrypt hashed)
- **Auth routes** (`artifacts/api-server/src/routes/auth.ts`):
  - `POST /api/auth/login` — returns JWT (30d) + user object (no passwordHash)
  - `GET /api/auth/me` — returns current user (requires Bearer token)
  - `POST /api/auth/logout` — clears session (stateless, client handles token deletion)
  - `PUT /api/auth/profile` — updates displayName, bio, cookingLevel, favoriteCategories, dietaryPreference, onboardingCompleted
  - `PUT /api/auth/password` — verifies old password, sets new bcrypt hash
  - `POST /api/auth/avatar` — saves avatarUrl (base64 data URL)
- **JWT secret**: env var `JWT_SECRET` (fallback: hardcoded dev secret)
- **Frontend auth**: `src/contexts/AuthContext.tsx` — AuthProvider + useAuth hook. Token stored in `localStorage` key `lk_auth_token`.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
