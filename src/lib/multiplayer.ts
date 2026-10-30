/**
 * useMultiplayer — thin, typed WebSocket client for «Тарих майданы» онлайн.
 *
 * Responsibilities kept deliberately small: connect (same-origin `/ws`), send
 * the auth token in the first frame rather than the URL, expose the latest
 * server event, and reconnect with backoff. All game rules live on the server.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenStore } from './api';

export interface MpSeat {
  id: string;
  name: string;
  team: 'A' | 'B' | null;
  bot: boolean;
  ready: boolean;
  connected: boolean;
  score: number;
  correct: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  answered: number;
}

export interface MpRoom {
  code: string;
  status: 'lobby' | 'playing' | 'reveal' | 'finished' | 'aborted';
  hostId: string;
  total: number;
  index: number;
  level: number;
  timerMs: number;
  teamMode: boolean;
  seats: MpSeat[];
}

export interface MpQuestion {
  index: number;
  total: number;
  question: any;
  deadline: number;
  serverTime: number;
  revealed: boolean;
}

export interface MpResultRow {
  seatId: string;
  name: string;
  bot: boolean;
  score: number;
  correct: number;
  wrong: number;
  bestStreak: number;
  serverScore?: number;
  xp?: number;
  rank?: { title: string; level: number } | null;
  unlocked?: { id: string; title: string; description: string; icon: string; xp: number }[];
}

export type MpEvent =
  | { type: 'welcome'; path: string; serverTime: number }
  | { type: 'ready'; user: { id: string; name: string; role: string } }
  | { type: 'created'; code: string; seatId: string; room: MpRoom }
  | { type: 'joined'; code: string; seatId: string; room: MpRoom }
  | { type: 'state'; you: string | null; room: MpRoom; question: MpQuestion | null; feed: any[]; serverTime: number }
  | { type: 'question'; index: number; total: number; question: any; deadline: number; serverTime: number; revealed: boolean }
  | { type: 'seat_answered'; seatId: string; seats: MpSeat[] }
  | { type: 'answer_result'; correct: boolean; explanation: string; sourceIds: string[]; score: number; streak: number }
  | { type: 'reveal'; index: number; correctAnswerLabel: string; explanation: string; sourceIds: string[]; perSeat: { seatId: string; correct: boolean; answered: boolean }[]; seats: MpSeat[]; teamTotals: { A: number; B: number } | null; nextAt: number }
  | { type: 'finished'; winner: string; teamTotals: { A: number; B: number } | null; results: MpResultRow[]; me: { seatId: string; score: number; xp: number; accuracy: number; bestStreak: number; breakdown: any; rank: any; totalXp: number; unlocked: any[] } | null }
  | { type: 'feed'; event: { at: number; kind: string; text: string } }
  | { type: 'closed'; reason: string }
  | { type: 'left' }
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: string; error: string };

export type MpStatus = 'idle' | 'connecting' | 'open' | 'closed';

export function useMultiplayer() {
  const [status, setStatus] = useState<MpStatus>('idle');
  const [event, setEvent] = useState<MpEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string; role: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);
  const retryRef = useRef(0);
  const wantOpen = useRef(false);

  const url = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  };

  const flush = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (queueRef.current.length) ws.send(queueRef.current.shift()!);
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    const data = JSON.stringify(msg);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    else queueRef.current.push(data);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    wantOpen.current = true;
    setStatus('connecting');
    setError(null);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url());
    } catch {
      setStatus('closed');
      setError('WebSocket қосылымын ашу мүмкін болмады');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setStatus('open');
      ws.send(JSON.stringify({ type: 'hello', token: tokenStore.get() }));
      flush();
    };
    ws.onmessage = (e) => {
      let msg: MpEvent;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (msg.type === 'ready') setMe(msg.user);
      if (msg.type === 'error') setError(msg.error);
      setEvent(msg);
    };
    ws.onclose = () => {
      setStatus('closed');
      wsRef.current = null;
      if (!wantOpen.current) return;
      // exponential backoff, capped at 8s
      const delay = Math.min(8000, 400 * 2 ** retryRef.current++);
      setTimeout(() => {
        if (wantOpen.current) connect();
      }, delay);
    };
    ws.onerror = () => setError('Қосылым қатесі');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  const disconnect = useCallback(() => {
    wantOpen.current = false;
    queueRef.current = [];
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('closed');
    setEvent(null);
    setMe(null);
  }, []);

  useEffect(() => () => {
    wantOpen.current = false;
    wsRef.current?.close();
  }, []);

  return { status, event, error, me, connect, disconnect, send, setError };
}
