# Threat Model

## Project Overview

Lucia's Küche is a full-stack recipe management system deployed as a publicly accessible web application on Replit (autoscale, `https://lucia-kitchen.replit.app`). It uses Node.js 24 / Express 5 for the backend, React/Vite for the frontend (served as static files from the API server in production), and PostgreSQL with Drizzle ORM. Authentication is JWT-based (30-day tokens, bcrypt passwords). External integrations include OpenAI Vision API (ingredient/recipe extraction), Claude AI (PDF recipe extraction), Gmail SMTP (group invitations), and Replit Object Storage (Google Cloud Storage via sidecar).

Users can create accounts, manage recipes, invite family members to groups, and use AI-powered features (fridge scan, recipe extraction from photos/PDFs/URLs, chat assistant).

## Assets

- **User credentials** – bcrypt-hashed passwords, 30-day JWT session tokens. Compromise allows account takeover and access to personal recipe data.
- **Personal recipe data** – user-created recipes, meal plans, shopping lists, cooking logs. Sensitive personal preference data.
- **OpenAI / Claude API keys** – stored as environment secrets. Compromise or abuse leads to financial loss and service disruption.
- **Uploaded images and documents** – recipe photos, source document scans, fridge photos. Stored in Replit Object Storage (Google Cloud Storage).
- **Email credentials** – Gmail SMTP app password for sending group invitations.
- **Group and invitation data** – group memberships, invite tokens (UUID, 14-day expiry), email addresses of invited users.
- **Application database** – PostgreSQL with all user, recipe, and social data.

## Trust Boundaries

- **Internet → API server** – all unauthenticated and authenticated requests cross this boundary. The API must validate identity before serving sensitive data or consuming paid AI resources.
- **API server → OpenAI/Claude** – outbound AI calls consume metered, paid API quotas. Unauthenticated trigger paths represent a financial and DoS risk.
- **API server → PostgreSQL** – Drizzle ORM with parameterized queries. SQL injection risk mitigated by ORM.
- **API server → Replit Object Storage** – signed URLs for uploads, UUID-named objects for downloads. Paths are random but the download endpoint lacks authentication.
- **API server → Gmail SMTP** – outbound email via Nodemailer. Abuse could send spam through the account.
- **Authenticated (user) ↔ Admin** – a single hardcoded admin email (`lucia.aldering@googlemail.com`) gates admin routes. No RBAC database table; admin check is email comparison in code.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/routes/index.ts` mounts all route modules under `/api`.
- **Highest-risk areas:** AI routes (`extractUrl.ts`, `extractImage.ts`, `extractFridge.ts`, `extractPdf.ts`, `batchExtract.ts`, `suggestWeek.ts`) for cost/abuse; `auth.ts` for authentication; `groups.ts` for access control; `storage.ts` for object access.
- **Public surface:** `/api/extract-url`, `/api/extract-image`, `/api/extract-fridge`, `/api/extract-pdf`, `/api/meal-plans/suggest` — no auth required, only IP rate-limited.
- **Authenticated surface:** recipes, meal plans, pantry, kochidee-chat, recipe-suggestions, cooking log, comments, notifications, group management.
- **Admin surface:** `/api/admin/export`, `/api/admin/email`, `/api/admin/batch-extract/*`, `/api/groups/admin`, `/api/groups/:id/approve`, `/api/groups/:id/reject` — auth + email-equality check.
- **Dev-only areas:** `artifacts/mockup-sandbox` (design artifact, no production block).

## Threat Categories

### Spoofing

JWT tokens signed with `JWT_SECRET`. Tokens are 30-day bearer tokens with no revocation list. A stolen or leaked token remains valid until expiry. Password changes do not invalidate existing sessions. All API routes that expose private data or perform mutations require `authMiddleware`.

The system must ensure: JWT secret is never exposed in client code or logs; password changes should ideally invalidate existing tokens or force re-authentication.

### Tampering

All database mutations use Drizzle ORM's parameterized queries — no raw SQL concatenation observed. Input validation uses Zod schemas on all mutating endpoints.

However, unauthenticated callers can supply arbitrary base64 image data and URLs to AI-powered extraction endpoints, potentially influencing AI model behavior (prompt injection via malicious image content or web page text), though the impact is limited to recipe extraction output.

### Information Disclosure

- `/api/storage/objects/*path` serves stored files without authentication. Paths are UUID-based (unguessable), but any client that discovers a path (e.g., from a stored recipe's `imageUrl` field in the database) can fetch the file without being authenticated.
- Error messages are generic; stack traces are logged server-side only.
- The `sanitizeUser` function strips `passwordHash` from all user API responses.

### Denial of Service

AI endpoints (`/api/extract-url`, `/api/extract-image`, `/api/extract-fridge`, `/api/extract-pdf`, `/api/meal-plans/suggest`) are rate-limited per IP (20 req/10 min) but do not require authentication. Distributed requests from multiple IPs can exhaust OpenAI/Claude API quotas, causing service disruption and financial harm.

The system must ensure: AI endpoints require authentication, or quota exhaustion is prevented by a per-user limit that requires identity.

### Elevation of Privilege

Admin access is gated by hardcoded email comparison, not a database role. If the admin user's JWT is compromised, full admin access is gained. There is no second factor or IP restriction on admin routes.

Group owner actions (invite, rename, remove members) are properly checked server-side with membership table lookups. No IDOR was found in group management — all group operations verify that the acting user is the group owner.
