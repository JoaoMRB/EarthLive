import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { LayerStateService } from '../../core/services/layer-state.service';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe],
  template: `
    <section class="info-section">
      <h3 class="section-title">About this</h3>
      @if (selected$ | async; as sel) {
        <div class="info-content">
          @switch (sel.kind) {
            @case ('flight') {
              <div class="info-header">
                <span class="type-badge flight">Flight</span>
                <span class="title">{{ sel.data.callsign || sel.data.id }}</span>
              </div>
              <div class="info-grid">
                <div class="info-row">
                  <span class="label">Country</span>
                  <span class="value">{{ sel.data.country || 'Unknown' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Altitude</span>
                  <span class="value">{{ sel.data.alt | number: '1.0-0' }} m</span>
                </div>
                <div class="info-row">
                  <span class="label">Speed</span>
                  <span class="value" [class.speed-anomaly]="sel.data.speedAnomaly">
                    {{ sel.data.speed }} km/h
                    @if (sel.data.speedAnomaly) {
                      <span class="anomaly-indicator">⚠️ Data anomaly</span>
                    }
                  </span>
                </div>
                <div class="info-row">
                  <span class="label">Heading</span>
                  <span class="value">{{ sel.data.heading }} deg</span>
                </div>
              </div>
              @if (sel.data.speedAnomaly) {
                <p class="hint warning">
                  ⚠️ This speed exceeds typical aircraft limits. This is likely an OpenSky API data corruption from ADS-B transmission errors or GPS timing sync issues.
                </p>
              } @else {
                <p class="hint">OpenSky free tier does not expose route origin or destination.</p>
              }
            }
            @case ('quake') {
              <div class="info-header">
                <span class="type-badge quake">Quake</span>
                <span class="title">Magnitude {{ sel.data.magnitude }}</span>
              </div>
              <p class="location">{{ sel.data.place }}</p>
              <div class="info-grid">
                <div class="info-row">
                  <span class="label">Depth</span>
                  <span class="value">{{ sel.data.depth }} km</span>
                </div>
                <div class="info-row">
                  <span class="label">Tsunami</span>
                  <span class="value" [class.alert]="sel.data.tsunami">
                    {{ sel.data.tsunami ? 'Possible' : 'No' }}
                  </span>
                </div>
              </div>
            }
            @case ('fire') {
              <div class="info-header">
                <span class="type-badge fire">Fire</span>
                <span class="title">NASA FIRMS cluster</span>
              </div>
              <div class="info-grid">
                <div class="info-row">
                  <span class="label">Brightness</span>
                  <span class="value">{{ sel.data.brightness | number: '1.0-0' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Confidence</span>
                  <span class="value">{{ sel.data.confidence }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Detected</span>
                  <span class="value">{{ sel.data.datetime || 'Pending feed data' }}</span>
                </div>
              </div>
              <p class="hint">FIRMS is delayed by satellite capture and processing. Treat this as recent history, not instant live video.</p>
            }
            @case ('iss') {
              <div class="info-header">
                <span class="type-badge iss">ISS</span>
                <span class="title">International Space Station</span>
              </div>
              <div class="info-grid">
                <div class="info-row">
                  <span class="label">Latitude</span>
                  <span class="value">{{ sel.data.lat | number: '1.2-2' }} deg</span>
                </div>
                <div class="info-row">
                  <span class="label">Longitude</span>
                  <span class="value">{{ sel.data.lng | number: '1.2-2' }} deg</span>
                </div>
                @if (sel.data.crew?.length) {
                  <div class="info-row">
                    <span class="label">Crew</span>
                    <span class="value">{{ sel.data.crew!.length }} onboard</span>
                  </div>
                }
              </div>
              <p class="hint">The highlighted path projects the next orbital segment around the planet.</p>
            }
          }
        </div>
      } @else {
        <div class="empty-state">
          <p class="empty-title">Select something on the globe</p>
          <p class="empty-text">Tap a flight, earthquake, fire or the ISS to see details here.</p>
        </div>
      }
    </section>
  `,
  styles: `
    .info-section {
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

    .info-content {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .info-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem;
    }

    .type-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.38rem 0.7rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;

      &.flight {
        background: rgba(56, 189, 248, 0.14);
        color: #7dd3fc;
      }

      &.quake {
        background: rgba(249, 115, 22, 0.14);
        color: #fdba74;
      }

      &.fire {
        background: rgba(244, 63, 94, 0.14);
        color: #fda4af;
      }

      &.iss {
        background: rgba(167, 139, 250, 0.14);
        color: #c4b5fd;
      }
    }

    .title {
      font-size: 1rem;
      font-weight: 600;
      color: #f8fafc;
      flex: 1;
      word-break: break-word;
    }

    .location {
      margin: 0;
      color: rgba(226, 232, 240, 0.72);
      line-height: 1.5;
    }

    .info-grid {
      display: grid;
      gap: 0.6rem;
    }

    .info-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.85rem;
      align-items: center;
      padding: 0.75rem 0.85rem;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 12px;
    }

    .label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(148, 163, 184, 0.82);
    }

    .value {
      font-size: 0.86rem;
      font-weight: 600;
      color: #f8fafc;
      text-align: right;
      word-break: break-word;

      &.alert {
        color: #fde68a;
      }
    }

    .hint {
      margin: 0;
      padding: 0.85rem 0.9rem;
      font-size: 0.78rem;
      line-height: 1.5;
      color: rgba(203, 213, 225, 0.78);
      background: rgba(15, 23, 42, 0.68);
      border: 1px solid rgba(148, 163, 184, 0.08);
      border-radius: 12px;
    }

    .empty-state {
      display: grid;
      gap: 0.45rem;
      padding: 1rem 0;
    }

    .empty-title {
      margin: 0;
      color: #f8fafc;
      font-size: 1rem;
      font-weight: 600;
    }

    .empty-text {
      margin: 0;
      color: rgba(203, 213, 225, 0.72);
      line-height: 1.55;
      font-size: 0.88rem;
    }

    .speed-anomaly {
      color: #fda4af;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      align-items: flex-end;
    }

    .anomaly-indicator {
      font-size: 0.68rem;
      font-weight: 500;
      color: #fb7185;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .hint.warning {
      background: rgba(251, 113, 133, 0.08);
      border-color: rgba(251, 113, 133, 0.2);
      color: #fda4af;
    }
  `,
})
export class InfoPanelComponent {
  readonly selected$ = inject(LayerStateService).selected$;
}
