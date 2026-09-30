import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutSaver, layoutSaveDelayMs } from "./layout-saver.ts";

function recordingSaver() {
  const saved: [string, unknown][] = [];
  const saver = new LayoutSaver((root, layout) => {
    saved.push([root, layout]);
    return Promise.resolve();
  });
  return { saver, saved };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LayoutSaver", () => {
  it("saves only the last of quick changes, once they stop", async () => {
    const { saver, saved } = recordingSaver();
    saver.changed("/studies", "first");
    await vi.advanceTimersByTimeAsync(layoutSaveDelayMs - 1);
    saver.changed("/studies", "second");
    await vi.advanceTimersByTimeAsync(layoutSaveDelayMs - 1);
    expect(saved).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toStrictEqual([["/studies", "second"]]);
  });

  it("saves a pending change at once when flushed, and not again later", async () => {
    const { saver, saved } = recordingSaver();
    saver.changed("/studies", "arranged");
    await saver.flush();
    expect(saved).toStrictEqual([["/studies", "arranged"]]);

    await saver.flush();
    await vi.advanceTimersByTimeAsync(layoutSaveDelayMs);
    expect(saved).toStrictEqual([["/studies", "arranged"]]);
  });

  it("never saves a discarded change", async () => {
    const { saver, saved } = recordingSaver();
    saver.changed("/studies", "half closed");
    saver.discard();
    await vi.advanceTimersByTimeAsync(layoutSaveDelayMs);
    await saver.flush();
    expect(saved).toStrictEqual([]);
  });
});
