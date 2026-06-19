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
  templateUrl: './pokemon-detail.html',
  styleUrl: './pokemon-detail.css',
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

  /** A short human label for where the run's record sits. */
  protected stateLabel(v: SpineVideo): string {
    switch (v.recordState) {
      case 'live':
        return 'published';
      case 'reconciling':
        return 'reconciling';
      case 'escalated':
        return 'with an admin';
      default:
        return v.loggerCount >= 2 ? 'logging' : v.loggerCount === 1 ? 'needs a 2nd logger' : 'unlogged';
    }
  }

  /** An open logger slot anyone can claim to push the run toward publishing. */
  protected hasOpenSlot(v: SpineVideo): boolean {
    return v.recordState !== 'live' && v.loggerCount < 2;
  }
}
