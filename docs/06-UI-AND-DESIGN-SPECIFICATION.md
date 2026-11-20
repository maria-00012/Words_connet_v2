# Words Connect — UI and Design Specification

## Implemented interface foundation

- `AppLayout` owns the selected stage and renders the shared page structure for all modes.
- `stages.js` is the central source for the Welcome page and six activity-stage navigation entries. After the server advances to the Wall, navigation among the Wall, Paraphrase Lab, and Pit Stop is local to each browser; preview navigation is local.
- `StageRenderer` is shared between student, live teacher, and preview modes. Welcome, Wall, Paraphrase Lab, and Pit Stop are implemented; later stages remain clearly labeled placeholders.
- `ModeContext` centralizes `student`, `teacher`, and `preview` mode. A temporary selector is rendered only by the Vite development build; it is not authentication.
- Preview displays a persistent DEMO / PREVIEW indicator, uses local sample identity, and has local stage-selection state only. It does not call session or participant endpoints.
- `TeacherControlPanel` follows the activity directly in the shared stage column at every viewport size. Welcome, Wall, and Pit Stop have their documented controls; later-stage actions remain disabled placeholders.
- The header retains API and Socket.IO connection status. The current breakpoint behavior uses seven navigation columns on wide desktop, four at tablet widths, and two on small screens.

## Mandatory shared stage layout

Every stage uses this order:

1. Shared student-facing activity interface.
2. For live teacher mode only, the teacher control panel immediately below the activity.

This vertical order is mandatory on desktop and mobile. Do not use a side panel, floating controls, separate teacher activity page, or duplicate dashboard. The teacher sees and can interact with the same stage as students. Student mode never renders teacher controls, and the server still enforces the corresponding authorization.

## Responsive behavior

- Design mobile-first for narrow phone screens, touch input, and variable network quality.
- Keep stage content readable and controls comfortably tappable; avoid horizontal scrolling.
- On desktop, use available width for the shared activity while retaining the same vertical activity-then-controls order.
- Teacher controls should wrap into a compact vertical/row layout beneath the activity on phones, with clear labels and confirmation for consequential transitions.
- Show connection/reconnection state without blocking saved work. Restore server-confirmed submissions after reconnect.
- QR code and joining URL are available in teacher controls; URL remains copyable when QR scanning is unavailable.

## Visual direction

Use a playful classroom “word universe” visual language with colorful word bubbles, gentle motion, clear stage identity, and strong contrast for readability. Motion should support attention rather than impede reading; provide reduced-motion behavior. Use consistent typography, spacing, buttons, feedback states, and progress cues. Do not let decoration obscure original source sentences or teacher control labels.

## Mode identity

- **Student:** no teacher controls, private identity/session display number, clear open/closed activity state.
- **Live teacher:** same stage visuals with an explicit teacher context and the control panel below.
- **Preview:** persistent, unmistakable “Preview / Demo” banner and demo name so sample results cannot be mistaken for class results. Provide a clear exit path.

## Stage-by-stage UI

### Welcome — Word Universe

Implemented: a colorful responsive universe scene with eight decorative, non-clickable paraphrasing words, subtle CSS movement, reduced-motion support, a concise paraphrasing introduction, and the **Start Learning** action. Students reuse Task 004's join flow, see their assigned participant number, and wait while lifecycle is `LOBBY`. When `ACTIVE`, Start Learning is submitted to the backend; only an authenticated student can advance the server's current stage from `welcome` to the first-stage placeholder, `wall`. Live stage navigation follows the server snapshot and cannot be advanced by local selection. The Wall interaction remains unimplemented.

The teacher sees the same Word Universe scene without becoming a student participant. Controls immediately below it reuse authenticated session actions for joining open/closed and workshop start, and display the join URL, QR code, participant count, and teacher-only participant list. Preview uses local sample identity and local-only navigation; it does not call join or stage-transition events.

### Stage 1 — The Wall / Kindness Board

Implemented: responsive anonymous message cards, a composer with 10–200-character guidance, an open/closed state, and immediate anonymous broadcasts. Each student may post once; a post cannot be edited or replaced, even after deletion. The teacher panel directly below the Wall closes/reopens submissions, may privately identify an author, and deletes inappropriate student messages. Deleted messages disappear from the public Wall. Teacher-authored messages remain internally marked and excluded from student counts. Preview uses local sample messages and local deletion behavior.

### Stage 2 — Learn / Paraphrase Lab

Implemented as a playful, responsive Bubble Pop Activity. Three colorful floating buttons can be opened in any order: **Synonyms** reveals Happy → Glad, Big → Large, Important → Significant, and Beautiful → Attractive; **Change the Structure** reveals Original: “She is a good student.” and Paraphrased: “She is an excellent learner.”; **Keep the Meaning** reveals Original: “Students learn English to improve their communication skills.” and Paraphrased: “Students study English to develop their ability to communicate.” The selected example appears in an accessible detail panel with a close action; learners can open another bubble at any time. This fixed content is ungraded. Student and teacher bubble interactions are local to each browser; no shared demonstration or Stage 2 activity controls are used. Preview uses the same local interaction and the existing Preview/Demo indicator.

### Stage 3 — Paraphrase Pit Stop

Implemented: the exact mission briefing appears before the three fixed question cards. Students select and submit one answer per question; the first accepted answer is locked. Correct options and explanations remain hidden until the teacher closes and reveals. Teacher controls directly below open/close the quiz, show each student's question submission status, and reveal answers after closing. Preview uses local sample submissions and local gate/reveal controls.

### Stage 4 — Remix Studio

Implemented: two responsive exercises with distinct sources and response areas. Message Remix displays the same teacher-selected visible student Wall message or exact fallback for all students. Selection may change before the exercise first opens and is fixed once opened. Academic Transfer always displays exactly: “Regular participation in extracurricular activities can improve university students' social skills and contribute to their personal development.” Each exercise has a separate gate, immutable student submission, confirmation, and teacher submission count. Teacher controls below the activity list available Wall messages, select the fallback/source, and independently open/close both exercises. Preview uses local sample messages, gates, and responses only; no grading is performed in this stage.

### Stage 5 — Assessment

Student view communicates that writing is being assessed; it exposes no unpublished marks. An exercise without an accepted submission at closure receives zero. Teacher controls below: Evaluate All, batch progress, retries, failures/flags, publish; block publication while any submitted assessment remains unresolved. Provide teacher inspection view for source, response, criterion scores, and feedback; controls edit criterion marks only, calculate exercise total automatically, and never edit feedback or show a “Teacher reviewed” marker.

### Stage 6 — Insights

Before publication, show a neutral waiting state to students. After publication show Pit Stop, Message Remix, Academic Transfer, final score, individual feedback, and leaderboard. Teacher controls below: class performance, student inspection/dispute checks, criterion mark corrections, CSV/JSON download choice and session clear choice independently, end session.

