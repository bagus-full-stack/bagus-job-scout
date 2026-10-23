import { describe, expect, it, vi } from "vitest";

const call = vi.fn();
vi.mock("@/lib/ai/llm", () => ({ callStructured: (...a: unknown[]) => call(...a) }));

import { chooseRoles } from "@/lib/ai/choose-role";

const profile = { summary: "s", skills: [{ name: "Java" }] } as never;
const OPTS = ["Développeur full stack", "Ingénieur IA"];

describe("chooseRoles", () => {
  it("écarte un poste hors liste et un numéro inconnu, garde le reste", async () => {
    call.mockResolvedValueOnce({
      input: {
        choices: [
          { n: 1, role: "Ingénieur IA", reason: "cœur IA" },
          { n: 2, role: "Pilote de ligne", reason: "hors liste" },
          { n: 9, role: "Ingénieur IA", reason: "numéro inconnu" },
        ],
      },
    });
    const got: unknown[] = [];
    const n = await chooseRoles(profile, OPTS, [{ id: 10, company: "A", email: "a@a.fr" }, { id: 11, company: "B", email: "b@b.fr" }], (c) => got.push(...c));
    expect(n).toBe(1);
    expect(got).toEqual([{ id: 10, role: "Ingénieur IA", reason: "cœur IA" }]);
  });

  it("découpe par lots de 40 et rend chaque lot dès qu'il est prêt", async () => {
    call.mockReset();
    call.mockResolvedValue({ input: { choices: [] } });
    const contacts = Array.from({ length: 85 }, (_, i) => ({ id: i + 1, company: `C${i}`, email: `c${i}@x.fr` }));
    const batches: number[] = [];
    await chooseRoles(profile, OPTS, contacts, () => batches.push(1));
    expect(call).toHaveBeenCalledTimes(3);
    expect(batches).toHaveLength(3);
  });
});
