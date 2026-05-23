import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  mode: 'none' | 'host' | 'join' = 'none';
  playerName = '';
  joinCode = '';
  loading = false;
  errorMsg = '';

  constructor(
    private sessionService: SessionService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  selectHost(): void {
    this.mode = 'host';
    this.errorMsg = '';
  }

  selectJoin(): void {
    this.mode = 'join';
    this.errorMsg = '';
  }

  back(): void {
    this.mode = 'none';
    this.errorMsg = '';
  }

  async hostSession(): Promise<void> {
    if (!this.playerName.trim()) {
      this.errorMsg = 'Please enter your name.';
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    try {
      await this.notificationService.requestPermission();
      await this.sessionService.createSession(this.playerName.trim());
      this.router.navigate(['/session']);
    } catch (err) {
      this.errorMsg = 'Failed to create session. Check your connection and try again.';
    } finally {
      this.loading = false;
    }
  }

  async joinSession(): Promise<void> {
    if (!this.playerName.trim()) {
      this.errorMsg = 'Please enter your name.';
      return;
    }
    if (!this.joinCode.trim() || this.joinCode.length < 4) {
      this.errorMsg = 'Please enter the 4-character session code.';
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    try {
      await this.notificationService.requestPermission();
      await this.sessionService.joinSession(this.joinCode.trim(), this.playerName.trim());
      this.router.navigate(['/session']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join session.';
      this.errorMsg = msg;
    } finally {
      this.loading = false;
    }
  }
}
