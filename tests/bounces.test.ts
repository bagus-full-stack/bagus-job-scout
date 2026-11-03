import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createCandidature, STATUS } from "@/lib/db/candidatures";
import { bouncedRecipients, imapHost, markBounced } from "@/lib/mail/bounces";

// Rapport d'état de remise (RFC 3464) tel que Gmail le renvoie, abrégé.
const gmailBounce = [
  "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
  "Subject: Delivery Status Notification (Failure)",
  "Content-Type: multipart/report; report-type=delivery-status",
  "",
  "** Address not found **",
  "",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; googlemail.com",
  "",
  "Final-Recipient: rfc822; Inconnu@Acme.fr",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 The email account does not exist",
].join("\r\n");

describe("retours de mail", () => {
  it("lit l'adresse refusée d'un rapport d'échec, en minuscules", () => {
    expect(bouncedRecipients(gmailBounce)).toEqual(["inconnu@acme.fr"]);
  });

  it("ignore un retard (delayed), un mail ordinaire et une adresse illisible", () => {
    expect(bouncedRecipients(gmailBounce.replace("Action: failed", "Action: delayed"))).toEqual([]);
    expect(bouncedRecipients("Bonjour,\n\nMerci pour votre candidature.")).toEqual([]);
    expect(bouncedRecipients("Final-Recipient: rfc822; pas-une-adresse\nAction: failed")).toEqual([]);
  });

  it("déduit le serveur IMAP du serveur SMTP", () => {
    expect(imapHost("smtp.gmail.com")).toBe("imap.gmail.com");
    expect(imapHost("smtp-mail.outlook.com")).toBe("imap-mail.outlook.com");
    expect(imapHost("ssl0.ovh.net")).toBe("ssl0.ovh.net");
  });

  it("passe en échec les seules candidatures envoyées à cette adresse, et note la raison", () => {
    const dead = createCandidature({ offre_id: null, ext_company: "Morte", ext_title: "Dev", contact: "Inconnu@acme.fr", status: "envoyee", notes: "Relancer" });
    const other = createCandidature({ offre_id: null, ext_company: "Autre", ext_title: "Dev", contact: "rh@autre.fr", status: "envoyee" });
    const answered = createCandidature({ offre_id: null, ext_company: "Répondue", ext_title: "Dev", contact: "inconnu@acme.fr", status: "entretien" });
    expect(markBounced(["inconnu@acme.fr"])).toBe(1);
    const get = (id: number) => getDb().prepare("SELECT status, notes FROM candidatures WHERE id = ?").get(id) as { status: string; notes: string };
    expect(get(dead)).toMatchObject({ status: "echec" });
    expect(get(dead).notes).toBe("Relancer\nAdresse introuvable (retour de la messagerie).");
    expect(get(other).status).toBe("envoyee");
    expect(get(answered).status).toBe("entretien");
    expect(STATUS).toContain("echec");
  });
});
