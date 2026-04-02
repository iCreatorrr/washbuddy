export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  pickWeighted<T extends { weight: number }>(arr: T[]): T {
    const totalWeight = arr.reduce((sum, item) => sum + item.weight, 0);
    let r = this.next() * totalWeight;
    for (const item of arr) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return arr[arr.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  sample<T>(arr: T[], count: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(count, arr.length));
  }

  pickFromDistribution(distribution: Record<string, number>): string {
    const entries = Object.entries(distribution);
    let r = this.next();
    for (const [key, weight] of entries) {
      r -= weight;
      if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  fork(label: string): SeededRandom {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = ((hash << 5) - hash + label.charCodeAt(i)) & 0xffffffff;
    }
    return new SeededRandom(this.state ^ hash);
  }
}
