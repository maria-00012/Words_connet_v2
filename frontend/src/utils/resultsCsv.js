const exercises = [
  ['message-remix', 'Message Remix'],
  ['academic-transfer', 'Academic Transfer'],
];

const criteria = [
  ['meaningPreservation', 'Meaning preservation'],
  ['vocabularyVariation', 'Vocabulary variation'],
  ['sentenceRestructuring', 'Sentence restructuring'],
  ['completenessAndTone', 'Completeness and tone'],
];

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\u0000-\u0020]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createResultsCsv(assessment) {
  const leaderboard = assessment?.leaderboard ?? [];
  const resultByParticipant = new Map();
  for (const result of assessment?.results ?? []) {
    const participantResults = resultByParticipant.get(result.participantId) ?? {};
    participantResults[result.exercise] = result;
    resultByParticipant.set(result.participantId, participantResults);
  }

  const header = ['Participant number', 'Student name', 'Rank', 'Pit Stop score'];
  for (const [, title] of exercises) {
    header.push(`${title} score`, ...criteria.map(([, label]) => `${title} · ${label}`),
      `${title} feedback`, `${title} source`, `${title} response`);
  }
  header.push('Final score');

  const rows = leaderboard.map((student) => {
    const results = resultByParticipant.get(student.participantId) ?? {};
    const row = [student.displayNumber, student.displayName, student.rank, student.quizScore];
    for (const [exercise] of exercises) {
      const result = results[exercise];
      row.push(result?.total ?? 0,
        ...criteria.map(([key]) => result?.criteria?.[key] ?? 0),
        result?.feedback ?? '', result?.sourceText ?? '', result?.responseText ?? '');
    }
    row.push(Number(student.finalScore ?? 0).toFixed(1));
    return row;
  });

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
