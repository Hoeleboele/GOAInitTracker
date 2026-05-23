import { Player } from './player.model';
import { Turn } from './turn.model';

export type GamePhase = 'initiative-input' | 'turn-display' | 'round-complete';
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface GameState {
  sessionId: string;
  sessionCode: string;
  isHost: boolean;
  playerId: string;
  players: Map<string, Player>;
  gamePhase: GamePhase;
  turns: Turn[];
  currentTurnIndex: number;
  connectionStatus: ConnectionStatus;
}
