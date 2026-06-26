import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { EarthLayer, SelectablePoint } from '../models/earth-data.model';

export interface LayerVisibility {
  flights: boolean;
  quakes: boolean;
  fires: boolean;
  iss: boolean;
}

export type LayerPreset = 'all' | 'flights' | 'disasters' | 'space';

const DEFAULT_LAYERS: LayerVisibility = {
  flights: true,
  quakes: true,
  fires: true,
  iss: true,
};

@Injectable({ providedIn: 'root' })
export class LayerStateService {
  private readonly layers$ = new BehaviorSubject<LayerVisibility>({
    ...DEFAULT_LAYERS,
  });
  private readonly selectedSubject$ =
    new BehaviorSubject<SelectablePoint | null>(null);

  readonly visibility$ = this.layers$.asObservable();
  readonly selected$ = this.selectedSubject$.asObservable();

  toggle(layer: EarthLayer): void {
    const current = this.layers$.value;
    this.layers$.next({ ...current, [layer]: !current[layer] });
  }

  isEnabled(layer: EarthLayer): boolean {
    return this.layers$.value[layer];
  }

  setVisibility(visibility: LayerVisibility): void {
    this.layers$.next({ ...visibility });
  }

  applyPreset(preset: LayerPreset): void {
    switch (preset) {
      case 'flights':
        this.setVisibility({
          flights: true,
          quakes: false,
          fires: false,
          iss: false,
        });
        break;
      case 'disasters':
        this.setVisibility({
          flights: false,
          quakes: true,
          fires: true,
          iss: false,
        });
        break;
      case 'space':
        this.setVisibility({
          flights: false,
          quakes: false,
          fires: false,
          iss: true,
        });
        break;
      default:
        this.setVisibility(DEFAULT_LAYERS);
        break;
    }
  }

  select(point: SelectablePoint | null): void {
    this.selectedSubject$.next(point);
  }
}
