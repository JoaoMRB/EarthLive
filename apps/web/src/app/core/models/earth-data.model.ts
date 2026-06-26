export interface FlightPoint {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  heading: number;
  country: string;
  speedAnomaly?: boolean;
}

export interface QuakePoint {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  magnitude: number;
  place: string;
  time: number;
  tsunami: boolean;
}

export interface FirePoint {
  lat: number;
  lng: number;
  brightness: number;
  confidence: string;
  datetime: string;
}

export interface ISSPosition {
  lat: number;
  lng: number;
  timestamp: number;
  crew?: { name: string; craft: string }[];
}

export interface EarthDataMeta {
  flightCount: number;
  quakeCount: number;
  fireCount: number;
  strongestQuake: QuakePoint | null;
}

export interface EarthData {
  flights: FlightPoint[];
  quakes: QuakePoint[];
  fires: FirePoint[];
  iss: ISSPosition | null;
  timestamp: number;
  meta: EarthDataMeta;
}

export type EarthLayer = 'flights' | 'quakes' | 'fires' | 'iss';

export type SelectablePoint =
  | { kind: 'flight'; data: FlightPoint }
  | { kind: 'quake'; data: QuakePoint }
  | { kind: 'fire'; data: FirePoint }
  | { kind: 'iss'; data: ISSPosition };
