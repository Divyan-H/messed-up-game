/**
 * Binary min-heap backed by typed arrays with a fixed capacity.
 * Used as the A* / Dijkstra open set. Pre-allocated so searches allocate nothing.
 */
export class MinHeap {
  private readonly keys: Float64Array;
  private readonly vals: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }

  clear(): void {
    this.size = 0;
  }

  push(key: number, val: number): void {
    if (this.size >= this.keys.length) return; // capacity is sized for the grid; drop silently
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.keys[i] = this.keys[parent]!;
      this.vals[i] = this.vals[parent]!;
      i = parent;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }

  /** Removes and returns the value with the smallest key. */
  pop(): number {
    const top = this.vals[0]!;
    const n = --this.size;
    if (n > 0) {
      const key = this.keys[n]!;
      const val = this.vals[n]!;
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.keys[child + 1]! < this.keys[child]!) child++;
        if (this.keys[child]! >= key) break;
        this.keys[i] = this.keys[child]!;
        this.vals[i] = this.vals[child]!;
        i = child;
      }
      this.keys[i] = key;
      this.vals[i] = val;
    }
    return top;
  }
}
