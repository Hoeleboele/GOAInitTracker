import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _toasts$ = new Subject<Toast>();
  private permissionGranted = false;

  get toasts$(): Observable<Toast> {
    return this._toasts$.asObservable();
  }

  async requestPermission(): Promise<void> {
    if ('Notification' in window && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      this.permissionGranted = result === 'granted';
    } else if (Notification.permission === 'granted') {
      this.permissionGranted = true;
    }
  }

  notifyTurnStart(playerName: string): void {
    this.toast(`It's ${playerName}'s turn!`, 'info');
    this.nativeNotify(`Guards of Atlantis II`, `It's ${playerName}'s turn!`);
  }

  notifyRoundComplete(): void {
    this.toast('Round complete! Starting new round...', 'success');
  }

  notifyPlayerJoined(playerName: string): void {
    this.toast(`${playerName} joined the session`, 'info');
  }

  notifyPlayerDisconnected(playerName: string): void {
    this.toast(`${playerName} disconnected`, 'warning');
  }

  notifySessionClosed(): void {
    this.toast('The host has closed the session', 'warning');
  }

  private toast(message: string, type: Toast['type'], duration = 3000): void {
    const id = Math.random().toString(36).substring(2, 9);
    this._toasts$.next({ id, message, type, duration });
  }

  private nativeNotify(title: string, body: string): void {
    if (this.permissionGranted && 'Notification' in window) {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }
}
