import { useEffect, useState } from 'react';
import { api } from './api';
import type { Period } from '@shared/periods';
import type { HistoricalEvent } from '@shared/events';
import type { Person } from '@shared/persons';
import type { Source } from '@shared/sources';
import type { Artifact } from '@shared/artifacts';
import type { Kingdom, HistoricalRoute } from '@shared/kingdoms';
import type { Category } from '@shared/facts';
import type { AchievementDef } from '@shared/gamification';
import type { GameDef } from '@shared/games';

export interface Bundle {
  periods: Period[];
  events: HistoricalEvent[];
  persons: Person[];
  sources: Source[];
  artifacts: Artifact[];
  kingdoms: Kingdom[];
  routes: HistoricalRoute[];
  categories: Category[];
  achievements: Omit<AchievementDef, 'check'>[];
  games: GameDef[];
  stats: { questions: number; facts: number; persons: number; events: number };
}

let cache: Bundle | null = null;
let inflight: Promise<Bundle> | null = null;

export function useContent() {
  const [data, setData] = useState<Bundle | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    if (!inflight) {
      inflight = api<Bundle>('/api/content/bundle')
        .then((d) => {
          cache = d;
          return d;
        })
        .finally(() => {
          inflight = null;
        });
    }
    inflight.then(setData).catch((e) => setError(e.message));
  }, []);

  return { data, error, loading: !data && !error };
}
