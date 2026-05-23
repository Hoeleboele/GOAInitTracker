import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Turn } from '../../../core/models/turn.model';

@Component({
  selector: 'app-turn-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './turn-display.component.html',
  styleUrl: './turn-display.component.scss',
})
export class TurnDisplayComponent {
  @Input() turns: Turn[] = [];
  @Input() currentTurnIndex = 0;
  @Input() currentPlayerId = '';
  @Input() isHost = false;
  @Input() gamePhase: 'turn-display' | 'round-complete' = 'turn-display';
  @Output() endTurn = new EventEmitter<void>();
  @Output() newRound = new EventEmitter<void>();

  get activeTurn(): Turn | null {
    return this.turns[this.currentTurnIndex] ?? null;
  }

  get isMyTurn(): boolean {
    return this.activeTurn?.playerId === this.currentPlayerId;
  }

  get canEndTurn(): boolean {
    return this.isMyTurn || this.isHost;
  }
}
