# Words Connect — Project Overview

## Purpose

Words Connect is a one-time, teacher-led browser workshop that teaches paraphrasing through a sequence of interactive activities. Approximately 30–50 students join from phones or computers, while one teacher controls the live session. The application emphasizes an engaging student experience, clear teaching demonstrations, explainable assessment, and a simple presentation workflow.

## Scope

The application supports exactly one active workshop session at a time, with an in-memory lifecycle; it has no multi-classroom or multi-session management. Opening the main application link enters the teacher interface directly, with no password, access code, or permanent teacher account. Students join from the session QR/link with a name and session-scoped identity, participate in the Wall, explore learning materials, complete a fixed three-question quiz, submit two written paraphrases, and view results after publication. The teacher shares the same stage interface as students, with stage-specific controls placed directly below it.

The teacher may open a fully isolated preview to demonstrate the student experience. The teacher may export results as CSV and JSON and choose whether to clear session data when ending the workshop.

## Goals

- Make paraphrasing approachable through visual, interactive activities.
- Let a teacher guide one live session without a large administrative dashboard.
- Keep student participation reliable across devices and network connections.
- Enforce teacher, student, and preview separation on the server.
- Assess writing consistently with an explicit rubric and auditable feedback.
- Keep the implementation small: one Node.js service, no database, and no permanent accounts.

## Non-goals

- Permanent LMS, multi-classroom, or SaaS functionality.
- Student registration, accounts, or permanent academic records.
- Database storage or server-restart recovery.
- AI-generated quiz questions.
- Teacher feedback editing or a mandatory review of every AI assessment before first publication.
- Separate teacher and student activity pages.

## Target users

- **Students:** join by link/QR code, submit activity responses, and see published results.
- **Teacher:** opens and guides the session, demonstrates activities, moderates content, evaluates work, publishes results, and ends the session.
- **Presentation audience:** may observe the stage projected by the teacher; no additional account type is required.

## Functional requirements

1. **Welcome and joining:** animated Word Universe, short introduction, name entry, session-specific participant ID/display number, join link/QR, open/close joining, participant count, and reconnect without duplicate participants.
2. **Kindness Board:** one student message per participant, 10–200 meaningful characters, automatically visible and anonymous, with private author association. The teacher may delete an inappropriate message; deletion does not allow a replacement, and deleted text is unavailable as a Remix source. Teacher-authored messages are marked internally and excluded from student counts.
3. **Paraphrase Lab:** a fixed-content Bubble Pop Activity with three independently opened examples: Synonyms, Change the Structure, and Keep the Meaning. It is ungraded and each learner explores locally at their own pace; there is no shared teacher-controlled demonstration.
4. **Paraphrase Pit Stop:** exactly the three fixed multiple-choice questions in `05-ASSESSMENT-SPECIFICATION.md`, all based on the exact mission sentence. No answer key or explanation is revealed before quiz closure.
5. **Remix Studio:** two independent written exercises, one using a single frozen Wall source for all students and one using the fixed academic sentence. Each has separate submission and assessment data.
6. **Assessment:** combine quiz score and two Groq rubric scores using the specified weighting. Teacher initiates evaluation, publishes results, inspects disputed results, and may correct marks only.
7. **Insights:** after publication, students see their own scores and feedback and the published leaderboard. Before publication, student results and rankings remain hidden.
8. **Session controls:** create/open session, control joining and activities, progress/pause/resume stages, close assessment activities, publish, export, end, and explicitly choose whether to clear data.
9. **Preview:** complete isolated demo identity/data path, visibly labeled, with no real participant, submission, Groq call, score, or leaderboard effect.

The Wall fallback is exactly: “Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.” The Academic Transfer source is exactly: “Regular participation in extracurricular activities can improve university students' social skills and contribute to their personal development.”

## Important design decisions

- A single shared stage UI renders for student and live teacher modes. Teacher controls are an additional panel immediately below the activity on desktop and mobile.
- Live teacher work is kept out of student counts, assessment inputs, scores, and rankings.
- Preview uses a distinct mode and isolated sample state; server authorization and routing enforce this boundary.
- The server is authoritative for lifecycle state, accepted submissions, identity ownership, assessment, and publication. Once either writing window closes, an unsubmitted exercise receives zero; unresolved assessment failures block publication until resolved.
- Session and activity state live in in-memory Maps/objects. Restart recovery is intentionally out of scope.
- One Node.js deployment serves the built React application, Express API, and Socket.IO connection over HTTPS.
- Groq credentials and calls stay on the backend; the AI returns structured results keyed by participant ID, not positional order.

## Unresolved decisions

- Define the precise normalization for “10 meaningful characters” (for example, Unicode letters/digits count and whitespace-only content does not).
- Define the precise normalization for “10 meaningful characters” (for example, Unicode letters/digits count and whitespace-only content does not).
- Define teacher access after a browser reconnect and the practical lifetime/rotation policy for teacher and student reconnect tokens.
- Confirm whether leaderboard ties share rank or use a stable display-number tie-break. Scores and ranking must remain hidden until publish either way.
- Confirm whether export includes deleted Wall content; public/student exports should omit deleted messages and private author identifiers.

