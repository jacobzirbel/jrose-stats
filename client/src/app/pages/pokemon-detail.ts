import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';
import { SpineService } from '../spine.service';
import { STATUS_LABEL, titleCase, type PokemonDetail, type SpineVideo } from '../models';

/** Per-pokemon detail: status + linked videos, routing toward the workbench (1E). */
@Component({
  selector: 'app-pokemon-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <p><a routerLink="/">← The 151</a></p>

    @if (detail(); as d) {
      <h1>#{{ d.dex }} {{ name(d.name) }}</h1>
      <p>Status: <strong>{{ statusLabel[d.status] }}</strong></p>

      <h2>Videos</h2>
      @if (d.videos.length === 0) {
        <p>No videos linked yet.</p>
      } @else {
        <ul>
          @for (v of d.videos; track v.videoId + '-' + v.runId) {
            <li>
              <a [href]="videoUrl(v)" target="_blank" rel="noreferrer">
                {{ v.title ?? 'Video ' + v.videoId }}
              </a>
              @if (isMultiPart(d, v)) {
                <span>(part {{ v.partNo }})</span>
              }
              @if (auth.user()) {
                <a class="log-link" [routerLink]="['/log', v.videoId]">log</a>
              }
              <a class="record-link" [routerLink]="['/run', v.runId]">record</a>
            </li>
          }
        </ul>
      }

      @if (!auth.user()) {
        <p><a routerLink="/login">Log in to log this run</a></p>
      }
    } @else if (notFound()) {
      <p>Not found.</p>
    }
  `,
})
export class PokemonDetailPage {
  private readonly api = inject(SpineService);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  readonly detail = signal<PokemonDetail | null>(null);
  readonly notFound = signal(false);

  constructor() {
    const dex = Number(this.route.snapshot.paramMap.get('dex'));
    this.api.getPokemon(dex).subscribe({
      next: (d) => this.detail.set(d),
      error: () => this.notFound.set(true),
    });
  }

  protected name = titleCase;
  protected readonly statusLabel = STATUS_LABEL;

  protected videoUrl(v: SpineVideo): string {
    return v.url ?? `https://youtu.be/${v.youtubeId}`;
  }

  protected isMultiPart(d: PokemonDetail, v: SpineVideo): boolean {
    return d.videos.filter((x) => x.runId === v.runId).length > 1;
  }
}
