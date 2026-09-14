import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { SubjectResource } from '../../../core/subjects/subject-resources.model';
import { IconBox, IconHardDrive, IconLink, IconX } from '../../icons/icons';

/**
 * Tarjeta de un recurso externo (Drive/Dropbox/link) — ver
 * `detectResourceProvider` en subject-resources.model.ts para cómo se arma
 * `provider`/`driveFileId`. Drive con `driveFileId` muestra la miniatura
 * pública real (`drive.google.com/thumbnail`, sin backend); si esa imagen
 * falla (archivo no compartido públicamente, o link a una carpeta) cae al
 * ícono genérico igual que Dropbox/link, vía `thumbnailFailed`.
 */
@Component({
  selector: 'app-resource-card',
  standalone: true,
  imports: [IconBox, IconHardDrive, IconLink, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <a
        [href]="resource().url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex flex-1 flex-col"
      >
        <div class="flex h-28 items-center justify-center bg-slate-50">
          @if (resource().provider === 'drive' && resource().driveFileId && !thumbnailFailed()) {
            <img
              [src]="thumbnailUrl()"
              alt=""
              class="h-full w-full object-cover"
              (error)="thumbnailFailed.set(true)"
            />
          } @else if (resource().provider === 'drive') {
            <svg lucideHardDrive [size]="28" class="text-text-muted" aria-hidden="true"></svg>
          } @else if (resource().provider === 'dropbox') {
            <svg lucideBox [size]="28" class="text-text-muted" aria-hidden="true"></svg>
          } @else {
            <svg lucideLink [size]="28" class="text-text-muted" aria-hidden="true"></svg>
          }
        </div>
        <div class="p-3">
          <p class="line-clamp-2 text-sm font-medium text-text">{{ resource().title }}</p>
        </div>
      </a>
      @if (showRemove()) {
        <button
          type="button"
          class="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-surface/90 text-text-muted shadow-sm hover:bg-slate-100 hover:text-text"
          [attr.aria-label]="removeLabel()"
          (click)="remove.emit()"
        >
          <svg lucideX [size]="14" aria-hidden="true"></svg>
        </button>
      }
    </div>
  `,
})
export class ResourceCard {
  readonly resource = input.required<SubjectResource>();
  readonly showRemove = input(false);
  readonly removeLabel = input('');

  readonly remove = output<void>();

  protected readonly thumbnailFailed = signal(false);
  protected readonly thumbnailUrl = computed(
    () => `https://drive.google.com/thumbnail?id=${this.resource().driveFileId}&sz=w400`,
  );
}
