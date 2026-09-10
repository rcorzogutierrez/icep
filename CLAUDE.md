# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ICEP Gradebook: academic management system (courses, subjects, grading rubrics, grades) with invite-only signup and three roles (admin, teacher, student). Angular 22 + Tailwind CSS 4 on Firebase (Auth, Firestore, Storage, Hosting). Bilingual UI (ES/EN).

## Commands

```bash
npm install                 # Node ≥ 22.22.3 required — Angular CLI 22 rejects intermediate
                             # versions like 22.22.2 outright; this is the #1 cause of "ng: ..."
                             # errors that look unrelated to the actual change.
npm start                    # ng serve → http://localhost:4200
npm run emulators            # Firebase Auth/Firestore/Storage/Hosting emulators
npm run build                # production build → dist/icep/browser
npm run watch                 # dev build, watch mode
npm test                     # Vitest via @angular/build:unit-test (jsdom, no real browser)
npm run lint                  # ESLint over .ts and .html
npm run typecheck             # tsc --noEmit (does not go through the Angular builder)
npm run deploy                 # build + firebase deploy --only hosting:icep — Hosting ONLY,
                             # see "Firestore/Storage rules" below
```

CI (`.github/workflows/ci.yml`) runs `typecheck → lint → test → build` in that order on every push/PR; match that order locally before pushing. Test coverage is minimal today (one spec file) — typecheck/lint/build are what actually catches regressions.

`src/environments/environment.ts` / `environment.development.ts` need real Firebase project credentials in the `firebase: {...}` block to run locally; these are public-by-design (they ship to the browser), the real authorization boundary is `firestore.rules`/`storage.rules`, not these files or the Angular route guards.

## Architecture

### Data layer: Firestore + signal-backed services

Every domain lives in `core/<domain>/` as a pair: a `.model.ts` (plain interfaces, documented field-by-field there — read them instead of guessing shapes) and a `<domain>.service.ts`. Services follow one recurring pattern: a private writable `signal` synced live via Firestore's `onSnapshot` inside a constructor `effect()`, exposed as `.asReadonly()`, re-subscribing whenever the relevant auth/profile state changes and clearing on `onCleanup`. Read `core/courses/courses.service.ts` as the canonical example before writing a new service — copy that shape rather than introducing `async/await` one-shot fetches or a different reactive pattern.

Key collections and how they relate (full field-level docs live next to each model in `core/*/​*.model.ts`):
- `users/{uid}` — created only by redeeming an invitation (`role`, `status`).
- `invitations/{code}` — bound to one email + role; single-use.
- `subjects/{id}` — catalog of subjects. `courses/{id}` + join collections (`courseStudents`, `courseTeachers`, `courseSubjects`, `courseSubjectTeachers`) group students by course (cohort/year) and say which teacher teaches which subject in which course.
- `subjectAssignments/{subjectId}_{teacherId}` — derived table; it's the *only* thing `grades`/`gradeCategories`/`assignments` security rules check to authorize a teacher.
- `gradeCategories/{id}` (rubric, weighted categories — 100%-sum is validated client-side, not in rules) → `assignments/{id}` (a task in a category) → `grades/{subjectId}_{studentUid}` (deterministic id, `scores: assignmentId → points`, so a student can read their own grade with a direct `getDoc`).

**Authorization lives in `firestore.rules`/`storage.rules`, full stop.** The route guards in `core/auth/auth.guards.ts` (`authGuard` → `approvedGuard` → `staffGuard`/`adminGuard`/`subjectAccessGuard`/`courseAccessGuard`) are UX only — they mirror the rules' logic (e.g. `subjectAccessGuard` checks the same `subjectAssignments` doc the rules check) so navigation doesn't dead-end a user, but never assume a guard is what's actually stopping an unauthorized read/write.

### Routing

`app.routes.ts` lazy-loads every feature (`loadComponent`), nests everything under one parent route rendering `shared/layout/app-shell/app-shell.ts` (sidebar + top bar + `<router-outlet>`), and stacks guards per route (see above). A new page is a new lazy route with the guard matching its access level, not a new top-level bootstrap.

### UI consistency rules (deliberate, not incidental)

The app went through a pass (see git history around "Unify page layout") specifically to stop pages from drifting from each other. These rules are load-bearing for that — do not reintroduce the drift:

- **Every routed page's root markup must be `<app-page>` wrapping an `<app-page-header>`** (`shared/layout/page/page.ts`, `shared/layout/page-header/`) instead of a hand-rolled `mx-auto max-w-*` div and a copy-pasted title/subtitle/back-button block. `app-page-header`'s title is content-projected via `<span pageTitle>` (needed for pages that interpolate a subject code into the `<h1>`); back navigation always goes through its `(back)` output, never a raw `routerLink`, because different pages need `router.navigate`, `location.back()`, or a fixed route and the header shouldn't care which.
- **All actions go through the shared `Button`** (`shared/components/button/button.ts`) — its `variant`/`size` inputs cover the app's whole button vocabulary (including the deliberately "soft" `warning`/`success` variants for reversible vs. `danger` for irreversible actions). Don't style a raw `<button>` for something `Button` already expresses.
- **Colors and surfaces come from the `@theme` tokens in `src/styles.css`** (`--color-brand-*`, `--color-status-*`, and the semantic `--color-surface`/`-text`/`-text-muted`/`-border`, which is how dark mode — prepared but not yet toggled on — will work). Never hardcode a hex value or reintroduce a parallel neutral scale; Tailwind's built-in `slate-*` is the neutral scale in use.
- **Border radius is a 2-value scale**: `rounded-xl` for controls/buttons/inputs, `rounded-2xl` for cards/sections/panels. No `rounded-lg`/`rounded-md`.
- **Icons**: every Lucide icon used in the app is re-exported once from `shared/icons/icons.ts` as `IconXxx`; features import from there, never `@lucide/angular` directly, so unused icons stay tree-shaken and there's one place to see the app's whole icon vocabulary.
- **User-facing strings go through `I18nService.t(section, key)`** against `core/i18n/translations.ts` — never a bare string literal in a template.
- **General DRY rule**: if a markup or logic block is about to be copy-pasted into a 2nd or 3rd feature, that's the signal to extract it into `shared/components` or `shared/layout` instead — that's exactly how the drift this section describes happened the first time.

### Component conventions

Standalone components, `ChangeDetectionStrategy.OnPush` everywhere, class names without a `Component` suffix (`Button`, `Drawer`, `Page`, `PageHeader`, not `ButtonComponent`), selectors `app-kebab-case`. State is signals (`input()`/`output()`/`model()`/`signal()`/`computed()`), not RxJS subjects/pipes-heavy patterns — services expose readonly signals the same way (see Data layer above). `Select`/`Modal`/`Drawer` are the only components built on `@angular/aria` + `@angular/cdk/overlay` (for keyboard/ARIA-correct composite widgets); there's no Angular Material or other visual kit in the project — everything else is plain Tailwind.

### Deploy

`npm run deploy` only pushes Hosting. A change to `firestore.rules` or `storage.rules` needs its own explicit deploy (`firebase deploy --only firestore:rules` / `--only storage:rules`) or it silently doesn't ship. A change to `firebase.json` (headers/CSP/rewrites) should go through a preview channel (`firebase hosting:channel:deploy preview`) first — a bad CSP blocks a request silently, with no visible error, so exercise the full login flow against the preview before promoting.

## Security

Every rule here maps to a real gap found and fixed in this repo, not a generic checklist — see the comments next to the relevant `match` block in `firestore.rules` for the specific incident behind each one. Apply these to any new feature before it's considered done, not just when asked to.

- **Any new invite/join-code collection must decide, explicitly, bound-or-multi-use.** Bound to one identity (like `invitations/{code}`): the redemption rule MUST check `request.auth.token.email.lower() == resource.data.email` (or equivalent). Without it the code is a bearer token — whoever obtains it (a forwarded link, a screenshot) can redeem it as themselves instead of the intended person; this was a real, production-confirmed vulnerability. Deliberately multi-use (like `courseInvitations/{code}`, a "class code"): say so in a comment on the `match` block — a reviewer should never have to guess whether an unbound code was an oversight or a decision.
- **Generate every code with `generateInvitationCode()`** (`core/invitations/invitation-code.ts`, backed by `crypto.getRandomValues()`) — never `Math.random()`, it isn't a CSPRNG.
- **Every code gets an `expiresAt`, enforced client- and rule-side.** Client: treat an expired code as "not found," same as an invalid one (see `redeem()` in `invitations.service.ts`). Rule: `isInvitationExpired()`. If the client computes the same TTL the rule caps against, give the rule's cap a day or two more slack than the client's value — a client clock even slightly ahead of the server otherwise fails a legitimate `create` with `permission-denied` (see the 29-day-client vs. 31-day-rule-cap comment in `course-invitations.service.ts`).
- **Don't leave `allow get` on a code document open to "any authenticated user" by default.** Restrict it to staff, the code's owner/redeemer, or — only for a deliberately-shared code, and only with that reasoning written in the comment — any authenticated user. An open `get` turns a large-but-finite code space into an enumeration target.
- **A privileged action on another `users/{uid}` doc must never be legal on one's own.** Any `allow update`/`allow delete` gated by `isAdmin()` that can touch role, status, or otherwise remove someone's own admin capability needs `&& request.auth.uid != userId` alongside it, matching the existing `delete` rule. Hiding the control in the UI for the current user's own row (see `isSelf()` in `admin-users.ts`) is necessary but not sufficient — the rule is the actual boundary, and a sole admin who self-locks-out has no recovery path short of hand-editing Firestore.
- **Validate enums on `update`, not just `create`.** A field like `role` or `status` usually gets an `in [...]` check when the document is created; it's easy to forget the identical check on the rule that updates it later. Skip it and a typo through that path (`'Admin'` instead of `'admin'`) silently corrupts the field — every `isAdmin()`/`isTeacher()`/`isStudent()` call is an exact string comparison, so that account just stops matching any of them, with no error to explain why.
- **A guard in `auth.guards.ts` is UX, never the boundary.** Write the `firestore.rules` change first; make the guard assert the identical condition against the identical collection/field, not a looser approximation — see `courseAccessGuard` mirroring `isActiveCourseInvitationFor` as the pattern to copy.
