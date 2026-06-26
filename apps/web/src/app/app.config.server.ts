import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';
import { EARTH_API_BASE } from './core/tokens/earth-api.token';
import { provideEarthDataSsrInitializer } from './core/providers/earth-data-ssr.initializer';

function serverApiBase(): string {
  const root = (process.env['EARTHLIVE_API_URL'] ?? 'http://localhost:3000')
    .replace(/\/$/, '');
  return `${root}/api`;
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: EARTH_API_BASE, useFactory: serverApiBase },
    provideEarthDataSsrInitializer(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
