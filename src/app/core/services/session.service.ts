import { Injectable } from '@angular/core';
import { WebRtcService, PeerMessage } from './webrtc.service';
import { StateService } from './state.service';
import { Player } from '../models/player.model';
import { Turn } from '../models/turn.model';

@Injectable({ providedIn: 'root' })
export class SessionService {
  constructor(
    private webRtcService: WebRtcService,
    private stateService: StateService
  ) {}

  async createSession(playerName: string): Promise<{ sessionCode: string; playerId: string }> {
    // Generate code first and register PeerJS with it as the peer ID.
    // This way players can connect using just the code — no lookup needed.
    const sessionCode = this.generateCode();
    await this.webRtcService.createHostPeer(sessionCode);

    const sessionId = this.generateId();
    const playerId = this.generateId();

    const host: Player = {
      id: playerId,
      sessionId,
      name: playerName || 'Host',
      submissionStatus: 'not-submitted',
      isConnected: true,
      joinedAt: new Date(),
    };

    const players = new Map<string, Player>();
    players.set(playerId, host);

    this.stateService.updateState({
      sessionId,
      sessionCode,
      isHost: true,
      playerId,
      players,
      gamePhase: 'initiative-input',
      turns: [],
      currentTurnIndex: 0,
      connectionStatus: 'connected',
    });

    this.listenForPlayerMessages();
    return { sessionCode, playerId };
  }

  async joinSession(
    code: string,
    playerName: string
  ): Promise<{ sessionCode: string; playerId: string }> {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
    if (normalized.length < 4) {
      throw new Error('Please enter a valid 4-character session code.');
    }

    // The code IS the host peer ID — connect directly, no lookup needed.
    await this.webRtcService.joinSession(normalized);

    const sessionId = this.generateId();
    const playerId = this.generateId();

    this.stateService.updateState({
      sessionId,
      sessionCode: normalized,
      isHost: false,
      playerId,
      players: new Map(),
      gamePhase: 'initiative-input',
      turns: [],
      currentTurnIndex: 0,
      connectionStatus: 'connected',
    });

    // Announce self to host
    this.webRtcService.sendToHost({
      type: 'player_joined',
      payload: {
        id: playerId,
        sessionId,
        name: playerName || 'Player',
        submissionStatus: 'not-submitted',
        isConnected: true,
        joinedAt: new Date(),
      } as Player,
    });

    this.listenForHostMessages();
    return { sessionCode: normalized, playerId };
  }

  closeSession(): void {
    const { sessionCode } = this.stateService.getSnapshot();
    this.webRtcService.broadcastToPlayers({ type: 'session_closed', payload: null });
    this.webRtcService.close();
    this.stateService.clearStorage(sessionCode);
    this.stateService.reset();
  }

  leaveSession(): void {
    this.webRtcService.close();
  }

  getSessionCode(): string {
    return this.stateService.getSnapshot().sessionCode;
  }

  isHost(): boolean {
    return this.stateService.getSnapshot().isHost;
  }

  // Called by host when all players have locked their initiatives
  revealTurns(): void {
    const state = this.stateService.getSnapshot();
    const players = Array.from(state.players.values()).filter(
      (p) => p.submissionStatus === 'locked' && p.isConnected
    );

    const turns: Turn[] = players
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
      .map((player, index) => ({
        order: index + 1,
        playerId: player.id,
        playerName: player.name,
        initiative: player.initiative ?? 0,
        status: index === 0 ? 'active' : ('pending' as 'active' | 'pending'),
      }));

    this.stateService.updateState({ turns, gamePhase: 'turn-display', currentTurnIndex: 0 });
    this.webRtcService.broadcastToPlayers({ type: 'turns_revealed', payload: turns });
    this.webRtcService.broadcastToPlayers({ type: 'turn_started', payload: turns[0] });
  }

  advanceTurn(): void {
    const state = this.stateService.getSnapshot();
    const nextIndex = state.currentTurnIndex + 1;

    const updatedTurns = state.turns.map((t, i) => {
      if (i === state.currentTurnIndex) return { ...t, status: 'completed' as const };
      if (i === nextIndex) return { ...t, status: 'active' as const };
      return t;
    });

    if (nextIndex >= state.turns.length) {
      this.stateService.updateState({ turns: updatedTurns, gamePhase: 'round-complete' });
      this.webRtcService.broadcastToPlayers({ type: 'round_ended', payload: null });
    } else {
      this.stateService.updateState({ turns: updatedTurns, currentTurnIndex: nextIndex });
      this.webRtcService.broadcastToPlayers({
        type: 'turn_started',
        payload: updatedTurns[nextIndex],
      });
    }
  }

  startNewRound(): void {
    this.stateService.reset();
    this.webRtcService.broadcastToPlayers({ type: 'round_ended', payload: 'new_round' });
  }

  private listenForPlayerMessages(): void {
    this.webRtcService.messages$.subscribe((msg: PeerMessage) => {
      this.handleHostSideMessage(msg);
    });

    this.webRtcService.connectionEvents$.subscribe((event) => {
      if (event.type === 'close') {
        const state = this.stateService.getSnapshot();
        const players = new Map(state.players);
        players.forEach((p, id) => {
          if (p.id === event.peerId) {
            players.set(id, { ...p, isConnected: false });
          }
        });
        this.stateService.updatePlayers(players);
        this.webRtcService.broadcastToPlayers({
          type: 'player_disconnected',
          payload: event.peerId,
        });
      }
    });
  }

  private listenForHostMessages(): void {
    this.webRtcService.messages$.subscribe((msg: PeerMessage) => {
      this.handlePlayerSideMessage(msg);
    });
  }

  private handleHostSideMessage(msg: PeerMessage): void {
    const state = this.stateService.getSnapshot();
    const players = new Map(state.players);

    switch (msg.type) {
      case 'player_joined': {
        const player = msg.payload as Player;
        players.set(player.id, player);
        this.stateService.updatePlayers(players);
        // Sync state back to all players
        this.webRtcService.broadcastToPlayers({
          type: 'state_sync',
          payload: {
            ...state,
            players: Object.fromEntries(players),
          },
        });
        break;
      }
      case 'player_initiative_updated': {
        const { playerId, initiative } = msg.payload as { playerId: string; initiative: number };
        const p = players.get(playerId);
        if (p) {
          players.set(playerId, { ...p, initiative, submissionStatus: 'submitted' });
          this.stateService.updatePlayers(players);
          this.webRtcService.broadcastToPlayers({ type: 'state_sync', payload: this.serializeState() });
        }
        break;
      }
      case 'initiative_locked': {
        const { playerId, initiative } = msg.payload as { playerId: string; initiative: number };
        const p = players.get(playerId);
        if (p) {
          players.set(playerId, { ...p, initiative, submissionStatus: 'locked' });
          this.stateService.updatePlayers(players);
          this.webRtcService.broadcastToPlayers({ type: 'state_sync', payload: this.serializeState() });

          // Auto-reveal turns if all connected players locked
          const allLocked = Array.from(players.values())
            .filter((pl) => pl.isConnected)
            .every((pl) => pl.submissionStatus === 'locked');
          if (allLocked) this.revealTurns();
        }
        break;
      }
      case 'turn_ended': {
        this.advanceTurn();
        break;
      }
    }
  }

  private handlePlayerSideMessage(msg: PeerMessage): void {
    switch (msg.type) {
      case 'state_sync': {
        const raw = msg.payload as Record<string, unknown>;
        const players = new Map<string, Player>(
          Object.entries(raw['players'] as Record<string, Player>)
        );
        this.stateService.updateState({
          players,
          gamePhase: raw['gamePhase'] as any,
          turns: raw['turns'] as any,
          currentTurnIndex: raw['currentTurnIndex'] as number,
        });
        break;
      }
      case 'turns_revealed': {
        this.stateService.updateState({
          turns: msg.payload as Turn[],
          gamePhase: 'turn-display',
          currentTurnIndex: 0,
        });
        break;
      }
      case 'turn_started': {
        const turn = msg.payload as Turn;
        this.stateService.updateState({ currentTurnIndex: turn.order - 1 });
        break;
      }
      case 'round_ended': {
        if (msg.payload === 'new_round') {
          this.stateService.reset();
        } else {
          this.stateService.updateState({ gamePhase: 'round-complete' });
        }
        break;
      }
      case 'player_disconnected': {
        const state = this.stateService.getSnapshot();
        const players = new Map(state.players);
        const peerId = msg.payload as string;
        players.forEach((p, id) => {
          if (p.id === peerId) players.set(id, { ...p, isConnected: false });
        });
        this.stateService.updatePlayers(players);
        break;
      }
      case 'session_closed': {
        this.webRtcService.close();
        this.stateService.reset();
        break;
      }
    }
  }

  private serializeState(): Record<string, unknown> {
    const state = this.stateService.getSnapshot();
    return {
      ...state,
      players: Object.fromEntries(state.players),
    };
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous chars
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
