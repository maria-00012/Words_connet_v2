# Words Connect — Implementation Roadmap

Phase statuses reflect verified implementation progress. Do not mark future work completed before it is implemented and tested.

## Phase 1 — Project foundation

- **Objective:** establish the smallest runnable React/Vite/Tailwind + Node/Express/Socket.IO service.
- **Tasks:** create repo structure and build scripts; configure same-origin static/API/socket service; define environment configuration and secret handling. Add request/event schema validation alongside the relevant API and event contracts in later phases.
- **Dependencies:** none.
- **Expected outcome:** local service can serve the frontend and backend health response.
- **Acceptance criteria:** one Node service starts; built frontend and socket/API share origin; health endpoint responds; no database or unnecessary service is introduced.
- **Testing requirements:** production frontend build; development frontend/backend startup; health endpoint and Vite proxy; Socket.IO connection in development and production; production static serving; dependency review for databases/Groq; verify no real secret is included in client build.
- **Status:** [x] Completed.

## Phase 2 — Shared interface and navigation

- **Objective:** build the common stage shell and enforce the vertical layout rule.
- **Tasks:** stage navigation/rendering; responsive activity surface; teacher panel directly below; mode-aware visibility; loading, closed, and connection states.
- **Dependencies:** Phase 1.
- **Expected outcome:** same activity renderer supports student/live teacher, without duplicate activity pages.
- **Acceptance criteria:** teacher controls appear only below the stage; mobile/desktop preserve ordering; student cannot see controls.
- **Testing requirements:** verify all seven stage navigation entries; verify student/teacher/preview presentation; verify teacher-panel DOM order and inert stage-specific controls; check horizontal overflow at 360px, 390px, 768px, and 1366px; production build.
- **Status:** [x] Completed.

## Phase 3 — Session creation and participant joining

- **Objective:** implement session lifecycle foundation, joining, identities, and reconnect.
- **Tasks:** implement the one active in-memory session; enter teacher interface from the main application link using a protected session capability without a password/access code; open/close joining; ID/display-number assignment; QR/link; participant count; reconnect token and identity recovery. No permanent teacher accounts or multi-session management.
- **Dependencies:** Phases 1–2.
- **Expected outcome:** students can join from public HTTPS and reconnect without duplication.
- **Acceptance criteria:** only one active workshop is managed; main-link entry opens the teacher interface; QR joining grants student identity only; closed gate rejects new joins; valid reconnect restores same participant and saved state; teacher excluded from student count; no password/access-code or permanent account is used.
- **Testing requirements:** join race/duplicate tests; reconnect after socket drop; open/closed gate authorization; 30–50 connection smoke test.
- **Status:** [~] Session and participant foundation implemented; 30–50 connection smoke test and complete recovery validation remain.

## Phase 4 — Teacher/student/preview modes

- **Objective:** enforce three isolated modes end to end.
- **Tasks:** server-issued teacher capability; participant authorization; isolated demo namespace/fixtures; preview banner and exit; prevent preview writes from reaching live services.
- **Dependencies:** Phase 3.
- **Expected outcome:** mode boundaries hold on both client and server.
- **Acceptance criteria:** crafted student teacher-action request is rejected; preview creates no participant/submission/Groq request/result; live teacher actions remain separate.
- **Testing requirements:** teacher permission tests; direct API/socket bypass attempts; preview isolation assertions across counts, records, assessment, and leaderboard.
- **Status:** [ ] Not started.

## Phase 5 — Welcome and Wall

- **Objective:** implement Word Universe and Kindness Board workflows.
- **Tasks:** welcome visuals/name entry; message validation/immutability; anonymous broadcasts; author association; teacher-authored marking; automatic visibility, teacher deletion, and private identification.
- **Dependencies:** Phases 2–4.
- **Expected outcome:** students submit one eligible message and teacher can prepare the shared remix source.
- **Acceptance criteria:** 10–200 meaningful chars; no edit; public payload excludes authors; fallback exact; teacher entries excluded from assessment.
- **Testing requirements:** boundary/Unicode validation; privacy payload checks; duplicate message; deletion and Remix source eligibility tests.
- **Status:** [x] Word Universe and Wall completed and verified in Task 005–006.

## Phase 6 — Learn / Paraphrase Lab

- **Objective:** implement ungraded interactive learning demonstrations.
- **Tasks:** three floating Bubble Pop interactions with exact fixed examples; local open/close exploration for students, teacher, and preview.
- **Dependencies:** Phase 2 and mode foundation in Phase 4.
- **Expected outcome:** students explore learning content without scores.
- **Acceptance criteria:** all three exact examples appear; bubbles open and close independently; no assessment records or shared teacher control.
- **Testing requirements:** interaction, responsive, reduced-motion, preview isolation, and no-score checks.
- **Status:** [x] Bubble Pop Activity implemented and verified in Task 007.

## Phase 7 — Pit Stop

- **Objective:** implement fixed quiz and reveal workflow.
- **Tasks:** exact mission sentence/questions/options/keys; per-question immutable answer persistence; teacher submission status; close/reveal gate; isolated preview interactions.
- **Dependencies:** Phases 3–4 and 6.
- **Expected outcome:** three-mark quiz with no premature answer disclosure.
- **Acceptance criteria:** exactly three fixed questions; server preserves the first accepted answer per question; teacher actions are authorized; key/explanations are available only after close/reveal.
- **Testing requirements:** fixed content checks; answer scoring; duplicate/retry; unauthorized and closed quiz checks; preview isolation.
- **Status:** [x] Pit Stop quiz implemented and verified in Task 008.

## Phase 8 — Remix Studio

- **Objective:** implement two independent written submission tracks.
- **Tasks:** select/freeze or fallback source; exact Academic Transfer source; separate open/close gates; source snapshots; counts and submission persistence. Assessment and zero-score outcomes remain in Phase 9.
- **Dependencies:** Phases 5 and 7.
- **Expected outcome:** each student has independently stored responses for both exercises.
- **Acceptance criteria:** all students see the same Message Remix source; it may change before first open and stays fixed after; source/response are distinct; the two gates and stored submissions are independent; Preview remains local; closed activities reject writes.
- **Testing requirements:** source consistency; independent gating; duplicate/ownership; closed submission tests.
- **Status:** [x] Implemented in Task 009; grading is not included.

## Phase 9 — Groq assessment

- **Objective:** safely assess eligible writing and expose validated results to teacher.
- **Tasks:** backend-only Groq integration; rubric prompt/schema; batches of about five; ID keyed mapping; validation and flags; idempotent retries; progress states.
- **Dependencies:** Phase 8.
- **Expected outcome:** teacher can Evaluate All and inspect validated or flagged results.
- **Acceptance criteria:** no client key; reject duplicate/unknown/missing IDs and invalid scores; never rely on response order; retry failures while preserving successes; unresolved failures remain flagged and block publication; untrusted content is treated as data.
- **Testing requirements:** mocked valid/malformed/ambiguous Groq results; batch partial failure/retry; teacher/preview exclusion; score range/total validation.
- **Status:** [x] Stage 5 assessment implemented: backend-only Groq batches, validation/retries, teacher correction, weighted ranking, and publication.

## Phase 10 — Insights and leaderboard

- **Objective:** calculate, publish, inspect, and correct results.
- **Tasks:** weighted formula; unpublished state; individual feedback and leaderboard; teacher inspection; criterion-mark-only correction with derived exercise total; immediate final-score and leaderboard recomputation; publication gate for unresolved assessment.
- **Dependencies:** Phases 7 and 9.
- **Expected outcome:** students see complete results only after teacher publication.
- **Acceptance criteria:** formula matches exactly; private details filtered; leaderboard hidden before publish; exercise total is the sum of four criterion marks; corrections update score/rank but not feedback; unresolved submitted work prevents publication.
- **Testing requirements:** formula edge cases; publication authorization; privacy and correction/recalculation checks.
- **Status:** [x] Stage 6 Insights implemented: published student results, teacher class review, final ranking, and privacy-filtered leaderboard.

## Phase 11 — Export and session ending

- **Objective:** provide teacher-requested export and explicit session cleanup.
- **Tasks:** CSV and JSON download; escape spreadsheet-sensitive cells; end lifecycle; independently offer download and clear choices; preserve data after end until explicit clearing or process restart.
- **Dependencies:** Phase 10.
- **Expected outcome:** teacher can retain useful workshop results and end without accidental deletion.
- **Acceptance criteria:** exports include specified score/feedback/correction fields; ending does not automatically download or clear; download and clear are independent choices; only teacher can explicitly clear ended session.
- **Testing requirements:** export field/content checks; CSV escaping; authorization; end/clear lifecycle tests.
- **Status:** [~] Teacher CSV export and confirmed session ending are available from Insights; JSON export and explicit data clearing remain unimplemented.

## Phase 12 — Deployment and presentation testing

- **Objective:** prepare a reliable public HTTPS presentation deployment.
- **Tasks:** deploy one Node service on Render; set server secrets; verify public joining on separate networks; rehearse full session; test recovery expectations and cleanup procedure.
- **Dependencies:** Phases 1–11.
- **Expected outcome:** production-like workshop can be run from teacher device and 30–50 student devices.
- **Acceptance criteria:** HTTPS link and QR work over Wi-Fi/mobile data; all stages and teacher controls function; session restart loss is understood; export/clear choice behaves as documented.
- **Testing requirements:** full end-to-end rehearsal, 30–50 participant load/soak check, mobile/browser coverage, realtime disconnect/reconnect, Groq failure rehearsal.
- **Status:** [ ] Not started.

## Dependency summary

Phases 1 → 2 → 3 → 4 establish the foundation, UI, session, and authority boundaries. Phase 5 and 6 can proceed after the shared mode/session foundation. Phase 7 depends on session/modes and learning navigation; Phase 8 depends on Wall source handling. Phase 9 depends on written submission storage. Phase 10 depends on quiz and writing assessment. Phase 11 depends on results. Phase 12 depends on all implementation phases.

