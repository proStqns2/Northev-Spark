// Angular 20 — atelier de collaboration Northev Spark (client du serveur Node).
// Lancement : npm install && npm start   → http://localhost:4300
// Le proxy /rt (voir proxy.conf.json) évite toute configuration CORS.

import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { WorkshopApp } from './app/workshop.component';

bootstrapApplication(WorkshopApp, {
  providers: [provideZonelessChangeDetection(), provideHttpClient()],
}).catch((err) => console.error(err));
