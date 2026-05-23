import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing.component';
import { SessionComponent } from './features/session/session.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'session', component: SessionComponent },
  { path: '**', redirectTo: '' },
];
