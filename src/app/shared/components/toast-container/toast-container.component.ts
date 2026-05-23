import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService, Toast } from '../../../core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toasts; track toast.id) {
        <div class="toast" [class]="'toast-' + toast.type">
          {{ toast.message }}
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      width: 90%;
      max-width: 360px;
    }
    .toast {
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      text-align: center;
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .toast-info { background: rgba(33, 150, 243, 0.9); }
    .toast-success { background: rgba(76, 175, 80, 0.9); }
    .toast-warning { background: rgba(255, 152, 0, 0.9); }
  `],
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private sub!: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.sub = this.notificationService.toasts$.subscribe((toast) => {
      this.toasts.push(toast);
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== toast.id);
      }, toast.duration);
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
