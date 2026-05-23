import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GameState, GamePhase } from '../models/game-state.model';
import { Player } from '../models/player.model';
import { Turn } from '../models/turn.model';

const STORAGE_PREFIX = 'guards_gamestate_';

@Injectable({ providedIn: 'root' })
export class StateService {
  private _state$ = new BehaviorSubject<GameState>(this.defaultState());

  getState(): Observable<GameState> {
    return this._state$.asObservable();
  }

  getSnapshot(): GameState {
    return this._state$.value;
  }

  updateState(partial: Partial<GameState>): void {
    const next = { ...this._state$.value, ...partial };
    this._state$.next(next);
    this.saveToStorage(next);
  }

  updatePlayers(players: Map<string, Player>): void {
    this.updateState({ players });
  }

  reset(): void {
    const current = this._state$.value;
    const resetState: GameState = {
      ...current,
      gamePhase: 'initiative-input',
      turns: [],
      currentTurnIndex: 0,
      players: new Map(
        Array.from(current.players.entries()).map(([id, p]) => [
          id,
          { ...p, initiative: undefined, submissionStatus: 'not-submitted' },
        ])
      ),
    };
    this._state$.next(resetState);
    this.saveToStorage(resetState);
  }

  loadFromStorage(sessionCode: string): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + sessionCode);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      // Restore Map from plain object
      if (parsed.players && !(parsed.players instanceof Map)) {
        parsed.players = new Map(Object.entries(parsed.players));
      }
      this._state$.next(parsed);
      return true;
    } catch {
      return false;
    }
  }

  clearStorage(sessionCode: string): void {
    localStorage.removeItem(STORAGE_PREFIX + sessionCode);
  }

  private saveToStorage(state: GameState): void {
    if (!state.sessionCode) return;
    try {
      const toSave = {
        ...state,
        players: Object.fromEntries(state.players),
      };
      localStorage.setItem(STORAGE_PREFIX + state.sessionCode, JSON.stringify(toSave));
    } catch {
      // Storage might be full; ignore
    }
  }

  private defaultState(): GameState {
    return {
      sessionId: '',
      sessionCode: '',
      isHost: false,
      playerId: '',
      players: new Map(),
      gamePhase: 'initiative-input',
      turns: [],
      currentTurnIndex: 0,
      connectionStatus: 'disconnected',
    };
  }
}
