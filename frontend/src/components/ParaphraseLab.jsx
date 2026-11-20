import { useState } from 'react';

const concepts = [
  { id: 'synonyms', title: 'Synonyms', color: 'peach', mark: 'Aa', hint: 'Find a word with a similar meaning' },
  { id: 'structure', title: 'Change the Structure', color: 'lavender', mark: '↗', hint: 'Build the sentence a new way' },
  { id: 'meaning', title: 'Keep the Meaning', color: 'mint', mark: '≈', hint: 'Keep the central idea' },
];

function ExampleContent({ concept }) {
  if (concept.id === 'synonyms') {
    return <>
      <p className="bubble-detail-intro">Use suitable synonyms to say an idea in new words.</p>
      <div className="synonym-pairs" aria-label="Synonym examples">
        {[
          ['Happy', 'Glad'],
          ['Big', 'Large'],
          ['Important', 'Significant'],
          ['Beautiful', 'Attractive'],
        ].map(([original, alternative]) => <div className="synonym-pair" key={original}>
          <span>{original}</span><span className="synonym-arrow" aria-hidden="true">→</span><strong>{alternative}</strong>
        </div>)}
      </div>
    </>;
  }

  if (concept.id === 'structure') {
    return <>
      <p className="bubble-detail-intro">Change the sentence structure and wording to express the idea in a new way.</p>
      <div className="sentence-transformation">
        <div className="sentence-example original-example"><span>Original</span><p>She is a good student.</p></div>
        <span className="transformation-arrow" aria-hidden="true">↓</span>
        <div className="sentence-example paraphrased-example"><span>Paraphrased</span><p>She is an excellent learner.</p></div>
      </div>
    </>;
  }

  return <>
    <p className="bubble-detail-intro">The words and sentence structure can change while the original idea stays the same.</p>
    <div className="sentence-transformation">
      <div className="sentence-example original-example"><span>Original</span><p>Students learn English to improve their communication skills.</p></div>
      <span className="transformation-arrow" aria-hidden="true">↓</span>
      <div className="sentence-example paraphrased-example"><span>Paraphrased</span><p>Students study English to develop their ability to communicate.</p></div>
    </div>
    <div className="meaning-kept-note"><span aria-hidden="true">✦</span> The central meaning stays the same.</div>
  </>;
}

export default function ParaphraseLab({ mode }) {
  const [openConceptId, setOpenConceptId] = useState(null);
  const openConcept = concepts.find((concept) => concept.id === openConceptId);

  return <div className="paraphrase-lab">
    <div className="activity-topline paraphrase-topline">
      <span className="stage-eyebrow">Stage 2 · Learn</span>
      <span className="activity-mode-label">{mode === 'teacher' ? 'Shared activity · Teacher view' : 'Explore at your own pace'}</span>
    </div>

    <header className="paraphrase-heading">
      <p className="paraphrase-kicker"><span aria-hidden="true">✦</span> BUBBLE POP ACTIVITY</p>
      <h1 id="stage-title">Learn Paraphrasing</h1>
      <p>Pop open a bubble to explore a new way to express an idea.</p>
    </header>

    <div className="paraphrase-bubble-field" aria-label="Choose a paraphrasing idea">
      {concepts.map((concept, index) => {
        const expanded = openConceptId === concept.id;
        return <button
          type="button"
          key={concept.id}
          className={`concept-bubble bubble-${concept.color} bubble-position-${index + 1}${expanded ? ' is-open' : ''}`}
          aria-expanded={expanded}
          aria-controls={expanded ? 'paraphrase-example' : undefined}
          onClick={() => setOpenConceptId(expanded ? null : concept.id)}
        >
          <span className="concept-bubble-glint" aria-hidden="true" />
          <span className="concept-bubble-mark" aria-hidden="true">{concept.mark}</span>
          <strong>{concept.title}</strong>
          <span className="concept-bubble-hint">{expanded ? 'Tap to close' : concept.hint}</span>
        </button>;
      })}
    </div>

    <div className={`bubble-example-wrap${openConcept ? ' has-example' : ''}`}>
      {openConcept ? <section className="bubble-example" id="paraphrase-example" aria-labelledby="bubble-example-title" aria-live="polite">
        <div className="bubble-example-heading">
          <div><span className="example-pop-label">BUBBLE POPPED</span><h2 id="bubble-example-title">{openConcept.title}</h2></div>
          <button type="button" className="bubble-close-button" onClick={() => setOpenConceptId(null)} aria-label={`Close ${openConcept.title} example`}>×</button>
        </div>
        <ExampleContent concept={openConcept} />
      </section> : <div className="bubble-empty-prompt" aria-live="polite">
        <span className="empty-prompt-sparkle" aria-hidden="true">✧</span>
        <p>Choose any floating bubble to see an example</p>
      </div>}
    </div>

    <footer className="paraphrase-footer"><span>WORDS CONNECT</span><span>Explore · Reword · Keep the meaning</span></footer>
  </div>;
}
