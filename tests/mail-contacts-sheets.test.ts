import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sheetsToText } from "@/lib/excel/contacts";
import { parseContacts } from "@/lib/mail/contacts-file";

const read = (buf: Buffer) => parseContacts(sheetsToText(buf));

describe("contacts : Excel et CSV", () => {
  it("lit un classeur .xlsx, toutes feuilles, adresse dans n'importe quelle colonne", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Entreprise", "Email"], ["Acme SA", "rh@acme.fr"]]), "A");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["jobs@beta.io", "Beta"]]), "B");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(read(buf)).toEqual([
      { email: "rh@acme.fr", company: "Acme SA" },
      { email: "jobs@beta.io", company: "Beta" },
    ]);
  });
  it("lit un CSV français (séparateur ;, BOM)", () => {
    const csv = "﻿Email;Société\r\nrh@acme.fr;Acme SA\r\ncontact@beta.io;Beta\r\n";
    expect(read(Buffer.from(csv, "utf8"))).toEqual([
      { email: "rh@acme.fr", company: "Acme SA" },
      { email: "contact@beta.io", company: "Beta" },
    ]);
  });
  it("lit un CSV en UTF-16 (export « Unicode » d'Excel)", () => {
    const csv = "Email\tSociété\r\nrh@acme.fr\tAcme SA\r\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, "utf16le")]);
    expect(read(buf)).toEqual([{ email: "rh@acme.fr", company: "Acme SA" }]);
  });
  it("prend toutes les adresses d'une ligne", () => {
    expect(parseContacts("Acme;rh@acme.fr;ceo@acme.fr")).toEqual([
      { email: "rh@acme.fr", company: "Acme" },
      { email: "ceo@acme.fr", company: "Acme" },
    ]);
  });
});
