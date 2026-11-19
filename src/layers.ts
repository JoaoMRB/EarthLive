/** Every layer the app can show, grouped by theme. */

export type Group = 'move' | 'nature' | 'climate' | 'night';

export type LayerId =
  | 'flights' | 'iss'
  | 'quakes' | 'fires' | 'volcanoes' | 'storms'
  | 'wind' | 'temp' | 'radar' | 'clouds' | 'satellite' | 'aerosol'
  | 'lights' | 'daynight';

export interface LayerDef {
  id: LayerId;
  group: Group;
  name: string;
  /**
   * Full-coverage background (temperature, satellite…). Only one can be on at
   * a time, otherwise they would hide each other.
   */
  field?: boolean;
  /** Imagery that exists per day and can be browsed / compared by date. */
  dated?: boolean;
}

export const GROUPS: { id: Group; name: string; icon: string }[] = [
  { id: 'move', name: 'Movimento', icon: 'M2 16l20-8-8 14-2-6-10 0z' },
  { id: 'nature', name: 'Natureza', icon: 'M3 20l6-11 4 6 3-4 5 9zM16 6a2 2 0 1 0 0-.01' },
  { id: 'climate', name: 'Clima', icon: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z' },
  { id: 'night', name: 'Noite', icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' },
];

export const LAYERS: LayerDef[] = [
  { id: 'flights', group: 'move', name: 'Voos' },
  { id: 'iss', group: 'move', name: 'ISS' },
  { id: 'quakes', group: 'nature', name: 'Sismos' },
  { id: 'fires', group: 'nature', name: 'Incêndios' },
  { id: 'volcanoes', group: 'nature', name: 'Vulcões' },
  { id: 'storms', group: 'nature', name: 'Tempestades' },
  { id: 'wind', group: 'climate', name: 'Vento', field: true },
  { id: 'temp', group: 'climate', name: 'Temperatura', field: true },
  { id: 'radar', group: 'climate', name: 'Chuva (radar)' },
  { id: 'clouds', group: 'climate', name: 'Nuvens' },
  { id: 'satellite', group: 'climate', name: 'Satélite', field: true, dated: true },
  { id: 'aerosol', group: 'climate', name: 'Poluição e fumo', field: true, dated: true },
  { id: 'lights', group: 'night', name: 'Luzes noturnas', field: true, dated: true },
  { id: 'daynight', group: 'night', name: 'Dia e noite' },
];

export const DEFAULT_ON: Record<LayerId, boolean> = {
  flights: true, iss: true, quakes: true, fires: true, volcanoes: true, storms: true,
  wind: false, temp: false, radar: false, clouds: false, satellite: false, aerosol: false,
  lights: false, daynight: true,
};

export const layerDef = (id: LayerId): LayerDef => LAYERS.find((l) => l.id === id)!;
