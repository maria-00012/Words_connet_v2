export default function StageNavigation({ stages, activeStageId, onSelect, locked = false, unlockedStageIds = [] }) {
  return (
    <nav className="stage-navigation" aria-label="Workshop stages">
      <div className="navigation-heading">
        <div>
          <p className="section-kicker">Workshop path</p>
          <h2>Explore the stages</h2>
        </div>
        <span className="stage-count">{stages.findIndex((stage) => stage.id === activeStageId) + 1} of {stages.length}</span>
      </div>
      <ol className="stage-nav-list">
        {stages.map((stage, index) => {
          const active = stage.id === activeStageId;
          const disabled = locked && !active && !unlockedStageIds.includes(stage.id);
          return (
            <li key={stage.id}>
              <button
                type="button"
                className={`stage-nav-button ${stage.kind === 'welcome' ? 'is-welcome' : ''} ${active ? 'is-active' : ''}`}
                aria-current={active ? 'step' : undefined}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => { if (!disabled) onSelect(stage.id); }}
              >
                <span className="stage-nav-number">{stage.kind === 'welcome' ? '✦' : String(index).padStart(2, '0')}</span>
                <span className="stage-nav-labels">
                  <span className="stage-nav-detail">{stage.navDetail}</span>
                  <span className="stage-nav-title">{stage.navLabel}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
