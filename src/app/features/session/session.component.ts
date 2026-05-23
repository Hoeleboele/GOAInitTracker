import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { StateService } from '../../core/services/state.service';
import { SessionService } from '../../core/services/session.service';
import { PlayerService } from '../../core/services/player.service';
import { NotificationService } from '../../core/services/notification.service';
import { GameState } from '../../core/models/game-state.model';
import { Player } from '../../core/models/player.model';

import { SessionCodeDisplayComponent } from '../../shared/components/session-code-display/session-code-display.component';
import { PlayerListComponent } from '../../shared/components/player-list/player-list.component';
import { NumberPadComponent } from '../../shared/components/number-pad/number-pad.component';
import { TurnDisplayComponent } from '../../shared/components/turn-display/turn-display.component';

@Component({
  selector: 'app-session',
  standalone: true,
  imports: [
    CommonModule,
    SessionCodeDisplayComponent,
    PlayerListComponent,
    NumberPadComponent,
    TurnDisplayComponent,
  ],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
})
export class SessionComponent implements OnInit, OnDestroy {
  state!: GameState;
  initiativeValue = '';
  isLocked = false;
  showCloseConfirm = false;
  private subs = new Subscription();

  constructor(
    private stateService: StateService,
    private sessionService: SessionService,
    private playerService: PlayerService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const snapshot = this.stateService.getSnapshot();
    if (!snapshot.sessionCode) {
      this.router.navigate(['/']);
      return;
    }

    this.subs.add(
      this.stateService.getState().subscribe((s) => {
        this.state = s;
        const me = s.players.get(s.playerId);
        if (me) {
          this.isLocked = me.submissionStatus === 'locked';
          if (me.submissionStatus !== 'locked') {
            this.initiativeValue = me.initiative != null ? String(me.initiative) : '';
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get players(): Player[] {
    return Array.from(this.state?.players?.values() ?? []);
  }

  get currentPlayer(): Player | undefined {
    return this.state?.players?.get(this.state?.playerId);
  }

  get activeTurn() {
    return this.state?.turns?.[this.state?.currentTurnIndex] ?? null;
  }

  onInitiativeChange(value: string): void {
    this.initiativeValue = value;
    if (value) {
      this.playerService.submitInitiative(Number(value));
    }
  }

  onLock(initiative: number): void {
    this.isLocked = true;
    this.playerService.lockInitiative(initiative);
  }

  onUnlock(): void {
    this.isLocked = false;
    this.playerService.editInitiative();
  }

  onEndTurn(): void {
    this.playerService.endTurn();
    if (this.state.isHost) {
      this.sessionService.advanceTurn();
    }
  }

  onNewRound(): void {
    this.sessionService.startNewRound();
  }

  onStartGame(): void {
    this.sessionService.startGame();
  }

  confirmClose(): void {
    this.showCloseConfirm = true;
  }

  cancelClose(): void {
    this.showCloseConfirm = false;
  }

  closeSession(): void {
    if (this.state.isHost) {
      this.sessionService.closeSession();
    } else {
      this.sessionService.leaveSession();
    }
    this.router.navigate(['/']);
  }
}
