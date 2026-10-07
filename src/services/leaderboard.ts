/**
 * Leaderboard behind one interface (Strategy/Adapter pattern):
 *  - RemoteLeaderboard talks to the Vercel API route (community board)
 *  - LocalLeaderboard keeps a per-device history (offline fallback)
 *  - FallbackLeaderboard tries remote first and degrades gracefully
 */
import { loadJson, saveJson } from '../core/storage';

export type BoardKind = 'daily' | 'alltime' | 'streak';

export interface ScoreEntry {
  name: string;
  score: number;
  stages: number;
  streak: number;
  date: string;
}

export interface LeaderboardProvider {
  submit(entry: ScoreEntry): Promise<void>;
  top(kind: BoardKind, date: string, limit: number): Promise<ScoreEntry[]>;
}

interface LocalData {
  entries: ScoreEntry[];
}
const LOCAL_KEY = 'messedup:lb:v1';

export class LocalLeaderboard implements LeaderboardProvider {
  async submit(entry: ScoreEntry): Promise<void> {
    const data = loadJson<LocalData>(LOCAL_KEY, { entries: [] });
    data.entries.push(entry);
    data.entries = data.entries.slice(-300);
    saveJson(LOCAL_KEY, data);
  }

  async top(kind: BoardKind, date: string, limit: number): Promise<ScoreEntry[]> {
    const { entries } = loadJson<LocalData>(LOCAL_KEY, { entries: [] });
    const pool = kind === 'daily' ? entries.filter((e) => e.date === date) : entries;
    const key = (e: ScoreEntry) => (kind === 'streak' ? e.streak : e.score);
    const best = new Map<string, ScoreEntry>();
    for (const e of pool) {
      const cur = best.get(e.name);
      if (!cur || key(e) > key(cur)) best.set(e.name, e);
    }
    return [...best.values()].sort((a, b) => key(b) - key(a)).slice(0, limit);
  }
}

export class RemoteLeaderboard implements LeaderboardProvider {
  constructor(private readonly base = '/api/leaderboard', private readonly timeoutMs = 4000) {}

  private async request(url: string, init?: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (!res.ok) throw new Error(`leaderboard ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async submit(entry: ScoreEntry): Promise<void> {
    await this.request(this.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  async top(kind: BoardKind, date: string, limit: number): Promise<ScoreEntry[]> {
    const res = await this.request(`${this.base}?board=${kind}&date=${encodeURIComponent(date)}&limit=${limit}`);
    const json = (await res.json()) as { entries?: Array<{ name: string; score: number }> };
    return (json.entries ?? []).map((e) => ({
      name: e.name,
      score: kind === 'streak' ? 0 : e.score,
      streak: kind === 'streak' ? e.score : 0,
      stages: 0,
      date,
    }));
  }
}

export type BoardSource = 'online' | 'device';

export class FallbackLeaderboard implements LeaderboardProvider {
  /** Where the most recent read actually came from. */
  source: BoardSource = 'device';

  constructor(
    private readonly remote: LeaderboardProvider,
    private readonly local: LeaderboardProvider,
  ) {}

  async submit(entry: ScoreEntry): Promise<void> {
    await this.local.submit(entry);
    try {
      await this.remote.submit(entry);
    } catch {
      /* offline or API not configured: the local copy is enough */
    }
  }

  async top(kind: BoardKind, date: string, limit: number): Promise<ScoreEntry[]> {
    try {
      const rows = await this.remote.top(kind, date, limit);
      this.source = 'online';
      return rows;
    } catch {
      this.source = 'device';
      return this.local.top(kind, date, limit);
    }
  }
}
