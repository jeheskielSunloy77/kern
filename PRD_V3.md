# PRD v3 - Backend Community Start (Auth-Required, Cloud Files, Curated Sharing)

## 1) Overview

PRD v3 defines the first backend-centered release that turns the local reader ecosystem into an authenticated platform with sync, community profiles, and sharing.

This version is:

- login required for all users
- backend-first milestone (API/admin tooling before first-party client rollout)
- cloud-library capable (file upload/download supported)
- community-enabled for authenticated users
- curated for public file sharing (only verified/public-domain books can be shared as raw files)

---

## 2) Goals

- Provide a production backend foundation for account-based library ownership and sync.
- Support cloud file storage for user book assets.
- Enable authenticated community features:
  - public profiles (visible to logged-in users)
  - shareable lists and highlight links
- Allow explicit book file sharing links only when curation policy is satisfied.
- Establish moderation and auditability flows required for curated public sharing.

---

## 3) Non-goals

- No guest/offline-first product mode in v3.
- No anonymous public access to community content.
- No unmoderated public raw-file sharing.
- No mobile/web/TUI feature rollout commitments in this document (backend milestone only).
- No marketplace/recommendation engine.
- No social graph (follow/unfollow) or comment/discussion system.

---

## 4) Product Principles

1. Account-first integrity: every action is tied to authenticated ownership.
2. Policy by design: sharing rules are enforced in backend policy, not client convention.
3. Async heavy work: ingest, scanning, and verification run in jobs with explicit status.
4. Stable contracts: API behavior and errors must be explicit, versioned, and testable.
5. Traceable moderation: every curation decision is auditable.

---

## 5) Architecture (Recommended Approach)

v3 uses a modular monolith inside `apps/api` with strict module boundaries:

- `identity`: auth/session/profile ownership primitives
- `library`: user library entries, assets, progress, highlights
- `sharing`: links and publish/unpublish flows
- `community`: profile and activity surfaces
- `moderation`: review queue and verification decisions
- `media`: storage abstraction, upload/download policy checks

Execution model:

- synchronous HTTP for reads/writes that users directly trigger
- Asynq background jobs for heavy tasks (ingest, extraction, verification workflows)
- existing clean layering remains the rule:
  - handler -> service -> repository -> model

---

## 6) Data Model

### 6.1 Core tables

1. `books_catalog`
- canonical metadata record per known book
- fields include title, authors, identifiers, language, `verification_status`, `source_type`

2. `book_assets`
- physical stored file references
- fields include storage key, mime type, checksum, size, ingest status, uploader

3. `user_library_books`
- ownership edge between user and catalog book
- fields include state, preferred asset, visibility options, timestamps

4. `reading_states`
- per user + book + mode (`epub`, `pdf_text`, `pdf_layout`)
- stores locator payload, progress, version, update timestamp

5. `highlights`
- per user + book highlights
- stores mode-aware locator, excerpt text, visibility, soft-delete marker

6. `share_lists` and `share_list_items`
- user-owned curated collections of books/highlights

7. `book_share_policies`
- per user-book sharing controls for raw files and policy gate fields
- public raw-file links require catalog verification status `verified_public_domain`

8. `community_profiles`
- profile metadata and visibility settings

9. `activity_events`
- append-only activity log for profile feed and auditing

10. `moderation_reviews`
- review tasks, decisions, reviewer identity, evidence links, timestamps

### 6.2 Ownership and lifecycle rules

- catalog and assets are decoupled so file strategy can evolve without breaking library semantics
- raw file sharing is disabled by policy unless moderation verification passes
- destructive writes prefer soft-delete/tombstone where sync conflicts are possible

---

## 7) API Surface

### 7.1 Library APIs (`/api/v1/library/*`)

- upload/init/finalize asset
- create/update/list/get user library entries
- reading state upsert/get
- highlights CRUD and list-by-book
- share-list CRUD

### 7.2 Sharing APIs (`/api/v1/sharing/*`)

- publish/unpublish list
- create/revoke highlight/list/book-file links
- resolve link token (auth required)

### 7.3 Community APIs (`/api/v1/community/*`)

- get/update profile
- fetch activity feed with visibility filters
- discover shared artifacts across authenticated users

### 7.4 Moderation APIs (`/api/v1/moderation/*`)

- submit verification request
- review queue retrieval
- approve/reject with audit metadata

---

## 8) Sync, Conflicts, and Idempotency

- optimistic concurrency for mutable sync objects using `version` + `updated_at`
- client sends `If-Match-Version` for guarded updates
- `409 conflict` returns current server object for reconciliation

Conflict behavior:

- reading state:
  - mode-isolated state remains separate
  - within same mode, newer/higher normalized position wins
- highlights:
  - immutable IDs
  - patch updates only
  - deletions are tombstoned

Idempotency:

- required for upload finalize and publish/unpublish transitions
- duplicate keys return prior accepted result instead of re-executing side effects

---

## 9) Error Model

Use standardized error responses with stable domain codes:

- `policy_blocked`
- `verification_required`
- `conflict_version_mismatch`
- `asset_ingest_pending`
- `share_not_permitted`

Async workflows expose explicit state fields; clients must never infer hidden background progress.

---

## 10) Security and Compliance Baseline

- all v3 community/share endpoints require authentication
- strict upload allowlist (mime + size + checksum validation)
- signed, time-limited file access URLs
- moderation gate required for raw public-file links
- report abuse + takedown workflow with auditable actions
- role-based moderation/admin authorization

---

## 11) Testing Strategy

### 11.1 Service unit tests

- policy gates and visibility rules
- sync merge and conflict semantics
- idempotency behavior and state transitions

### 11.2 Repository integration tests

- schema constraints and indexes
- transactional guarantees
- version conflict checks
- soft-delete/tombstone behavior

### 11.3 Handler tests

- auth and authorization guards
- request validation and status mapping
- standardized error payload mapping

---

## 12) Rollout Plan (Backend Milestone)

1. Phase A - Internal alpha
- library/media/sync/moderation primitives live
- discovery endpoints gated or disabled

2. Phase B - Closed beta
- authenticated profiles + list/highlight sharing enabled for limited cohort

3. Phase C - v3 backend GA
- full API surface available
- moderation operations ready
- observability and alerting baselines in place

---

## 13) Exit Criteria

- all v3 endpoints captured in OpenAPI and contract package updates
- conflict and policy errors are stable and documented
- async ingest/moderation jobs are retry-safe and observable
- security controls active on upload/share pathways
- moderation actions are auditable end-to-end

---

## 14) Risks and Mitigations

1. Legal/compliance risk around user uploads
- mitigation: curated public sharing gate + moderation review + takedown flows

2. Sync inconsistency across future clients
- mitigation: strict versioned writes + explicit conflict contracts + idempotency keys

3. Large-file operational cost/performance
- mitigation: async ingest pipeline, storage abstraction, quotas and upload limits

4. Scope creep into social features
- mitigation: keep v3 to profiles + list/highlight sharing only

---

## 15) Out of Scope for v3

- anonymous access
- full social graph
- comments/discussions
- recommendation feeds
- cross-platform client delivery dates

