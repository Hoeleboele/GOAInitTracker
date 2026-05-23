import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-number-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './number-pad.component.html',
  styleUrl: './number-pad.component.scss',
})
export class NumberPadComponent {
  @Input() value = '';
  @Input() isLocked = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() locked = new EventEmitter<number>();
  @Output() unlocked = new EventEmitter<void>();

  readonly digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  pressDigit(digit: string): void {
    if (this.isLocked) return;
    if (this.value === '0') {
      this.valueChange.emit(digit);
    } else if (this.value.length < 2) {
      this.valueChange.emit(this.value + digit);
    }
  }

  backspace(): void {
    if (this.isLocked) return;
    this.valueChange.emit(this.value.slice(0, -1));
  }

  lock(): void {
    if (!this.value) return;
    this.locked.emit(Number(this.value));
  }

  unlock(): void {
    this.unlocked.emit();
  }

  get numericValue(): number {
    return Number(this.value) || 0;
  }
}
