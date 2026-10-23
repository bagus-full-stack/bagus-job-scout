import { describe, expect, it, vi } from "vitest";
import { runAuto, type AutoItem, type AutoJob } from "@/lib/auto/apply";

const job = (n: number): AutoJob => ({
  kind: "spontanees",
  running: true,
  stopping: false,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  stopReason: null,
  items: Array.from({ length: n }, (_, i): AutoItem => ({ id: i + 1, kind: "spontanees", company: `Acme ${i + 1}`, email: `rh${i + 1}@acme.test`, state: "waiting" })),
});

const mk = (apply: (i: AutoItem) => Promise<void>, over: Partial<Parameters<typeof runAuto>[1]> = {}) => {
  const sleeps: number[] = [];
  const recorded: [number, string | null][] = [];
  return {
    sleeps,
    recorded,
    deps: { apply, sleep: async (ms: number) => void sleeps.push(ms), record: (id: number, e: string | null) => void recorded.push([id, e]), pause: () => 3000, ...over },
  };
};

describe("lot de candidatures automatiques", () => {
  it("envoie chaque contact, fait une pause entre deux envois (pas avant le premier) et efface les échecs passés", async () => {
    const j = job(3);
    const { deps, sleeps, recorded } = mk(async () => {});
    await runAuto(j, deps);
    expect(j.items.map((i) => i.state)).toEqual(["sent", "sent", "sent"]);
    expect(sleeps).toHaveLength(6); // 2 pauses de 3 s, par tranches d'1 s
    expect(recorded).toEqual([[1, null], [2, null], [3, null]]);
    expect(j.running).toBe(false);
    expect(j.finishedAt).not.toBeNull();
    expect(j.stopReason).toBeNull();
  });

  it("un échec est noté sur le contact et le lot continue", async () => {
    const j = job(3);
    const { deps, recorded } = mk(async (i) => {
      if (i.id === 2) throw new Error("boîte pleine");
    });
    await runAuto(j, deps);
    expect(j.items.map((i) => i.state)).toEqual(["sent", "failed", "sent"]);
    expect(j.items[1].error).toBe("boîte pleine");
    expect(recorded).toContainEqual([2, "boîte pleine"]);
  });

  it("s'arrête après 3 échecs de suite", async () => {
    const j = job(6);
    const apply = vi.fn(async () => {
      throw new Error("IA indisponible");
    });
    await runAuto(j, mk(apply).deps);
    expect(apply).toHaveBeenCalledTimes(3);
    expect(j.items.slice(3).every((i) => i.state === "waiting")).toBe(true);
    expect(j.stopReason).toMatch(/3 échecs de suite/);
  });

  it("un succès remet le compteur d'échecs à zéro", async () => {
    const j = job(6);
    const fail = new Set([1, 2, 4, 5]);
    await runAuto(j, mk(async (i) => { if (fail.has(i.id)) throw new Error("x"); }).deps);
    expect(j.items.map((i) => i.state)).toEqual(["failed", "failed", "sent", "failed", "failed", "sent"]);
    expect(j.stopReason).toBeNull();
  });

  it("s'arrête tout de suite si la messagerie refuse l'identifiant", async () => {
    const j = job(4);
    const apply = vi.fn(async () => {
      throw Object.assign(new Error("Invalid login"), { code: "EAUTH" });
    });
    await runAuto(j, mk(apply).deps);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(j.stopReason).toMatch(/refuse l'identifiant/);
  });

  it("« Arrêter » interrompt la pause et les envois suivants", async () => {
    const j = job(4);
    const { deps } = mk(async () => {}, {
      sleep: async () => {
        j.stopping = true; // demandé pendant la pause
      },
    });
    await runAuto(j, deps);
    expect(j.items.map((i) => i.state)).toEqual(["sent", "waiting", "waiting", "waiting"]);
    expect(j.stopReason).toBe("Arrêté à votre demande.");
    expect(j.running).toBe(false);
  });
});
