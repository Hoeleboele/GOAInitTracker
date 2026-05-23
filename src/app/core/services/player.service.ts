import { Injectable } from '@angular/core';
import { StateService } from './state.service';
import { WebRtcService } from './webrtc.service';
import { Player } from '../models/player.model';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  constructor(
    private stateService: StateService,
    private webRtcService: WebRtcService
  ) {}

  getCurrentPlayer(): Player | undefined {
    const state = this.stateService.getSnapshot();
    return state.players.get(state.playerId);
  }

  getPlayers(): Player[] {
    return Array.from(this.stateService.getSnapshot().players.values());
  }

  submitInitiative(initiative: number): void {
    this.updateLocalPlayer({ initiative, submissionStatus: 'submitted' });
    const state = this.stateService.getSnapshot();
    if (!state.isHost) {
      this.webRtcService.sendToHost({
        type: 'player_initiative_updated',
        payload: { playerId: state.playerId, initiative },
      });
    }
  }

  lockInitiative(initiative: number): void {
    this.updateLocalPlayer({ initiative, submissionStatus: 'locked' });
    const state = this.stateService.getSnapshot();

    if (state.isHost) {
      // Host locks inline — session service handles auto-reveal via message bus
      // Re-broadcast state so all players see host is locked
      this.webRtcService.broadcastToPlayers({
        type: 'state_sync',
        payload: { ...state, players: Object.fromEntries(state.players) },
      });
    } else {
      this.webRtcService.sendToHost({
        type: 'initiative_locked',
        payload: { playerId: state.playerId, initiative },
      });
    }
  }

  editInitiative(): void {
    const state = this.stateService.getSnapshot();
    if (state.gamePhase !== 'initiative-input') return;
    this.updateLocalPlayer({ initiative: undefined, submissionStatus: 'not-submitted' });
  }

  endTurn(): void {
    const state = this.stateService.getSnapshot();
    if (state.isHost) {
      // SessionService.advanceTurn() will be called when message received
      this.webRtcService.broadcastToPlayers({ type: 'turn_ended', payload: null });
      // Also handle locally
      this.webRtcService.sendToHost({ type: 'turn_ended', payload: null });
    } else {
      this.webRtcService.sendToHost({ type: 'turn_ended', payload: null });
    }
  }

  private updateLocalPlayer(updates: Partial<Player>): void {
    const state = this.stateService.getSnapshot();
    const players = new Map(state.players);
    const current = players.get(state.playerId);
    if (current) {
      players.set(state.playerId, { ...current, ...updates });
      this.stateService.updatePlayers(players);
    }
  }
}
