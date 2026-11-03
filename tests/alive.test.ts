import { describe, expect, it } from "vitest";
import { isClosedPage, isPrivateHost } from "@/lib/offres/alive";

describe("isClosedPage", () => {
  it("repère une annonce clôturée, en français et en anglais", () => {
    for (const html of [
      "<h1>Cette offre n'est plus disponible</h1>",
      "<p>Ce poste est pourvu.</p>",
      "<p>L’annonce a expiré</p>",
      "<div>Sorry, this job has expired</div>",
      "<p>The position has been filled.</p>",
    ]) expect(isClosedPage(html), html).toBe(true);
  });

  it("ne confond pas une annonce ouverte avec une mention voisine", () => {
    for (const html of [
      "<p>Cette offre expire le 30 novembre 2026.</p>",
      "<aside><h3>Postes pourvus récemment</h3></aside>",
      '<script>var msg = "offre n\'est plus disponible";</script><p>Postulez maintenant</p>',
    ]) expect(isClosedPage(html), html).toBe(false);
  });
});

describe("isPrivateHost", () => {
  it("refuse le réseau local et les métadonnées du cloud, accepte un site public", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.2", "172.16.0.1", "172.31.9.9", "169.254.169.254", "[::1]", "nas.local"]) expect(isPrivateHost(h), h).toBe(true);
    for (const h of ["www.welcometothejungle.com", "172.32.0.1", "example.org"]) expect(isPrivateHost(h), h).toBe(false);
  });
});
