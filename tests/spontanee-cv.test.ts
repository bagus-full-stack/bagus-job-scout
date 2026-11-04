import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { removeSpontaneousCv, saveSpontaneousCv, spontaneousCvPath } from "@/lib/db/spontanee-cv";
import { DELETE, POST } from "@/app/api/offres/spontanees/cv/route";

const pdf = (extra = "") => Buffer.from(`%PDF-1.4 ${extra}`);

function upload(role: string, data: Buffer | string) {
  const body = new FormData();
  body.set("role", role);
  body.set("file", new File([new Uint8Array(Buffer.from(data))], "cv.pdf", { type: "application/pdf" }));
  return POST(new NextRequest("http://localhost/api/offres/spontanees/cv", { method: "POST", body }));
}

describe("CV importé par poste visé", () => {
  it("enregistre, retrouve sans tenir compte de la casse, remplace puis retire", () => {
    saveSpontaneousCv("Full Stack", pdf("v1"));
    const p = spontaneousCvPath("  full stack ")!;
    expect(fs.readFileSync(p, "utf8")).toContain("v1");
    expect(spontaneousCvPath("IA")).toBeNull();
    saveSpontaneousCv("Full Stack", pdf("v2"));
    expect(fs.readFileSync(spontaneousCvPath("Full Stack")!, "utf8")).toContain("v2");
    removeSpontaneousCv("Full Stack");
    expect(spontaneousCvPath("Full Stack")).toBeNull();
    expect(fs.existsSync(p)).toBe(false);
  });

  it("deux postes ont deux fichiers distincts", () => {
    saveSpontaneousCv("Full Stack", pdf("a"));
    saveSpontaneousCv("Ingénieur IA", pdf("b"));
    expect(spontaneousCvPath("Full Stack")).not.toBe(spontaneousCvPath("Ingénieur IA"));
    removeSpontaneousCv("Full Stack");
    removeSpontaneousCv("Ingénieur IA");
  });

  it("refuse ce qui n'est pas un PDF ou dépasse 5 Mo, sans rien enregistrer", () => {
    expect(() => saveSpontaneousCv("X", Buffer.from("MZ exe"))).toThrow(/PDF/);
    expect(() => saveSpontaneousCv("X", Buffer.concat([pdf(), Buffer.alloc(5 * 1024 * 1024)]))).toThrow(/volumineux/);
    expect(spontaneousCvPath("X")).toBeNull();
  });

  it("route : 200 pour un PDF, 400 sans poste, sans fichier ou pour un autre format ; DELETE retire", async () => {
    expect((await upload("DevOps", pdf())).status).toBe(200);
    expect(spontaneousCvPath("DevOps")).not.toBeNull();
    expect((await upload("DevOps", "pas un pdf")).status).toBe(400);
    expect((await upload("  ", pdf())).status).toBe(400);
    const noFile = new FormData();
    noFile.set("role", "DevOps");
    expect((await POST(new NextRequest("http://localhost/x", { method: "POST", body: noFile }))).status).toBe(400);
    expect((await DELETE(new NextRequest("http://localhost/x?role=DevOps", { method: "DELETE" }))).status).toBe(200);
    expect(spontaneousCvPath("DevOps")).toBeNull();
    expect((await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }))).status).toBe(400);
  });
});
