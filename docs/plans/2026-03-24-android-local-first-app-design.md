# Android Local-First EPUB App Design

Date: 2026-03-24
Status: Approved for implementation

## Summary

This design adds the first mobile client for kern as a single Expo app in `apps/app`. The app is Android-first, local-first, EPUB-only, and fully usable without sign-in. Optional account connection adds profile continuity and sync for reading state, bookmarks, highlights, and notes, while keeping the main reading experience independent from the network.

The implementation invests heavily in platform foundations: local persistence, sync infrastructure, Android file integration, native-friendly auth, and a modular reader boundary that can extend to React Native Web and iOS later without creating a second frontend codebase.

## Final Decisions

- One Expo app in `apps/app`.
- Expo Router, TanStack Query, Zustand, Tamagui, TypeScript.
- SQLite is the source of truth for library and annotation data.
- Managed EPUB files and derived assets live in app-local storage.
- Native sign-in uses email/password plus Google.
- Mobile auth uses bearer tokens stored in secure storage.
- Device auth remains available for TUI but is not a mobile UX path.
- Mobile sync covers reading progress, bookmarks, highlights, and notes.
- Mobile does not upload raw EPUB files in v4.
- Reader implementation uses a kern-owned WebView bridge around `@intity/epub-js`.
- Android open/share intents feed the same import pipeline as the file picker.

## Architecture

### App structure

- `src/features`: route-oriented product features.
- `src/components`: shared app components.
- `src/theme`: Tamagui tokens and theme registration.
- `src/state`: lightweight Zustand UI/session stores.
- `src/data`: repositories, query clients, and remote API adapters.
- `src/storage`: SQLite schema, migrations, file management, and secure session storage.
- `src/reader`: reader contracts, bridge protocol, annotation logic, and reader controllers.
- `src/platform`: Android-specific file intent and platform integration helpers.

### Reader subsystem

The reader is an isolated subsystem with stable domain types for location, progress, bookmarks, highlights, and notes. Rendering happens inside a WebView with a typed message bridge so the rest of the app is not coupled to DOM details. This keeps the renderer swappable later while letting the product ship on Android now.

### Local persistence

SQLite stores:

- library books
- parsed metadata
- reading state
- bookmarks
- highlights
- notes
- reader preferences
- sync account metadata
- sync entity links
- sync queue items

The file system stores:

- managed EPUB files
- derived cover assets
- extracted reader/search support assets

## Auth and Sync

### Auth

The backend keeps cookie behavior for browser clients, but auth endpoints also return a session envelope with `user`, `token`, and `refreshToken`. The mobile app stores tokens in secure storage and authenticates with bearer tokens.

Google login uses Expo AuthSession and a dedicated mobile exchange endpoint so the app can complete a native OAuth flow without depending on browser cookies.

### Sync

Local writes happen first. When a user connects an account, the app reconciles local metadata to remote catalog/library records and then syncs progress, bookmarks, highlights, and notes through a queued outbound model plus periodic pull reconciliation.

Conflict defaults:

- reading progress: higher progress, then newer update time
- bookmarks: additive with tombstones for deletes
- highlights and notes: preserve edits conservatively and avoid destructive overwrite

Remote metadata for books that are not present locally is visible in account/sync surfaces only. The main library remains grounded in locally readable books so v4 does not imply cloud backup.

## API and Shared Contract Changes

- Change `register`, `login`, and `refresh` responses to return the auth session envelope used by native clients.
- Add `POST /api/v1/auth/google/mobile`.
- Add shared Zod/OpenAPI models and API routes for bookmarks and notes.
- Add include-deleted list support for annotations used by sync reconciliation.
- Keep TUI compatible with the updated auth response shape and existing device auth flow.

## UX Direction

The app should feel reader-first, calm, and approachable rather than like an admin console or developer utility. The first-run path is import, open, read. Account prompts are present but secondary. Data-loss posture for local-only use is clearly disclosed in settings/account surfaces without overstating backup capabilities.

## Testing Strategy

Focus testing on decision-heavy behavior:

- import and dedupe logic
- SQLite migrations
- reader location/progress translation
- annotation anchoring and persistence
- session refresh and logout behavior
- sync queue retries and conflicts
- first-run and import-to-read flows
- Android file-intent import path
- API bookmark/note behavior and auth session envelopes

## Exit Criteria

- `apps/app` exists and runs as the only shipped graphical client in v4.
- Android users can import EPUBs and read offline without signing in.
- Highlights, bookmarks, notes, search, and reading preferences work locally.
- Optional account connection works with email/password and Google.
- Supported sync works without blocking offline reading.
- The architecture remains suitable for later React Native Web and iOS work.
