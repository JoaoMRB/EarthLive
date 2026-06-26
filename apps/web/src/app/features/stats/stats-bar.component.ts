import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { EarthDataService } from '../../core/services/earth-data.service';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe],
  template: `
    @if (stats$ | async; as s) {
      <footer class="stats-footer">
        <div class="stats-container">
          <div class="stats-intro">
            <span class="stats-kicker">Planet status</span>
            <strong class="stats-title">Live telemetry summary</strong>
          </div>

          <div class="stat-item">
            <span class="stat-label">Strongest quake</span>
            <span class="stat-value strong">{{ s.strongestQuake }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Flights</span>
            <span class="stat-value">{{ s.flightCount | number }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Fires</span>
            <span class="stat-value">{{ s.fireCount | number }} <small>recent</small></span>
          </div>

          <div class="stat-item">
            <span class="stat-label">ISS</span>
            <span class="stat-value">{{ s.issOver }}</span>
          </div>

          <div class="stat-sources">OpenSky + USGS + NASA FIRMS + Open Notify</div>
        </div>
      </footer>
    }
  `,
  styles: `
    .stats-footer {
      position: relative;
      z-index: 15;
      padding: 0.85rem 1rem 1rem;
    }

    .stats-container {
      display: grid;
      grid-template-columns: 1.3fr repeat(4, minmax(0, 1fr)) auto;
      gap: 0.75rem;
      align-items: stretch;
      padding: 0.85rem;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 1.35rem;
      background: rgba(3, 8, 18, 0.76);
      backdrop-filter: blur(20px);
      box-shadow:
        0 18px 70px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .stats-intro,
    .stat-item,
    .stat-sources {
      min-width: 0;
      padding: 0.7rem 0.8rem;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(148, 163, 184, 0.06);
    }

    .stats-kicker,
    .stat-label {
      display: block;
      margin-bottom: 0.3rem;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(148, 163, 184, 0.78);
    }

    .stats-title,
    .stat-value {
      color: #f8fafc;
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.35;
    }

    .stat-value.strong {
      color: #fde68a;
    }

    .stat-value small {
      color: rgba(148, 163, 184, 0.82);
      font-size: 0.72rem;
      font-weight: 500;
    }

    .stat-sources {
      display: flex;
      align-items: center;
      color: rgba(191, 219, 254, 0.74);
      font-size: 0.8rem;
      line-height: 1.5;
    }

    @media (max-width: 1100px) {
      .stats-container {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .stats-footer {
        padding: 0.7rem 0.7rem 4.2rem;
      }

      .stats-container {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class StatsBarComponent {
  readonly stats$ = inject(EarthDataService).earthData$.pipe(
    map((d) => {
      if (!d) {
        return {
          strongestQuake: '--',
          flightCount: 0,
          fireCount: 0,
          issOver: 'Waiting for lock',
        };
      }
      const q = d.meta.strongestQuake;
      const strongestQuake = q ? `M${q.magnitude}` : 'No major quake';
      const issOver = d.iss
        ? `${Math.abs(d.iss.lat).toFixed(1)}${d.iss.lat >= 0 ? 'N' : 'S'} ${Math.abs(d.iss.lng).toFixed(1)}${d.iss.lng >= 0 ? 'E' : 'W'}`
        : 'Waiting for lock';
      return {
        strongestQuake,
        flightCount: d.meta.flightCount,
        fireCount: d.meta.fireCount,
        issOver,
      };
    }),
  );
}
