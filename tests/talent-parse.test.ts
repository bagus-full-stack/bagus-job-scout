import { describe, expect, it } from "vitest";
import { parseSearchPage } from "@/lib/scrapers/talent";

const domain = { host: "fr.talent.com", country: "France", codes: ["FR"] };

// Extrait du markup Talent.com observé en octobre 2026.
const HTML = `<div data-job-id="8f84d213df2f" data-new-id="642435214400292313" data-rank="1"><article class="JobCard_card__X"><header><div class="JobCard_heading__7"><h2 class="JobCard_title__X">DEVELOPPEUR CONFIRME (F/H)</h2><address><span class="JobCard_company__N">Ministère de la Justice</span><span aria-hidden="true">•</span><span class="JobCard_location__n">Paris, Île-de-France, France</span></address></div></header><div class="JobCard_body__Q"><div class="style_tagsJob__3"><div><span>Temps plein</span></div><div><span>Quick Apply</span></div></div><p class="JobCard_snippet__r">Le service du numérique recrute : rejoignez-le ! Le ministère de la Justice s'est engagé...<!-- --> <a href="/view?id=642435214400292313">Voir plus</a></p></div></article></div>`;

describe("talent.com parseSearchPage", () => {
  it("lit le markup actuel (data-job-id, classes JobCard_*)", () => {
    const [c] = parseSearchPage(HTML, domain);
    expect(c).toMatchObject({
      id: "8f84d213df2f",
      title: "DEVELOPPEUR CONFIRME (F/H)",
      company: "Ministère de la Justice",
      city: "Paris",
      contract: "Temps plein",
      url: "https://fr.talent.com/view?id=642435214400292313",
    });
    expect(c.snippet.endsWith("...")).toBe(true);
  });
});
