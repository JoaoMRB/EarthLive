import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { map } from 'rxjs';
import type { EarthLayer } from '../../core/models/earth-data.model';
import { EarthDataService } from '../../core/services/earth-data.service';
import { LayerStateService } from '../../core/services/layer-state.service';

const LAYER_META: Record<
  EarthLayer,
  { accent: string; label: string; short: string; countKey?: keyof import('../../core/models/earth-data.model').EarthDataMeta }
> = {
  flights: { accent: 'flight', label: 'Flights', short: 'Air traffic', countKey: 'flightCount' },
  quakes: { accent: 'quake', label: 'Earthquakes', short: 'Seismic activity', countKey: 'quakeCount' },
  fires: { accent: 'fire', label: 'Fires', short: 'Heat detection', countKey: 'fireCount' },
  iss: { accent: 'iss', label: 'ISS', short: 'Space station' },
};

@Component({
  selector: 'app-layer-toggle',
  standalone: true,
  imports: [AsyncPipe, DatePipe],
  template: `
    <section class="layers-section">
      <h3 class="section-title">What to show</h3>
      <div class="layers-grid">
        @for (layer of layers; track layer) {
          <label class="layer-item" [class.layer-active]="(visibility$ | async)?.[layer]">
            <input
              type="checkbox"
              [checked]="(visibility$ | async)?.[layer]"
              (change)="toggle(layer)"
              class="layer-checkbox" role="switch" [attr.aria-label]="'Toggle ' + meta[layer].label + ' layer'"
            />
            <span class="layer-accent" [class]="'layer-accent ' + meta[layer].accent"></span>
            <span class="layer-copy">
              <strong class="layer-label">{{ meta[layer].label }}</strong>
              <span class="layer-hint">{{ meta[layer].short }}</span>
            </span>
            <span class="layer-count">{{ countFor(layer) | async }}</span>
          </label>
        }
      </div>

      <div class="meta-info">
        <p class="update-time">
          Last update
          <span class="time-value">{{ (lastUpdated$ | async) ? (lastUpdated$ | async | date: 'HH:mm:ss') : '--:--:--' }}</span>
        </p>
        @if (loading$ | async) {
          <p class="loading-indicator">
            <span class="pulse"></span>
            Loading data
          </p>
        }
        @if (error$ | async; as err) {
          <p class="error-message">{{ err }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .layers-section {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .section-title {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: rgba(191, 219, 254, 0.72);
    }

    .layers-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.65rem;
    }

    .layer-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.8rem 0.9rem;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.25s var(--ease-smooth);
    }

    .layer-item:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(148, 163, 184, 0.2);
      transform: translateY(-1px);
    }

    .layer-item.layer-active {
      background: linear-gradient(180deg, rgba(14, 116, 144, 0.18), rgba(15, 23, 42, 0.14));
      border-color: rgba(56, 189, 248, 0.26);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }

    .layer-checkbox {
      width: 0;
      height: 0;
      position: absolute;
      opacity: 0;
    }

    .layer-accent {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      flex-shrink: 0;
      box-shadow: 0 0 16px currentColor;
    }

    .layer-accent.flight {
      color: #38bdf8;
      background: currentColor;
    }

    .layer-accent.quake {
      color: #f97316;
      background: currentColor;
    }

    .layer-accent.fire {
      color: #fb7185;
      background: currentColor;
    }

    .layer-accent.iss {
      color: #a78bfa;
      background: currentColor;
    }

    .layer-copy {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 0.12rem;
    }

    .layer-label {
      font-size: 0.92rem;
      font-weight: 600;
      color: #f8fafc;
    }

    .layer-hint {
      color: rgba(148, 163, 184, 0.76);
      font-size: 0.74rem;
    }

    .layer-count {
      font-size: 0.78rem;
      color: #dbeafe;
      font-variant-numeric: tabular-nums;
      background: rgba(15, 23, 42, 0.72);
      padding: 0.35rem 0.55rem;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 999px;
    }

    .meta-info {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin-top: 0.35rem;
      padding-top: 0.8rem;
      border-top: 1px solid rgba(148, 163, 184, 0.08);
    }

    .update-time,
    .loading-indicator,
    .error-message {
      margin: 0;
      font-size: 0.75rem;
      color: rgba(148, 163, 184, 0.82);
    }

    .time-value {
      margin-left: 0.45rem;
      color: #7dd3fc;
      font-weight: 600;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: #34d399;
    }

    .pulse {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #34d399;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .error-message {
      color: #fca5a5;
    }
  `,
})
export class LayerToggleComponent {
  readonly earthData = inject(EarthDataService);
  readonly layerState = inject(LayerStateService);

  readonly layers: EarthLayer[] = ['flights', 'quakes', 'fires', 'iss'];
  readonly meta = LAYER_META;

  readonly visibility$ = this.layerState.visibility$;
  readonly lastUpdated$ = this.earthData.earthData$.pipe(map((d) => d?.timestamp));
  readonly loading$ = this.earthData.isLoading$;
  readonly error$ = this.earthData.error$;

  countFor(layer: EarthLayer) {
    return this.earthData.earthData$.pipe(
      map((d) => {
        if (!d) return layer === 'iss' ? 'WAIT' : '0';
        if (layer === 'iss') return d.iss ? 'LIVE' : 'OFF';
        return String(d.meta[LAYER_META[layer].countKey!]);
      }),
    );
  }

  toggle(layer: EarthLayer): void {
    this.layerState.toggle(layer);
  }
}
