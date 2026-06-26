/** Contrato partilhado API ↔ Angular — manter em sync com o README */

export interface FlightPoint {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  heading: number;
  country: string;
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

export interface ISSCrewMember {
  name: string;
  craft: string;
}

export interface ISSPosition {
  lat: number;
  lng: number;
  timestamp: number;
  crew?: ISSCrewMember[];
  numberInSpace?: number;
}

export interface EarthDataMeta {
  flightCount: number;
  quakeCount: number;
  fireCount: number;
  strongestQuake: QuakePoint | null;
}

export interface EarthDataResponse {
  flights: FlightPoint[];
  quakes: QuakePoint[];
  fires: FirePoint[];
  timestamp: number;
  meta: EarthDataMeta;
}

export interface HealthResponse {
  status: 'ok';
  service: 'earthlive-api';
  timestamp: number;
}
