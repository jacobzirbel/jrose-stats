import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import type { PokemonDetail, SpineCell } from './models';

/** Read access to the public spine (the 151-grid) and per-pokemon detail. */
@Injectable({ providedIn: 'root' })
export class SpineService {
  private readonly http = inject(HttpClient);

  getSpine(sort: 'dex' | 'playlist') {
    return this.http.get<{ sort: string; cells: SpineCell[] }>(`/api/spine?sort=${sort}`);
  }

  getPokemon(dex: number) {
    return this.http.get<PokemonDetail>(`/api/pokemon/${dex}`);
  }
}
