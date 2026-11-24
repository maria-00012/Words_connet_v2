export default function PreviewIndicator({ onExit }) {
  return (
    <aside className="preview-indicator" role="status" aria-label="Preview mode">
      <span className="preview-pill">DEMO / PREVIEW</span>
      <span>Local interface preview. No real session or student data is connected.</span>
      <button className="preview-exit-button" type="button" onClick={onExit}>Exit Demo</button>
    </aside>
  );
}
