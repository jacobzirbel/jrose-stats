import { Routes } from '@angular/router';

import { SpineGrid } from './pages/spine-grid';
import { PokemonDetailPage } from './pages/pokemon-detail';
import { Login } from './pages/login';
import { Signup } from './pages/signup';
import { Workbench } from './pages/workbench';
import { SettingsPage } from './pages/settings';
import { RunRecord } from './pages/run-record';

export const routes: Routes = [
  { path: '', component: SpineGrid },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'pokemon/:dex', component: PokemonDetailPage },
  { path: 'log/:videoId', component: Workbench },
  { path: 'run/:runId', component: RunRecord },
  { path: 'settings', component: SettingsPage },
  { path: '**', redirectTo: '' },
];
