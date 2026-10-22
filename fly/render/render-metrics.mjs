// These completion times overlap with parallel encoding; never add them to captureMs.
export function recordRenderStart(metrics, { resolvedConcurrency, parallelEncoding }) {
  metrics.resolvedConcurrency = resolvedConcurrency;
  metrics.parallelEncoding = parallelEncoding;
}
export function recordRenderProgress(metrics, { renderedDoneIn, encodedDoneIn }) {
  if (Number.isFinite(renderedDoneIn)) metrics.renderedDoneIn = renderedDoneIn;
  if (Number.isFinite(encodedDoneIn)) metrics.encodedDoneIn = encodedDoneIn;
}
