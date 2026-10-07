/** "Sign in with Google" button via Google Identity Services (loaded only when a button is needed). */
import { GOOGLE_CLIENT_ID } from '../services/authConfig';

interface GsiId {
  initialize(cfg: Record<string, unknown>): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

let loading: Promise<GsiId> | null = null;
let onCredential: ((credential: string) => void) | null = null;

function loadGsi(): Promise<GsiId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GsiId>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const id = window.google?.accounts?.id;
      if (!id) return reject(new Error('gsi'));
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r: { credential?: string }) => r.credential && onCredential?.(r.credential),
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });
      resolve(id);
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('gsi'));
    };
    document.head.append(s);
  });
  return loading;
}

/** Renders Google's own button into `el`. Resolves false if Google's script could not load. */
export async function renderGoogleButton(el: HTMLElement, handler: (credential: string) => void, width = 240): Promise<boolean> {
  onCredential = handler;
  try {
    const id = await loadGsi();
    id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular', logo_alignment: 'left', width });
    return true;
  } catch {
    return false;
  }
}

export function forgetGoogleSelection(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
