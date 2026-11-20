import { useState } from 'react';
import { pitStopMission, pitStopQuestions } from '../data/pitStopQuestions.js';

export default function PitStop({ mode, quiz, onSubmit }) {
  const [selectedOptions, setSelectedOptions] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  const [message, setMessage] = useState('');
  const teacher = mode === 'teacher';
  const answers = quiz?.answers ?? [];
  const reveal = quiz?.reveal ?? [];
  const acceptedByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const revealByQuestion = new Map(reveal.map((item) => [item.questionId, item]));
  const score = quiz?.revealed ? pitStopQuestions.reduce((total, question) => {
    return total + Number(acceptedByQuestion.get(question.id)?.option === revealByQuestion.get(question.id)?.correctOption);
  }, 0) : null;

  const submitAnswer = async (questionId) => {
    const option = selectedOptions[questionId];
    if (!option || acceptedByQuestion.has(questionId) || !quiz?.open) return;
    setSubmittingId(questionId);
    setMessage('');
    const result = await onSubmit?.(questionId, option);
    if (!result?.ok) setMessage(result?.error === 'QUIZ_CLOSED' ? 'The quiz is closed. Your answer was not submitted.' : 'Your answer could not be submitted. Please try again.');
    else setMessage('Your answer has been saved and cannot be changed.');
    setSubmittingId(null);
  };

  return <div className="pit-stop">
    <div className="activity-topline pit-stop-topline">
      <span className="stage-eyebrow">Stage 3 · Paraphrase Pit Stop</span>
      <span className="activity-mode-label">{teacher ? 'Shared activity · Teacher view' : 'Choose one answer for each question'}</span>
    </div>

    <header className="pit-stop-heading">
      <div className="pit-stop-title-row">
        <div><p className="pit-stop-kicker"><span aria-hidden="true">✦</span> PARAPHRASE PIT STOP</p><h1 id="stage-title">Paraphrase Pit Stop</h1></div>
        <span className={`quiz-state-badge ${quiz?.open ? 'is-open' : ''}`}><i aria-hidden="true" />{quiz?.open ? 'Quiz open' : quiz?.revealed ? 'Answers revealed' : 'Quiz closed'}</span>
      </div>
      <section className="mission-briefing" aria-labelledby="mission-title">
        <div className="mission-icon" aria-hidden="true">✎</div>
        <div><span className="mission-label" id="mission-title">YOUR MISSION SENTENCE</span><p>{pitStopMission}</p></div>
      </section>
      <div className="quiz-guidance"><span>3 questions</span><i aria-hidden="true">·</i><span>1 point each</span><i aria-hidden="true">·</i><span>Maximum 3 points</span>{quiz?.revealed && !teacher && <strong className="quiz-score">Your score: {score} / 3</strong>}</div>
    </header>

    {!quiz?.open && !quiz?.revealed && <div className="quiz-closed-message" role="status">The teacher will open the quiz when it is time to begin.</div>}
    {quiz?.open && !teacher && <p className="quiz-open-message" role="status">Choose an answer and submit it. Submitted answers are locked.</p>}
    {teacher && <p className="quiz-open-message" role="status">{quiz?.open ? 'The quiz is open for students.' : quiz?.revealed ? 'Correct answers and explanations have been revealed.' : 'Open the quiz when you are ready for students to answer.'}</p>}

    <div className="quiz-question-list">
      {pitStopQuestions.map((question, index) => {
        const accepted = acceptedByQuestion.get(question.id);
        const revealed = revealByQuestion.get(question.id);
        const correct = quiz?.revealed ? revealed?.correctOption : null;
        return <article className={`quiz-question-card quiz-card-tone-${index + 1}`} key={question.id}>
          <div className="quiz-question-heading"><span className="quiz-question-number">0{index + 1}</span><div><h2>{question.title}</h2><p>{question.prompt}</p></div>
            {accepted && !teacher && <span className="answer-locked-tag" role="status">Submitted · locked</span>}
          </div>
          <fieldset className="quiz-options" disabled={teacher || !quiz?.open || Boolean(accepted)}>
            <legend className="visually-hidden">{question.title}: {question.prompt}</legend>
            {Object.entries(question.options).map(([option, text]) => {
              const chosen = accepted?.option === option || (!accepted && selectedOptions[question.id] === option);
              const isCorrect = quiz?.revealed && correct === option;
              const isWrongSubmission = quiz?.revealed && accepted?.option === option && option !== correct;
              return <label className={`quiz-option ${chosen ? 'is-selected' : ''} ${isCorrect ? 'is-correct' : ''} ${isWrongSubmission ? 'is-wrong-answer' : ''}`} key={option}>
                {!teacher && <input type="radio" name={`answer-${question.id}`} value={option} checked={Boolean(chosen)} onChange={() => { setSelectedOptions((current) => ({ ...current, [question.id]: option })); setMessage(''); }} />}
                <span className="quiz-option-letter" aria-hidden="true">{option}</span>
                <span className="quiz-option-text">{text}</span>
                {isCorrect && <span className="quiz-correct-label">Correct answer</span>}
              </label>;
            })}
          </fieldset>

          {!teacher && !accepted && <button className="quiz-submit-answer" type="button" disabled={!quiz?.open || !selectedOptions[question.id] || submittingId === question.id} onClick={() => void submitAnswer(question.id)}>
            {submittingId === question.id ? 'Saving…' : 'Submit answer'}<span aria-hidden="true">→</span>
          </button>}
          {quiz?.revealed && revealed && <div className="quiz-explanation" role="note"><span className="explanation-spark" aria-hidden="true">✦</span><p><strong>Explanation</strong>{revealed.explanation}</p></div>}
        </article>;
      })}
    </div>
    {message && !teacher && <p className="quiz-submit-feedback" role="status">{message}</p>}
    <footer className="pit-stop-footer"><span>WORDS CONNECT</span><span>Read carefully · Keep the meaning</span></footer>
  </div>;
}
