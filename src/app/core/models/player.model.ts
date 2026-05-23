export interface Player {
  id: string;
  sessionId: string;
  name: string;
  initiative?: number;
  submissionStatus: 'not-submitted' | 'submitted' | 'locked';
  isConnected: boolean;
  joinedAt: Date;
}
