const rubric = [
  ['Meaning preservation', '4 marks'],
  ['Vocabulary variation', '2 marks'],
  ['Sentence restructuring', '2 marks'],
  ['Completeness and appropriate tone', '2 marks'],
];

export default function Assessment({ mode, results, published, quizScore, leaderboard }) {
  const preview = mode === 'preview';
  if (mode === 'student') {
    if (!published || !results) return <div className="assessment-student-state"><span aria-hidden="true">✦</span><h1 id="stage-title">Your work is being reviewed</h1><p>Your teacher will share your assessment results when the review is complete.</p></div>;
    return <div className="assessment-student-state"><p className="section-kicker">STAGE 5 · YOUR RESULTS</p><h1 id="stage-title">Your assessment</h1>
      <div className="assessment-final-score"><strong>{results.finalScore.toFixed(1)}</strong><span>/ 100</span></div>
      <p>Quiz: {results.quizScore} / 3</p>
      {results.results.map((result) => <article className="assessment-result-card" key={result.exercise}><h2>{result.exercise === 'message-remix' ? 'Message Remix' : 'Academic Transfer'} · {result.total} / 10</h2><p>{result.feedback}</p>
        <ul>{rubric.map(([label]) => <li key={label}>{label}: {result.criteria?.[({ 'Meaning preservation': 'meaningPreservation', 'Vocabulary variation': 'vocabularyVariation', 'Sentence restructuring': 'sentenceRestructuring', 'Completeness and appropriate tone': 'completenessAndTone' })[label]]}</li>)}</ul>
      </article>)}
      <p>Your class rank: {results.rank ?? '—'}</p>
    </div>;
  }
  return <div className="assessment-stage-content">
    <div className="activity-topline"><span className="stage-eyebrow">Stage 5 · Assessment</span><span className="activity-mode-label">{preview ? 'Local preview' : 'Teacher-controlled review'}</span></div>
    <p className="section-kicker">WRITING FEEDBACK & MARKS</p><h1 id="stage-title">Assessment</h1>
    <p className="activity-description">Review the fixed Pit Stop quiz and both paraphrase exercises using the agreed 10-mark rubric.</p>
    <div className="assessment-overview"><article><span>PIT STOP</span><strong>0–3 points</strong><p>Each correct answer earns 1 point.</p></article><article><span>WRITTEN EXERCISES</span><strong>10 marks each</strong><p>Meaning 4 · Vocabulary 2 · Restructuring 2 · Completeness and tone 2.</p></article><article><span>FINAL SCORE</span><strong>100 points</strong><p>Quiz 30% · Message Remix 35% · Academic Transfer 35%.</p></article></div>
    {published && leaderboard?.length > 0 && <div className="assessment-leaderboard"><h2>Published class ranking</h2><ol>{leaderboard.map((entry) => <li key={entry.participantId}><span>#{entry.rank} · {entry.displayName}<small>Quiz {entry.quizScore}/3 · Remix {entry.messageRemix}/10 · Transfer {entry.academicTransfer}/10</small></span><strong>{entry.finalScore.toFixed(1)}</strong></li>)}</ol></div>}
    {preview && <p className="teacher-panel-note">This preview uses local sample assessment data and never contacts the workshop server.</p>}
  </div>;
}
