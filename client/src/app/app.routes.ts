import { Routes } from '@angular/router';

import { SpineGrid } from './pages/spine-grid';
import { PokemonDetailPage } from './pages/pokemon-detail';
import { Login } from './pages/login';
import { Signup } from './pages/signup';

export const routes: Routes = [
  { path: '', component: SpineGrid },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'pokemon/:dex', component: PokemonDetailPage },
  { path: '**', redirectTo: '' },
];
