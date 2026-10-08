/**
 * Streak reminders: subscribes this device to Web Push for the signed-in account. The server sends one
 * reminder in the evening if the player has a streak to lose and has not played that day.
 */
import { isIos, isStandalone } from '../ui/install';
import { apiRequest } from './api';

export type ReminderResult = 'on' | 'denied' | 'unsupported' | 'needs-install';

export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const sameKey = (sub: PushSubscription, key: Uint8Array): boolean => {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
};

export async function remindersOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  return !!(await reg?.pushManager.getSubscription());
}

export async function enableReminders(): Promise<ReminderResult> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const key = fromBase64Url((await apiRequest<{ key: string }>('/api/push/key')).key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await apiRequest('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return 'on';
}

export async function disableReminders(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await apiRequest('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}
