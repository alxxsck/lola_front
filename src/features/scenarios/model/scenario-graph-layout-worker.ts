import ELK from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';
import type { ScenarioGraphLayoutEngine } from './scenario-graph-auto-layout';

export function createScenarioGraphLayoutWorker(): ScenarioGraphLayoutEngine {
  return new ELK({
    algorithms: ['layered'],
    workerFactory: () => new ElkWorker(),
  });
}
