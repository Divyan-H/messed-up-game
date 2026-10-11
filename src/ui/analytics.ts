/**
 * Vercel Web Analytics (page views and visitor counts) and Speed Insights (real-user load speed:
 * Core Web Vitals such as LCP, INP and CLS). Neither sets cookies or collects personal data.
 * Production only. Vercel serves both scripts from our own origin once the feature is switched on in the
 * project dashboard; until then the request simply 404s and nothing happens.
 */
type Queue = (...args: unknown[]) => void;

function load(src: string, queueName: 'va' | 'si', bufferName: 'vaq' | 'siq'): void {
  const w = window as unknown as Record<string, Queue | unknown[][] | undefined>;
  w[queueName] ??= ((...args: unknown[]) => {
    ((w[bufferName] ??= []) as unknown[][]).push(args);
  }) as Queue;
  const s = document.createElement('script');
  s.defer = true;
  s.src = src;
  document.head.append(s);
}

export function initAnalytics(): void {
  if (!import.meta.env.PROD) return;
  load('/_vercel/insights/script.js', 'va', 'vaq');
  load('/_vercel/speed-insights/script.js', 'si', 'siq');
}
