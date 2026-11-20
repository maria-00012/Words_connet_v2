const criteria = [
  ['meaningPreservation', 'Meaning preservation', 4],
  ['vocabularyVariation', 'Vocabulary variation', 2],
  ['sentenceRestructuring', 'Sentence restructuring', 2],
  ['completenessAndTone', 'Completeness and appropriate tone', 2],
];

const exerciseTitle = (exercise) => exercise === 'message-remix' ? 'Message Remix' : 'Academic Transfer';

function ScorePill({ label, score, max }) {
  return <div className="insights-score-pill"><span>{label}</span><strong>{score ?? 0}{max != null && <small> / {max}</small>}</strong></div>;
}

function ExerciseDetail({ result }) {
  return <article className="insights-exercise-card">
    <div className="insights-exercise-heading"><h3>{exerciseTitle(result.exercise)}</h3><strong>{result.total} <span>/ 10</span></strong></div>
    <ul className="insights-criteria-list">
      {criteria.map(([key, label, max]) => <li key={key}><span>{label}</span><strong>{result.criteria?.[key] ?? 0}<small> / {max}</small></strong></li>)}
    </ul>
    {result.feedback && <p className="insights-feedback">{result.feedback}</p>}
    {result.sourceText && <details className="insights-source-details"><summary>View source and response</summary><p><strong>Source:</strong> {result.sourceText}</p><p><strong>Student response:</strong> {result.responseText}</p></details>}
  </article>;
}

function Leaderboard({ leaderboard, ownParticipantNumber }) {
  return <section className="insights-leaderboard" aria-labelledby="insights-leaderboard-title">
    <div className="insights-section-heading"><div><p className="section-kicker">THE CLASS</p><h2 id="insights-leaderboard-title">Published leaderboard</h2></div><span>{leaderboard.length} learners</span></div>
    {leaderboard.length ? <ol className="insights-leaderboard-list">{leaderboard.map((entry) => <li className={entry.displayNumber === ownParticipantNumber ? 'is-own-result' : ''} key={`${entry.rank}-${entry.displayNumber}`}>
      <span className="insights-rank">{entry.rank}</span>
      <span className="insights-leader-identity"><strong>#{String(entry.displayNumber).padStart(2, '0')} · {entry.displayName}</strong><small>Pit Stop {entry.quizScore}/3 · Remix {entry.messageRemix}/10 · Transfer {entry.academicTransfer}/10</small></span>
      <strong className="insights-leader-score">{Number(entry.finalScore).toFixed(1)}<small>/100</small></strong>
    </li>)}</ol> : <p className="insights-empty">The class leaderboard will appear after results are published.</p>}
  </section>;
}

function StudentInsights({ results, leaderboard, identity }) {
  if (!results) return <div className="insights-waiting"><span aria-hidden="true">✦</span><p className="section-kicker">STAGE 6 · INSIGHTS</p><h1 id="stage-title">Your class results are on their way</h1><p>Your teacher will share your individual results and the class leaderboard after publishing.</p></div>;
  const message = results.results?.find((result) => result.exercise === 'message-remix');
  const academic = results.results?.find((result) => result.exercise === 'academic-transfer');
  return <div className="insights-content">
    <div className="insights-topline"><div><p className="section-kicker">STAGE 6 · YOUR RESULTS</p><h1 id="stage-title">Your workshop insights</h1></div><span className="insights-published-badge">Results published</span></div>
    <section className="insights-personal-score"><span>FINAL SCORE</span><strong>{Number(results.finalScore).toFixed(1)}<small> / 100</small></strong><p>Your place in the class: <b>#{results.rank ?? '—'}</b></p></section>
    <div className="insights-score-row"><ScorePill label="Pit Stop" score={results.quizScore} max="3" /><ScorePill label="Message Remix" score={message?.total} max="10" /><ScorePill label="Academic Transfer" score={academic?.total} max="10" /></div>
    <section className="insights-writing-results"><div className="insights-section-heading"><div><p className="section-kicker">YOUR WRITING</p><h2>Criteria and feedback</h2></div></div>
      {message && <ExerciseDetail result={message} />}{academic && <ExerciseDetail result={academic} />}
    </section>
    <Leaderboard leaderboard={leaderboard ?? []} ownParticipantNumber={identity?.participant?.displayNumber} />
  </div>;
}

function TeacherInsights({ assessment }) {
  const results = assessment?.results ?? [];
  const leaderboard = assessment?.leaderboard ?? [];
  const grouped = new Map();
  for (const result of results) {
    const entries = grouped.get(result.participantId) ?? [];
    entries.push(result);
    grouped.set(result.participantId, entries);
  }
  const students = [...grouped.values()].sort((a, b) => a[0].displayNumber - b[0].displayNumber);
  return <div className="insights-content">
    <div className="insights-topline"><div><p className="section-kicker">STAGE 6 · CLASS SUMMARY</p><h1 id="stage-title">Workshop insights</h1></div><span className={`insights-published-badge ${assessment?.published ? '' : 'is-pending'}`}>{assessment?.published ? 'Results published' : 'Teacher view · unpublished'}</span></div>
    {!results.length ? <div className="insights-waiting"><span aria-hidden="true">✦</span><h2>Class results will appear here</h2><p>Complete assessment and publish results to see the final class ranking and individual score breakdowns.</p></div> : <>
      <div className="insights-class-summary"><ScorePill label="Students" score={students.length} /><ScorePill label="Outcomes assessed" score={assessment.completed} max={assessment.total} /><ScorePill label="Need review" score={assessment.flagged} max={assessment.total} /></div>
      {assessment?.published && <Leaderboard leaderboard={leaderboard} />}
      <section className="insights-student-results"><div className="insights-section-heading"><div><p className="section-kicker">INDIVIDUAL DETAILS</p><h2>Student results</h2></div><span>{students.length} students</span></div>
        {students.map((studentResults) => <article className="insights-student-card" key={studentResults[0].participantId}>
          <div className="insights-student-heading"><div><span className="insights-number">#{String(studentResults[0].displayNumber).padStart(2, '0')}</span><h3>{studentResults[0].displayName}</h3></div>
            {leaderboard.length > 0 && <span className="insights-student-rank">Rank #{leaderboard.find((entry) => entry.participantId === studentResults[0].participantId)?.rank ?? '—'}</span>}
          </div>
          <div className="insights-score-row">{leaderboard.length > 0 && <ScorePill label="Pit Stop" score={leaderboard.find((entry) => entry.participantId === studentResults[0].participantId)?.quizScore ?? 0} max="3" />}
            {studentResults.map((result) => <ScorePill key={result.exercise} label={exerciseTitle(result.exercise)} score={result.total} max="10" />)}
            {leaderboard.length > 0 && <ScorePill label="Final score" score={Number(leaderboard.find((entry) => entry.participantId === studentResults[0].participantId)?.finalScore ?? 0).toFixed(1)} max="100" />}
          </div>
          <div className="insights-exercise-grid">{studentResults.map((result) => <ExerciseDetail key={result.exercise} result={result} />)}</div>
        </article>)}
      </section>
    </>}
  </div>;
}

export default function Insights({ mode, assessment, studentResults, publicLeaderboard, identity }) {
  if (mode === 'student') return <StudentInsights results={studentResults} leaderboard={publicLeaderboard} identity={identity} />;
  if (mode === 'preview') return <StudentInsights results={studentResults ?? assessment?.studentResults} leaderboard={publicLeaderboard ?? assessment?.leaderboard} identity={identity} />;
  return <TeacherInsights assessment={assessment} />;
}
