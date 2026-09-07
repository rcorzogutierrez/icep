import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/i18n/i18n.service';

@Component({
  imports: [RouterOutlet],
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
