/** Community leaderboards, read from the API (cached at the CDN for 30 seconds). */
import { apiRequest } from './api';

export type BoardKind = 'daily' | 'alltime' | 'streak';

export interface BoardEntry {
  name: string;
  score: number;
}

export async function fetchBoard(kind: BoardKind): Promise<BoardEntry[]> {
  const res = await apiRequest<{ entries?: BoardEntry[] }>(`/api/leaderboard?board=${kind}`);
  return res.entries ?? [];
}
