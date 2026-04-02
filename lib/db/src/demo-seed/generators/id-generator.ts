import { SeededRandom } from "./seed-random.js";

const DEMO_UUID_PREFIX = "de000000";

export class DeterministicIdGenerator {
  private counters: Map<string, number> = new Map();
  private rng: SeededRandom;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  generate(namespace: string): string {
    const count = (this.counters.get(namespace) ?? 0) + 1;
    this.counters.set(namespace, count);

    const nsHash = this.hashNamespace(namespace);
    const countHex = count.toString(16).padStart(4, "0");

    const r1 = Math.floor(this.rng.next() * 0xffffffff).toString(16).padStart(8, "0");
    const r2 = Math.floor(this.rng.next() * 0xffffffff).toString(16).padStart(8, "0");

    const seg4 = `a${countHex.slice(0, 3)}`;
    const seg5 = `${countHex.slice(3).padStart(1, "0")}${r1}${r2}`.slice(0, 12);

    return `${DEMO_UUID_PREFIX}-${nsHash}-4000-${seg4}-${seg5}`;
  }

  private hashNamespace(ns: string): string {
    let hash = 0;
    for (let i = 0; i < ns.length; i++) {
      hash = ((hash << 5) - hash + ns.charCodeAt(i)) & 0xffff;
    }
    return hash.toString(16).padStart(4, "0");
  }

  static isDemoId(uuid: string): boolean {
    return uuid.startsWith(DEMO_UUID_PREFIX);
  }
}
