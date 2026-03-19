export default function RunLoading() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Loading run</div>
          <h1>Preparing simulation results...</h1>
          <p>This usually takes a moment while the run record and snapshots load.</p>
        </div>
        <div className="panel stack">
          <div className="metric-card">
            <div className="eyebrow">Status</div>
            <div className="metric-value">Loading</div>
          </div>
        </div>
      </section>
    </main>
  );
}
