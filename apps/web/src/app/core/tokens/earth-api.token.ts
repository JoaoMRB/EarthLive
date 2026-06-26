import { InjectionToken } from '@angular/core';

/** Base URL da API (`/api` no browser; URL absoluta no SSR). */
export const EARTH_API_BASE = new InjectionToken<string>('EARTH_API_BASE');
