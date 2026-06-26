import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type {
  FirePoint,
  FlightPoint,
  QuakePoint,
} from '../models/earth-data.model';
import type { ViewportBounds } from '../utils/globe-viewport';
import type {
  ProcessPayload,
  ProcessResult,
} from '../../../workers/data-processor.worker';

@Injectable({ providedIn: 'root' })
export class GlobeDataWorkerService implements OnDestroy {
  private worker: Worker | null = null;
  private jobSeq = 0;
  private readonly results$ = new Subject<ProcessResult>();

  readonly processed$ = this.results$.asObservable();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../../workers/data-processor.worker', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = ({ data }: MessageEvent<ProcessResult>) => {
        this.results$.next(data);
      };
    }
    return this.worker;
  }

  enqueue(payload: Omit<ProcessPayload, never>): number {
    const id = ++this.jobSeq;
    this.ensureWorker().postMessage({ id, payload });
    return id;
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.results$.complete();
  }
}

export type { ProcessPayload, ViewportBounds, FlightPoint, FirePoint, QuakePoint };
