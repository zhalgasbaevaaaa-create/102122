import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { GameShell, type StageComponent } from '../games/GameShell';
import { AdventureStage } from '../games/adventure/AdventureStage';
import { StrategyStage } from '../games/strategy/StrategyStage';
import { DefenseStage } from '../games/defense/DefenseStage';
import { RaceStage } from '../games/race/RaceStage';
import { PuzzleStage } from '../games/puzzle/PuzzleStage';
import { BattleStage } from '../games/battle/BattleStage';
import { gameById } from '@shared/games';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Spinner } from '../components/UI';

const STAGES: Record<string, StageComponent> = {
  adventure: AdventureStage as unknown as StageComponent,
  strategy: StrategyStage as unknown as StageComponent,
  defense: DefenseStage as unknown as StageComponent,
  race: RaceStage as unknown as StageComponent,
  puzzle: PuzzleStage as unknown as StageComponent,
  battle: BattleStage as unknown as StageComponent,
};

export default function GamePage() {
  const { gameId } = useParams();
  const game = gameId ? gameById(gameId) : null;
  const { user } = useAuth();
  const [progress, setProgress] = useState<Record<string, number> | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api<any>('/api/me/profile')
      .then((p) => {
        const g = p.perGame?.find((x: any) => x.gameId === gameId);
        const map: Record<string, number> = {};
        (g?.levels ?? []).forEach((l: number) => { map[String(l)] = 1; });
        setProgress(map);
      })
      .catch(() => setProgress({}))
      .finally(() => setLoading(false));
  }, [user, gameId]);

  if (!game) return <Navigate to="/oyyndar" replace />;
  if (loading) return <Spinner label="Деңгейлер жүктелуде…" />;

  const Stage = STAGES[game.id];
  return <GameShell game={game} Stage={Stage} progress={progress} />;
}
