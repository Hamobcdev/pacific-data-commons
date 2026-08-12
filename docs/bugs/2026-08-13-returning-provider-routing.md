# Bug Report — Returning Provider Login/Onboarding Routing

**Date:** 2026-08-13
**Found during:** Read-only trace of the returning-institutional-user login → onboarding/dashboard redirect flow (requested assessment, no code changes made in that session).
**Status:** Documented only. No fixes applied. Each bug below is intended for its own PR.

---

## BUG 1 — Stale upload form prefill

**Severity: Medium** (UX / data confusion — a provider can submit a new dataset with leftover fields from an old, abandoned attempt without noticing)

**Location:**
- `apps/web/components/upload/UploadForm.tsx:40` — form state initializes from `loadLocalState()?.upload ?? defaultState().upload`.
- `apps/web/app/[locale]/onboarding/new-dataset/page.tsx:33-39` — on successful `startNewDataset()`, merges only `providerId`, `sessionToken`, and `currentStep: "upload"` on top of existing local state (`loadLocalState() ?? defaultState()`); the `upload` key itself is never reset. The component's own doc comment (`new-dataset/page.tsx:15-19`) states this is deliberate: "only providerId/sessionToken/currentStep are overwritten on top of existing local state ... never the per-step form fields."
- `apps/web/actions/onboarding/start-new-dataset.ts:33-70` — `startNewDataset()` itself never touches localStorage at all (it only mints a fresh session token server-side); nothing in this action clears prior upload state either.

**Description:**
If a provider previously started (and abandoned, without submitting) an onboarding upload on a given browser, then later completes registration elsewhere (or on the same browser after a gap) and returns to add a **new** dataset via the dashboard's "Add Dataset" link, `UploadForm.tsx` pre-fills the file/title/description fields from `loadLocalState()?.upload` — the leftover state from the earlier abandoned attempt. The provider lands on the correct route (`/onboarding/upload`), but the form is not blank; it can carry stale title/description text or file references from an unrelated prior dataset.

**Reproduction path (traced, not live-verified):**
1. Provider starts onboarding upload once, enters some data into the upload form, never submits, navigates away.
2. Provider completes registration (Step 7) later — `clearLocalState()` is only called from `apps/web/components/complete/CompleteLayout.tsx:66` on a *successful Step 7 submission*, which does not happen in the abandoned attempt above, so the stale `upload` key in localStorage survives.
3. Provider later clicks "Add Dataset" from the dashboard. `new-dataset/page.tsx` merges in fresh `providerId`/`sessionToken`/`currentStep` but leaves the old `upload` object untouched.
4. `UploadForm.tsx:40` reads that old `upload` object as its initial state.

**Fix target:** Clear (or at minimum, not reuse) the `upload` slice of local onboarding state when a new dataset flow is initiated — the natural point is `new-dataset/page.tsx`'s success branch (currently `apps/web/app/[locale]/onboarding/new-dataset/page.tsx:33-39`), resetting `state.upload` to `defaultState().upload` as part of the merge, rather than spreading the old `state` wholesale.

---

## BUG 2 — `verification_queue` status blindness

**Severity: High** (business logic — a rejected or still-under-review provider is granted the same routing/access as an approved one)

**Location:**
- `apps/web/actions/onboarding/resume-session.ts:69-75` — `resumeOnboardingSession()` queries `verification_queue` for `provider_id` + `queue_type = 'new_provider'`, selecting only `id`. Existence alone (`if (queueEntry)`) triggers `return { success: true, providerId, redirectToDashboard: true }` — routing a returning provider straight to the dashboard.
- `apps/web/actions/onboarding/start-new-dataset.ts:56-65` — `startNewDataset()` runs the identical existence-only check (`select("id")` on `verification_queue`, same filters) to decide whether a returning provider is allowed to start a second dataset upload cycle. Existence alone permits it (`if (!queueEntry) return { success: false, ... }` is the *only* gate).

**Description:**
The `verification_queue` table (`supabase/migrations/session1_migration.sql:310-338`) has a `status` column with real, meaningful values: `queued`, `automated_running`, `awaiting_review`, `in_review`, `approved`, `rejected`, `more_info_needed` (`session1_migration.sql:331-334`). Neither of the two call sites above selects or checks this column — both only ask "does a row exist for this provider and queue_type," which becomes true the moment Step 7 submits the provider into the queue and stays true regardless of what happens to that submission afterward.

Consequence: a provider whose initial `new_provider` verification was **rejected**, or is still sitting in **`in_review`**/**`more_info_needed`**, is currently:
- Routed to `/dashboard` on login exactly like an `approved` provider (`resume-session.ts:75`), instead of being told their application is pending/rejected.
- Permitted to start and submit additional datasets via `startNewDataset()` (`start-new-dataset.ts:63-65`) exactly like an `approved` provider, since the only check is row existence.

This is the "wrong access for non-approved users" case: dashboard access and new-dataset submission are, in effect, gated on *having applied* rather than *having been approved*.

**Fix target:** Both `resumeOnboardingSession()` (`apps/web/actions/onboarding/resume-session.ts:69-75`) and `startNewDataset()` (`apps/web/actions/onboarding/start-new-dataset.ts:56-65`) should select and branch on `verification_queue.status`, not merely row presence. Needs a product decision on the exact status → routing/access mapping (e.g. `approved` → dashboard/new-dataset allowed; `rejected`/`more_info_needed` → a distinct status page, not the dashboard or onboarding wizard; `queued`/`automated_running`/`awaiting_review`/`in_review` → a "pending review" state) before implementing.

**Added requirement (2026-08-13, from review): admin bypass.** Admin accounts (identified by the `ADMIN_EMAIL` environment variable) must bypass the verification queue status check and always route to dashboard. `ADMIN_EMAIL` is set in `.env.local` and in Vercel environment variables — never hardcoded or committed to any file. The BUG 2 fix must therefore include this bypass: if the authenticated user's email matches `ADMIN_EMAIL`, the status check in both `resumeOnboardingSession()` and `startNewDataset()` is skipped entirely and the account routes straight to the dashboard / is permitted to start a new dataset, as if `approved`.

Scope and open questions to resolve in the fix PR, not decided here:
- **Repo scope:** this repo only covers PDC's own login/onboarding code. Other SBP applications are separate codebases not present in this repository — an equivalent bypass, if wanted there too, needs its own change in each of those repos; this document and its eventual fix cannot cover them.
- **Environment scope:** as requested, the bypass is unconditional (applies regardless of environment). Worth confirming intentionally: an unconditional, email-matched, full-access bypass on a production auth/routing path is a meaningful widening of admin surface once this reaches Mainnet (CLAUDE.md P4 — "every feature is designed with its threat model before implementation"). Consider whether this should be gated to non-production environments, or at minimum logged/audited when it fires, before it ships live.
- **Blast radius of the bypass:** as specified, it skips only the `verification_queue.status` check this bug is about. It should not be read as license to skip any other check (identity verification, RLS, wallet checks) unless explicitly extended.

As a stopgap until the fix ships, the test account's `verification_queue` row was manually approved during this review (via direct SQL update, not code) so the account isn't locked out once the BUG 2 fix deploys. See CLAUDE.md Section 26.5 for the standing `ADMIN_EMAIL` requirement.

---

## Not filed as bugs (observed during the same trace, informational only)

- `providers.onboarding_status` is written through Steps 1–3 (`register`, `save-wallet`, `upload-context`) but never read by any routing decision — `resume-session.ts:49-50`'s own comment notes it "stops changing after Step 3" and step detection instead walks forward through each step's actual persisted data. Not a bug, but the column is effectively dead weight for routing purposes and could mislead a future reader into assuming it reflects live status.
