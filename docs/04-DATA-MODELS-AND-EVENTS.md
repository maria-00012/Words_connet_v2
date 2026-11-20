# Words Connect — Data Models and Socket.IO Events

The models below define target application data; the session, participant, Wall, and fixed Pit Stop quiz foundations are implemented. Later activities and assessment models remain planned. Use opaque stable IDs and schema validation at every boundary. Store only session-duration data.

## Implemented session and participant details (Task 004)

The in-memory session lifecycle currently uses `LOBBY`, `ACTIVE`, and `ENDED`; a new session starts in `LOBBY` with joining open and `currentStage: 'welcome'`. The single session has a UUID ID. Main-link teacher entry issues a session-scoped bearer capability whose hash is kept in memory; there is no password or access code. Each participant has a UUID, monotonic session display number, trimmed display name (1–80 Unicode code points), timestamps, socket connection state, and reconnect-token hash. The teacher sees only the participant's public identity, number, join time, last-seen time, and connection state. Students receive only their own identity and a public session snapshot.

The join request includes a client-generated UUID `requestId`, persisted in `sessionStorage` across retry. Repeating it with the same normalized name returns the existing identity and a reconnect credential; it cannot create a duplicate. Reusing it with another name is rejected. Reconnect credentials and the teacher capability are kept in browser `sessionStorage`; server restart loses the corresponding in-memory session and credentials. There is no clear operation in this foundation: an ended session retains data and prevents another session until server restart.

## Data models

### Session

`Session { id, lifecycle, currentStage, joiningOpen, paused, createdAt, endedAt?, publishedAt?, participants: Map<participantId, Participant>, wall: WallState, quiz: QuizState, activities, teacherCapabilities, previewNamespace }`

Exactly one active session is supported; there is no multi-classroom or multi-session management. Opening the main application link issues a session-scoped teacher capability without a password or access code. Student QR joining issues participant identity and reconnect credentials only. No permanent teacher account is created. Activity state includes independent gates and timestamps for Wall, quiz, Message Remix, and Academic Transfer. Keep transition history only as needed for live operation; no permanent audit service is required.

### Participant

`Participant { id, sessionId, displayNumber, displayName, reconnectTokenHash, joinedAt, lastSeenAt, role: 'student' }`

The ID and display number are session-scoped. Teacher and preview identities are never represented as student participants.

### Wall message

`WallMessage { id, sessionId, authorParticipantId?, authorType: 'student'|'teacher', text, accepted: boolean, status: 'visible'|'deleted', idempotencyKey, createdAt, moderatedAt? }`

Student submissions are accepted and publicly visible immediately. A participant may submit exactly one message; its text cannot be edited or replaced, including after deletion. Teacher deletion hides the message publicly, retains the one-message limit, and removes it from Remix source choices. Teacher-authored messages are accepted and shown immediately, carry `authorType: 'teacher'` internally, have no student participant ID, and are excluded from student counts. Public message projections omit author IDs, display names, and author type. The Wall opens when the authenticated student advances the active workshop from Welcome; the teacher may close or reopen its submission gate while the Wall is active.

`WallState { submissionsOpen, messages: Map<messageId, WallMessage> }`

`RemixState { source?: WallSource, messageRemixFrozen: boolean, messageRemixOpen: boolean, academicTransferOpen: boolean, submissions: Map<exercise, Map<participantId, WrittenSubmission>> }`

`WallSource { sourceText, sourceMessageId?, isFallback, selectedAt }`; selection can change until Message Remix first opens, then remains fixed even if that gate later closes. Only visible student messages are eligible; the exact fallback is always available before source freeze.

### Quiz answer

`QuizState { open, revealed, answers: Map<participantId:questionId, QuizAnswer>, idempotency: Map<participantId:key, answerKey> }`

`QuizAnswer { id, sessionId, participantId, questionId, option: 'A'|'B'|'C', submittedAt, idempotencyKey }`

At most one accepted answer per participant/question. Store correctness server-side or derive it from fixed keys after closure. Never send correctness/explanations to students before reveal.

### Remix submission

`WrittenSubmission { id, sessionId, participantId, exercise: 'message-remix'|'academic-transfer', sourceText, sourceMessageId?, responseText, submittedAt, status }`

Snapshot `sourceText` at submission so later moderation/content changes cannot alter the assessed source. One accepted submission per participant/exercise for the session; separate records and gates for the two exercises.

### Assessment result

`AssessmentResult { id, sessionId, participantId, exercise, submissionId, criteria: { meaning: number, vocabulary: number, restructuring: number, completenessTone: number }, total: number, feedback, status: 'valid'|'flagged'|'failed', providerRef?, evaluatedAt }`

Each criterion is bounded to 4, 2, 2, and 2. Total must equal the criteria sum and be 0–10. Quiz score is 0–3. Final is `30*(Q/3) + 35*(R/10) + 35*(A/10)`, out of 100.

### Teacher correction

`MarkCorrection { participantId, exercise, criterionMarks, correctedAt, correctedByTeacherId }`

Teacher edits criterion marks only. Exercise total is always calculated as the sum of the four criteria and cannot be directly edited. Feedback is immutable. Any correction immediately recomputes final score and published ranking.

### Preview data

`PreviewState { previewId, demoName, fixtures, demoInteractions, currentStage }`

Stored in a distinct in-memory namespace or client-only demo store that cannot be passed to live activity, participant, assessment, result, or export services. It is not counted as a participant.

## Socket.IO event contracts

All server-bound events require an authenticated socket bound to a session and identity. All payloads receive Zod/equivalent validation. Server acknowledgements should return accepted/rejected status and a safe reason; never rely on a broadcast as proof of persistence. Event names below are proposed canonical names.

| Event | Sender → receiver | Purpose and required data | Validation |
|---|---|---|---|
| `session:join` | Session guest → server | Join with `{ sessionId, displayName, requestId }`; acknowledgement returns own identity, reconnect token, and public snapshot | Joining open; name 1–80 Unicode code points; UUID request ID; retry idempotency |
| `session:resume` | Existing student → server | Reconnect `{ sessionId, reconnectToken }` | Token hash maps to existing participant; no new participant |
| `session:teacher-attach` | Session guest → server | Attach `{ teacherToken }`; teacher receives the teacher snapshot | Validate scoped capability before joining teacher room |
| `session:participant-count` | Server → teacher | `{ count }` | Count student participants only |
| `session:participant-list` | Server → teacher | `{ participants }` public participant identities and connection states | Teacher room only |
| `session:participant-joined` | Server → teacher | Newly joined public participant identity | Teacher room only |
| `session:participant-connection` | Server → teacher | Participant ID/number, connected state, last-seen time | Teacher room only |
| `session:snapshot` | Server → authorized clients | Safe stage, gate, and public activity snapshot | Role-filter fields; no private author IDs or unpublished results |
| `session:stage-change` | Teacher → server; server → clients | Request `{ stage }`; broadcast accepted `{ stage }` | Teacher credential; valid lifecycle transition |
| `session:pause` / `session:resume-live` | Teacher → server; server → clients | Pause/resume current session | Teacher only; valid state |
| `session:joining-set` | Teacher → server; server → clients | `{ open: boolean }` | Teacher only; affects new joins, not valid reconnects |
| `session:start` | Teacher → server | `{}` | Teacher only; `LOBBY` transitions to `ACTIVE` |
| `session:student-start` | Existing student → server | `{}`; server snapshots announce `currentStage: 'wall'` | Authenticated participant only; requires lifecycle `ACTIVE`; only advances `welcome` to `wall`; repeated request is idempotent |
| `session:end` | Teacher → server | `{}` | Teacher only; mark `ENDED`, close joining, retain in-memory session data |
| `wall:submit` | Student or teacher → server | `{ text, idempotencyKey }`; student acknowledgement returns own message ID/status only | Authenticated student/teacher; Wall active and open; 10–200 code points with at least 10 non-whitespace characters; each student may post once; messages become visible immediately; teacher posts do not count as student work |
| `wall:snapshot` | Server → authorized clients | Public `{ submissionsOpen, messages }` | Students and teacher receive visible messages only; omit author IDs, names, and author type |
| `wall:moderation-queue` | Server → teacher | `{ messages, acceptedStudentCount }` | Teacher room only; list includes deleted messages and private author identification remains a separate action |
| `wall:submission-status` / `wall:submission-statuses` | Server → owning participant | Own `{ id, status, accepted }` status updates/snapshot | Participant room only; never sent to other students |
| `wall:message-added` | Server → clients | Public `{ id, text, status, accepted, createdAt }` | Visible messages only; no author fields |
| `wall:submission-state` | Teacher → server; server → clients | `{ open: boolean }` | Teacher only; Wall must be active; closing preserves all messages |
| `wall:delete` | Teacher → server; server → teacher/clients | `{ messageId }` | Teacher only; deletes a visible student message; deletion does not release the one-message limit |
| `wall:identify-author` | Teacher → server → teacher | `{ messageId }`, response privately identifies participant/display number | Teacher only; never broadcast to students |
| `remix:source-select` | Teacher → server; server → clients | `{ messageId? }`; selects a visible student message or exact fallback | Teacher only; may change before Message Remix first opens; deleted and teacher-authored messages are ineligible |
| `remix:gate` | Teacher → server; server → clients | `{ exercise: 'message-remix'|'academic-transfer', open }` | Teacher only; independent gates; opening Message Remix fixes its source |
| `remix:submit` | Student → server | `{ exercise, text, idempotencyKey }` | Authenticated participant; matching gate open; one immutable response per participant/exercise; source is snapshotted; separate submission counts are teacher-only |
| `remix:snapshot` | Server → authorized clients | Shared source and gate states; teacher snapshot also carries Wall source choices and per-exercise counts | Same Message Remix source sent to all students; own responses are private to the submitting participant |
| `quiz:state` | Teacher → server; server → clients | `{ open: boolean, reveal?: boolean }` | Teacher only; reveal is allowed only after close; revealed quiz cannot reopen |
| `quiz:submit` | Student → server | `{ questionId, option, idempotencyKey }` | Authenticated student; active workshop; quiz open; fixed question/option; first accepted answer per question is immutable; retries return that answer |
| `quiz:answer-status` / `quiz:answer-statuses` | Server → owning participant | Own submitted `{ questionId, option, submittedAt }` answer(s) | Participant room only; no correctness until reveal |
| `quiz:submission-status` | Server → teacher | Per-participant display name/number and submitted question IDs/counts | Teacher room only; no answer choice or correctness before reveal |
| `quiz:reveal` | Server → clients | Fixed answer key and explanations | Only after close; exact configured content |
| `assessment:written:*` | Future assessment work | Grading/result lifecycle only | Stage 4 currently stores responses and counts; it does not assess or create scores |
| `assessment:start` | Teacher → server; server → teacher | `{}` and job identifier/status | Teacher only; written gates closed; idempotent job; student-only records |
| `assessment:progress` | Server → teacher | `{ completed, total, failed, flagged }` | Teacher only; no leaked student content |
| `assessment:result` | Server → teacher | Result details keyed by participant and exercise | Teacher only before publish; validate IDs and ranges |
| `results:publish` | Teacher → server; server → clients | `{}` then publication update | Teacher only; required evaluation state resolved per policy |
| `results:published` | Server → clients | Own result to each student; leaderboard snapshot to clients | Published only; server filters individual private feedback |
| `results:check-student` | Teacher → server → teacher | `{ participantId }`; sources, response, criteria, feedback | Teacher only; participant belongs to session |
| `results:correct-marks` | Teacher → server; server → clients | `{ participantId, exercise, criteria }` | Teacher only; edit criterion marks within bounds; derive exercise total as their sum; feedback immutable; recompute final/rank |
| `results:updated` | Server → clients | Corrected published score and ranking | Only published result; role-filter individual details |
| `session:export` | Teacher → server → teacher | `{ formats: ['csv','json'] }` | Teacher only; current session; escape CSV cells; avoid secrets; download choice independent from clear choice |
| `session:end` | Teacher → server; server → clients | `{}` | Teacher only; close all writes and activity gates |
| `session:clear` | Teacher → server | Explicit `{ confirm: true }` | Teacher only; session ended; explicit clear action; ending does not trigger it automatically |

## HTTP endpoints

Implemented: `GET /api/health`, `POST /api/sessions/teacher-entry` (opens or creates the single session and issues a teacher capability), `GET /api/sessions/:sessionId`, and capability-protected `GET /api/sessions/:sessionId/teacher`. Production Express also serves the built frontend. Export and activity endpoints remain future work. There is no password/access-code flow, permanent teacher account, or multi-session selection. Student QR joining receives participant credentials only; mutating socket events remain server-authorized.

