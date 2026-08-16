/**
 * Fixed-depth undo history over whole-tool state snapshots.
 *
 * Deliberate decisions:
 * - Depth is capped; the oldest snapshot drops past that.
 * - History lives in memory only. It survives switching tools but is cleared on
 *   reload — persisted field values come back, history does not. The UI
 *   disables the buttons when a stack is empty so this is visible rather than
 *   mysterious.
 */
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  readonly maxDepth: number;

  constructor(current: T, maxDepth = 50) {
    this.current = current;
    this.maxDepth = maxDepth;
  }

  get present(): T {
    return this.current;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get depth(): number {
    return this.past.length;
  }

  /**
   * Records `next` as a new undo point.
   *
   * Every bulk or destructive mutation must route through here *before*
   * applying — clearing a field, removing an item, shuffling, find/replace,
   * bulk import, reset, and the total-count control included. Forgetting to
   * wire up a new destructive control is the classic way this safety net
   * silently breaks.
   */
  commit(next: T): void {
    this.past.push(this.current);
    if (this.past.length > this.maxDepth) this.past.shift();
    this.future = [];
    this.current = next;
  }

  /**
   * Replaces the current state without creating an undo point. Used by the
   * debounced typing path after an initial `commit` has opened the edit, so a
   * burst of keystrokes collapses into one undo step.
   */
  replacePresent(next: T): void {
    this.current = next;
  }

  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return this.current;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
