/** One capture at a time. Preparation and delivery stay on a separate lane. */
export function createLanes() {
  const tails = { light: Promise.resolve(), heavy: Promise.resolve() };
  return (lane, task) => {
    const next = tails[lane].then(task);
    tails[lane] = next.catch(() => {});
    return next;
  };
}

export const laneFor = job => job.operation === 'render' ? 'heavy' : 'light';
