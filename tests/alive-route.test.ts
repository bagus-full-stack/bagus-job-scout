import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let url = "https://jobs.example/offre/1";
vi.mock("@/lib/db/offres", () => ({ getOffre: () => ({ id: 1, url }) }));

const { GET } = await import("@/app/api/offres/[id]/alive/route");
const state = async () =>
  (await (await GET(new NextRequest("http://localhost/api/offres/1/alive"), { params: Promise.resolve({ id: "1" }) })).json()).state;

const reply = (status: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status, headers });

afterEach(() => vi.unstubAllGlobals());

describe("route de vivacité", () => {
  it("404 → closed, page normale → open, mention de clôture → closed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(404)));
    expect(await state()).toBe("closed");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, "<p>Postulez</p>")));
    expect(await state()).toBe("open");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, "<h1>Cette offre n'est plus disponible</h1>")));
    expect(await state()).toBe("closed");
  });

  it("ne suit pas une redirection vers le réseau local", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(302, "", { location: "http://127.0.0.1:3000/api/profile" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await state()).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("n'interroge pas une adresse locale donnée d'emblée", async () => {
    url = "http://[::ffff:7f00:1]/";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await state()).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
    url = "https://jobs.example/offre/1";
  });
});
