export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function samplePoisson(lambda: number, random: () => number) {
  if (lambda <= 0) {
    return 0;
  }

  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  while (product > limit) {
    count += 1;
    product *= random();
  }

  return count - 1;
}

export function weightedChoice<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const target = random() * total;
  let cursor = 0;

  for (const item of items) {
    cursor += item.weight;
    if (target <= cursor) {
      return item;
    }
  }

  return items[items.length - 1];
}
