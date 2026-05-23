import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player } from '../../../core/models/player.model';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-list.component.html',
  styleUrl: './player-list.component.scss',
})
export class PlayerListComponent {
  @Input() players: Player[] = [];
  @Input() currentPlayerId = '';

  statusLabel(status: Player['submissionStatus']): string {
    switch (status) {
      case 'not-submitted': return 'Not submitted';
      case 'submitted': return 'Submitted';
      case 'locked': return 'Locked ✓';
    }
  }
}
