import { parentPort, workerData } from 'node:worker_threads';
import {
  mergeGrobidMetadata,
  type GrobidHeaderInput,
} from './article-pdf-grobid.js';

const { metadata, evidence, xml } = workerData as GrobidHeaderInput;
parentPort?.postMessage(mergeGrobidMetadata(metadata, evidence, xml));
