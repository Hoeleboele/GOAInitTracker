import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-session-code-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-code-display.component.html',
  styleUrl: './session-code-display.component.scss',
})
export class SessionCodeDisplayComponent {
  @Input() code = '';

  copied = false;

  copyCode(): void {
    navigator.clipboard.writeText(this.code).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }
}
