# Words Connect — Risks and Test Plan

## Important risks

| Risk | Impact | Mitigation / verification |
|---|---|---|
| Teacher role is represented only by client state | Students could moderate, close activities, publish, or inspect private data | Issue a protected capability on main-link teacher entry; ensure student QR joins receive participant credentials only and test forged socket calls |
| Preview leaks into live session | Demo data could count, be assessed, or appear in results | Isolate preview namespace/store; assert no live writes or Groq calls |
| In-memory state disappears on restart | Active workshop submissions/results are lost | Make limitation explicit to teacher; export when desired; rehearsal includes process restart expectations |
| Public Wall reveals author | Undermines anonymous board | Separate public and private projections; inspect emitted payloads |
| Socket reconnect creates duplicate student | Inflated counts and split work | Session reconnect token maps to stable participant; test interrupted joins and reconnects |
| Race between close and incoming submission | Late work may be accepted inconsistently | Server serializes/checks gate at mutation time and acknowledges outcome |
| Groq returns malformed or misordered data | Scores could attach to wrong student or be invalid | Stable ID joins, strict schema/range checks, reject unknown/duplicate/missing IDs |
| Student prompt injection in written response | Assessment instructions may be manipulated | Delimit content as untrusted data; explicit examiner instruction; validate all outputs |
| Partial Groq outage | Some students lack assessment at publication time | Retry failed items; retain successes; flag unresolved items and block publication until resolved |
| Deleted Wall content remains publicly visible or selectable | Inappropriate content could be shown or reused as a writing source | Remove deleted messages from the public snapshot and Remix source choices; deletion does not allow a replacement submission |
| Public leaderboard reveals identity or sensitive details | Privacy concern | Decide display-name policy; show only intended ranking fields; never expose feedback for others |
| 30–50 simultaneous mobile connections | Delayed updates or poor usability | Load/rehearsal testing over realistic devices and networks; bound payloads and broadcast scope |
| CSV formula injection or malformed content | Spreadsheet cells may execute formulas or corrupt export | Escape CSV cells and test hostile values |
| Activity/result policy ambiguities | Inconsistent user expectations | Resolve open questions listed in project overview before implementation |

## Test plan

Testing is required during implementation. Tasks 004–006 have backend unit and Socket.IO integration coverage for session security, joining/reconnect, Wall validation, immediate anonymous visibility, one-message enforcement, deletion, author lookup, and stage/gate authorization. Task 007 browser checks covered all three Bubble Pop examples, local open/close behavior, isolated Preview, reduced motion, and responsive widths. Task 008 backend tests cover quiz gates, immutable answers, teacher-only status, and reveal; frontend tests verify fixed quiz content. Task 009 backend tests cover automatic Wall display, delete/source exclusion, shared source selection/fallback, source freeze, independent exercise gates, separate immutable submissions/counts, and fixed Academic Transfer source. The frontend production build and existing frontend tests pass. Remaining deployment and concurrency rehearsal is still needed.

### Realtime communication

- Join, resume, count, stage update, activity open/close, submission acknowledgement, publication, mark update, end, and reconnect events reach the right clients.
- A reconnect restores the same identity and last acknowledged submissions without incrementing participant count.
- Closed joining blocks new IDs but permits valid reconnects.
- Wall submissions appear immediately; each student gets one message, deletion removes it from public display and Remix source choices, and deletion does not allow a replacement.
- Socket payloads are schema-checked; stale/unauthorized events fail with safe acknowledgements.
- Concurrent submission and close events produce one server-authoritative outcome.

### Mobile responsiveness

- Test narrow phone portrait/landscape, tablet, and desktop widths.
- Confirm activity precedes controls in the DOM and visual order at every viewport.
- Confirm no side/floating teacher controls and no horizontal overflow.
- Verify keyboard, touch, readable source text, reduced motion, and reconnect status.

### 30–50 participant testing

- Simulate 30–50 joins, concurrent Wall posts, quiz answers, and two exercise submissions.
- Observe event delivery, server memory/CPU, acknowledgement latency, and count accuracy.
- Test a mix of Wi-Fi and independent mobile connections where possible.
- Reconnect a subset during active work and confirm identity/submission preservation.

### Groq validation

- Valid structured response with arbitrary ordering maps correctly by IDs.
- Unknown, duplicate, missing, or mismatched participant/submission IDs are rejected.
- Test malformed JSON, missing fields, out-of-range scores, total mismatch, ambiguous flags, timeout, rate limit, and partial batch failure.
- Retry failed items and verify successful records are not duplicated or overwritten.
- Verify every unsubmitted exercise receives zero at closure without a Groq request, while unresolved failures for submitted exercises block publication.
- Confirm student and preview text cannot alter system criteria and never enters as instructions.
- Confirm no API key appears in client assets, logs, exports, or socket payloads.

### Preview isolation

- Complete every preview stage and verify no real participant, count, Wall, quiz answer, written submission, assessment job, result, or leaderboard changes.
- Verify preview actions work with sample data and remain visibly labeled.
- Attempt preview credential use on live endpoints and confirm rejection.

### Teacher permission tests

- Student cannot open/close session, joining, moderation, quiz, written gates, evaluation, publication, corrections, export, or clear.
- Teacher can perform these actions only for the authorized session.
- Student cannot query another student's unpublished or private result.
- Author identification is teacher-only; public Wall payload stays anonymous.

### Assessment and publication

- Exact mission sentence, question count, choices, keys, explanations, rubric caps, and weighted formula match documentation.
- No learning activity is scored; teacher-authored and preview work are excluded.
- Student results/leaderboard remain hidden before publication and are role-filtered after it.
- Mark correction recalculates totals/rank immediately and leaves feedback unchanged.
- Corrections accept criterion marks only; exercise total is derived from the four criteria and cannot be directly set.

### End-to-end presentation rehearsal

Run a full rehearsal with a teacher device and representative student phones/computers: open the main application link as teacher, QR join as students, late join, close joining, Wall message submission/deletion, Remix source selection and independent writing gates, learning demo, quiz and reveal, both writing exercises (including one unsubmitted exercise), Evaluate All, inspect a result, publish after all submitted assessments resolve, correct a criterion mark, independently choose whether to download and clear, and end. Include a network interruption and explain that server restart recovery is out of scope.

