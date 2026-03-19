export default function Loading() {
  return (
    <div className="page-shell flex justify-center" style={{ paddingTop: '80px', textAlign: 'center' }}>
      <div className="loading-spinner"></div>
      <p className="muted" style={{ marginTop: '16px' }}>Loading application data...</p>
    </div>
  );
}
