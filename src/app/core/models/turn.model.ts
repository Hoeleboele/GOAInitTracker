export interface Turn {
  order: number;
  playerId: string;
  playerName: string;
  initiative: number;
  status: 'pending' | 'active' | 'completed';
}
