# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to build a comprehensive recipe management system called "Lucias Kueche." The primary goal is to provide a robust backend API (`api-server`) and a feature-rich React frontend (`lucias-kueche`) for managing recipes, meal plans, invitations, and user profiles.

The system aims to cater to both individual users and future group/community features, offering advanced functionalities like AI-powered recipe extraction from PDFs, ingredient detection from fridge photos, and dynamic recipe suggestions. The business vision is to create a delightful and intuitive cooking companion that simplifies meal planning and recipe discovery.

# User Preferences

I prefer iterative development, with a focus on delivering working features incrementally. I value clean, readable code and robust error handling. Please ask before making major architectural changes or introducing new dependencies. I prefer detailed explanations for complex implementations.

# System Architecture

The project is structured as a pnpm monorepo with distinct packages for deployable applications (`artifacts/`) and shared libraries (`lib/`).

## Core Technologies:
- **Monorepo Tool:** pnpm workspaces
- **Backend:** Node.js 24, Express 5, PostgreSQL, Drizzle ORM
- **Frontend:** React, Vite, React Query
- **Typing:** TypeScript 5.9
- **Validation:** Zod, drizzle-zod
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild

## Design Patterns & Decisions:
- **TypeScript Composite Projects:** Ensures consistent type-checking across packages and manages build order for dependencies.
- **API-First Development:** OpenAPI specification (`api-spec`) drives API contract and client/schema generation (`api-client-react`, `api-zod`).
- **Database:** PostgreSQL with Drizzle ORM for type-safe database interactions and schema management.
- **Authentication:** JWT-based authentication for secure API access.
- **Frontend UI/UX:**
    - **Color Palette:** Warm cream gradient background, rich forest green, terracotta, and amber accents.
    - **Typography:** Dancing Script (script/title), Lora (serif headings), Inter (body).
    - **Navigation:** Fixed bottom navigation with 5 icon+label tabs, compact header with logo and avatar.
    - **Responsive Design:** Includes safe-area-inset support for iPhones and ensures minimum 48px touch targets.
    - **Key Features:**
        - **Login Page:** Full-screen immersive design with kitchen/food photo background, glassmorphism login card, script-font logo.
        - **Onboarding Flow:** Multi-step welcome for new users.
        - **Profile Page:** Comprehensive user profile management including avatar, personal data, password, cooking preferences, and dynamic badges.
        - **Meal Invitations:** A full-featured system for hosts to create invitations with various modes (surprise, wishlist, vote, choice) and for guests to RSVP and interact.
        - **"What to Cook Today?" / "Kochidee":** Enhanced AI-powered recipe suggestion system with 4 features: (A) Conversational KI-Assistent chat that extracts ingredients and asks follow-up questions (max 3 rounds); (B) Animated fridge scan overlay with per-ingredient ✓/✗ confirmation and uncertain recognition marking; (C) "Was muss weg?" expiry priority mode (🔴🟡🟢) with weighted recipe scoring and expiry warnings on cards; (D) "Mein Vorrat" pantry management with persistent storage, default ingredients shown as base indicators, and AI pantry context integration.
        - **Recipe Management:** Gallery view, search, filters, recipe detail modal, quick new-recipe creation via FAB, PDF upload, and URL import.
        - **Wochenplan & Einkaufsliste:** Date-based weekly meal planner and dynamic shopping list generation.
        - **Statistiken & Muster:** Data visualization using Recharts for cooking statistics and user patterns.
        - **Bulk PDF Import:** Advanced admin feature for uploading multiple PDFs, AI-powered recipe extraction (Claude AI), and a review dashboard with page scan thumbnails. Includes AI-powered food photo detection: Claude analyzes rendered page images to identify which pages contain actual food photos (vs. text pages), stores detected photo URLs in `photoPageUrls` column, shows camera icon badge in the review UI, and only saves detected food photos (not text renders) as recipe photos.
- **Group/Community Features:** Initial architecture for group management, including creation, invitations, and membership roles with admin moderation.
- **Email Invitations:** Token-based invite links (14-day expiry) with real email delivery via Gmail SMTP (nodemailer). Includes HTML email templates for invitation, confirmation, join notification, and reminder. Frontend invite acceptance page at `/invite/:token`. Password verification required for existing users accepting invites. Notifications sent to inviters when invited users join.

## Production Deployment Architecture:
- **Full-Stack Single Server:** In production, the API server serves both the backend API and the frontend static files. The `build.mjs` builds the frontend (`pnpm --filter @workspace/lucias-kueche build`) with `BASE_PATH=/` and copies the output to `artifacts/api-server/dist/public/`.
- **Express Static Serving:** When `NODE_ENV=production`, `app.ts` uses `express.static` to serve the frontend files and a catch-all route to return `index.html` for SPA routing.
- **Single Deployment Entry Point:** Only the API server is deployed. The `lucias-kueche` artifact is used only in development (no production block in its `artifact.toml`).

## Feature Specifications:
- **API Server:** Handles all backend logic, data persistence, and API endpoints. Routes are organized under `src/routes/`.
- **Database Schema:** Defined using Drizzle ORM, including tables for users, recipes, meal plans, invitations, notifications, groups, and user_pantry (for persistent ingredient storage with expiry priorities).
- **New API Routes:** `GET/POST/DELETE /api/pantry` for pantry CRUD (auth required), `POST /api/pantry/batch` for bulk save, `POST /api/kochidee-chat` for AI-powered conversation flow.
- **Client-side Generation:** Orval generates React Query hooks and Zod schemas from the OpenAPI spec, ensuring type-safety and consistency between frontend and backend.

# External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Orval:** API client and schema generator from OpenAPI specification.
- **OpenAI Vision API:** Used for image analysis in the "Kochidee" feature (specifically `POST /api/extract-fridge`).
- **Claude AI:** Utilized for handwriting detection and recipe extraction from PDFs in the bulk import feature.
- **pdfjs-dist + canvas:** Used for rendering PDF pages to JPEG for the bulk import feature.
- **Recharts:** JavaScript charting library for data visualization in the statistics section.
- **Framer Motion:** For animations in the React frontend.
- **React Hook Form:** For form management in the React frontend.
- **date-fns:** For date manipulation in the React frontend.
- **Unsplash:** For background images on the login page.
- **Nodemailer:** For sending emails via Gmail SMTP (group invitation system).