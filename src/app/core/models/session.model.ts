export interface Session {
  id: string;
  code: string;
  hostId: string;
  createdAt: Date;
  status: 'active' | 'ended';
  playerIds: string[];
}
