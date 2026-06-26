import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  viewChild,
} from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { EarthDataService } from '../../core/services/earth-data.service';
import { GlobeManagerService } from '../../core/services/globe-manager.service';
import { LayerStateService } from '../../core/services/layer-state.service';

@Component({
  selector: 'app-globe',
  standalone: true,
  template: `<div class="globe-host" #host></div>`,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-height: 0;
    }
    .globe-host {
      width: 100%;
      height: 100%;
    }
  `,
})
export class GlobeComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly platformId = inject(PLATFORM_ID);
  private readonly earthData = inject(EarthDataService);
  private readonly globeManager = inject(GlobeManagerService);
  private readonly layerState = inject(LayerStateService);
  private readonly subs = new Subscription();

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const el = this.host().nativeElement;
    this.globeManager.bindSelection((point) =>
      this.layerState.select(point),
    );
    await this.globeManager.mount(el);

    this.subs.add(
      combineLatest([
        this.earthData.earthData$,
        this.layerState.visibility$,
      ]).subscribe(([data, layers]) => {
        this.globeManager.update(data, layers);
      }),
    );

    this.subs.add(
      this.layerState.selected$.subscribe((selected) => {
        this.globeManager.setSelection(selected);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.globeManager.destroy();
  }
}
