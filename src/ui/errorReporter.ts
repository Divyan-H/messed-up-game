/**
 * Sends uncaught errors from players' browsers to /api/report so they show up in the health check.
 * Production only, our own scripts only, at most a few distinct errors per visit.
 */
export function initErrorReporting(): void {
  if (!import.meta.env.PROD) return;
  const seen = new Set<string>();
  const report = (message: string, where: string) => {
    const key = `${message}|${where}`;
    if (seen.size >= 5 || seen.has(key)) return;
    seen.add(key);
    void fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 300), where: where.slice(0, 200) }),
      keepalive: true,
    }).catch(() => undefined);
  };
  window.addEventListener('error', (e) => {
    if (!e.filename?.startsWith(location.origin)) return; // ignore extensions and Google's sign-in script
    report(String(e.message), `${e.filename.slice(location.origin.length)}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    const where = r instanceof Error ? (r.stack?.split('\n')[1]?.trim() ?? 'promise') : 'promise';
    report(r instanceof Error ? `${r.name}: ${r.message}` : String(r), where);
  });
}
