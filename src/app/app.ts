import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/i18n/i18n.service';
import { ToastContainer } from './shared/toast/toast-container';

@Component({
  imports: [RouterOutlet, ToastContainer],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly i18n = inject(I18nService);

  constructor() {
    effect(() => {
      document.documentElement.lang = this.i18n.locale();
    });
  }
}
