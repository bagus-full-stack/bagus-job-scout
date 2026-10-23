import "server-only";
import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Font, Link } from "@react-pdf/renderer";
import type { GeneratedCV } from "@/lib/ai/generate-cv";
import {
  typographyFor,
  formatLanguage,
  displayUrl,
  capitalizeFirst,
  expDateRange,
  eduYearRange,
  cleanJobTitle,
} from "@/lib/text/typography";
import { LABELS, letterDateLine, type DocLang } from "@/lib/text/lang";
import { splitBold } from "@/lib/text/rich";

// Pas de césure automatique : react-pdf coupe les mots avec des règles
// anglaises (« corre-spond », « ar-tisans »), inacceptable dans une lettre.
Font.registerHyphenationCallback((word) => [word]);

// =============================================================
// CV — mise en page calquée sur le CV LaTeX de référence : serif, marges serrées,
// titres de section à filet, mots-clés en gras (`**…**`), dates à droite, liens
// GitHub. Libellés fixes : LABELS[language].
// =============================================================

// Croissant, par pas de 0,25 pt : la plus grande taille qui tient laisse le moins de vide.
export const CV_FONT_SIZES = Array.from({ length: 14 }, (_, i) => 9 + i * 0.25);

const makeStyles = (fs: number) =>
  StyleSheet.create({
    page: {
      paddingHorizontal: 28,
      paddingVertical: 22,
      fontFamily: "Times-Roman",
      fontSize: fs,
      lineHeight: 1.18,
      color: "#000000",
    },
    name: { textAlign: "center", fontSize: fs + 8, fontFamily: "Times-Bold", marginBottom: fs * 0.4 },
    headline: { textAlign: "center", fontSize: fs + 4, fontFamily: "Times-Bold", marginBottom: fs * 0.4 },
    contactRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
    contactSep: { marginHorizontal: 4 },
    link: { color: "#0000ff", textDecoration: "none" },
    sectionTitle: {
      fontSize: fs + 2,
      fontFamily: "Times-Bold",
      textTransform: "uppercase",
      marginTop: fs * 0.9,
      marginBottom: 3,
      paddingBottom: 1,
      borderBottomWidth: 0.6,
      borderBottomColor: "#000000",
    },
    summary: { textAlign: "justify", marginBottom: 2 },
    block: { marginTop: fs * 0.45 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
    headerTitle: { flex: 1, paddingRight: 8 },
    headerTail: { flexShrink: 0, fontFamily: "Times-Bold" },
    bold: { fontFamily: "Times-Bold" },
    italic: { fontFamily: "Times-Italic" },
    bullet: { flexDirection: "row", marginBottom: fs * 0.1, paddingLeft: 6 },
    bulletDot: { width: 8 },
    bulletText: { flex: 1 },
  });

type CvStyles = ReturnType<typeof makeStyles>;
type Ty = (s: string | null | undefined) => string;

/** Texte avec mots-clés `**en gras**`. */
function Rich({ text, ty, st }: { text: string; ty: Ty; st: CvStyles }) {
  return (
    <>
      {splitBold(ty(text)).map((p, i) =>
        p.bold ? (
          <Text key={i} style={st.bold}>
            {p.text}
          </Text>
        ) : (
          p.text
        )
      )}
    </>
  );
}

function Bullets({
  items,
  ty,
  st,
  link,
}: {
  items: string[];
  ty: Ty;
  st: CvStyles;
  /** Lien ajouté à la fin de la dernière puce (« GitHub »). */
  link?: { src: string; label: string } | null;
}) {
  const list = items.filter((b) => b && b.trim());
  if (!list.length && link) list.push("");
  return (
    <>
      {list.map((b, j) => (
        <View key={j} style={st.bullet}>
          <Text style={st.bulletDot}>•</Text>
          <Text style={st.bulletText}>
            <Rich text={b} ty={ty} st={st} />
            {link && j === list.length - 1 ? (
              <>
                {b ? " " : ""}
                <Link src={link.src} style={st.link}>
                  {link.label}
                </Link>
              </>
            ) : null}
          </Text>
        </View>
      ))}
    </>
  );
}

// Titre à gauche (il peut passer sur 2 lignes), dates à droite : aucun séparateur à
// couper, donc pas de tiret parasite en fin de ligne.
function HeaderRow({ st, title, tail }: { st: CvStyles; title: React.ReactNode; tail: string }) {
  return (
    <View style={st.headerRow}>
      <Text style={st.headerTitle}>{title}</Text>
      {tail ? <Text style={st.headerTail}>{tail}</Text> : null}
    </View>
  );
}

type ContactItem = { text: string; href?: string };

function ContactRow({ items, st }: { items: ContactItem[]; st: CvStyles }) {
  if (!items.length) return null;
  return (
    <View style={st.contactRow}>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text style={st.contactSep}>|</Text>}
          {c.href ? (
            <Link src={c.href} style={st.link}>
              {c.text}
            </Link>
          ) : (
            <Text>{c.text}</Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const absoluteUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export function CVDocument({
  cv,
  language = "fr",
  fontSize = 10,
  probe = 0,
}: {
  cv: GeneratedCV;
  language?: DocLang;
  fontSize?: number;
  /** Hauteur (pt) d'un espaceur final : sert à mesurer la place libre (lib/pdf/fill.ts). */
  probe?: number;
}) {
  const st = makeStyles(fontSize);
  const L = LABELS[language];
  const ty = typographyFor(language);
  const id = cv.identity;
  const line1: ContactItem[] = [
    id.location ? { text: id.location } : null,
    id.phone ? { text: `${language === "fr" ? "Tél :" : "Phone:"} ${id.phone}` } : null,
    id.email ? { text: id.email, href: `mailto:${id.email}` } : null,
  ].filter(Boolean) as ContactItem[];
  const line2: ContactItem[] = [
    id.linkedin_url ? { text: displayUrl(id.linkedin_url), href: absoluteUrl(id.linkedin_url) } : null,
    id.portfolio_url ? { text: displayUrl(id.portfolio_url), href: absoluteUrl(id.portfolio_url) } : null,
  ].filter(Boolean) as ContactItem[];
  const projects = cv.sections.projects ?? [];
  const groups = (cv.sections.skill_groups ?? []).filter((g) => g.items.length > 0);

  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.name}>{id.full_name}</Text>
        {cv.headline?.trim() ? <Text style={st.headline}>{ty(cleanJobTitle(cv.headline))}</Text> : null}
        <ContactRow items={line1} st={st} />
        <ContactRow items={line2} st={st} />

        {cv.summary && (
          <>
            <Text style={st.sectionTitle}>{L.profile}</Text>
            <Text style={st.summary}>
              <Rich text={cv.summary} ty={ty} st={st} />
            </Text>
          </>
        )}

        {cv.sections.experiences.length > 0 && (
          <>
            <Text style={st.sectionTitle}>{L.experience}</Text>
            {cv.sections.experiences.map((e, i) => (
              <View key={i} style={st.block} wrap={false}>
                <HeaderRow
                  st={st}
                  title={
                    <>
                      <Text style={st.bold}>{cleanJobTitle(e.title)}</Text>
                      {e.company ? (
                        <>
                          {" | "}
                          <Text style={st.italic}>{e.company}</Text>
                        </>
                      ) : null}
                      {e.location ? ` (${e.location})` : ""}
                    </>
                  }
                  tail={expDateRange(e.start_date, e.end_date, language)}
                />
                <Bullets items={e.bullet_points ?? []} ty={ty} st={st} />
              </View>
            ))}
          </>
        )}

        {projects.length > 0 && (
          <>
            <Text style={st.sectionTitle}>{projects.length > 1 ? L.projects : L.project}</Text>
            {projects.map((p, i) => (
              <View key={i} style={st.block} wrap={false}>
                <HeaderRow
                  st={st}
                  title={
                    <>
                      <Text style={st.bold}>{p.name}</Text>
                      {p.stack?.length ? <Text style={st.italic}>{` (${p.stack.join(", ")})`}</Text> : null}
                    </>
                  }
                  tail={eduYearRange(p.start_date, p.end_date, language)}
                />
                <Bullets
                  items={p.bullet_points ?? []}
                  ty={ty}
                  st={st}
                  link={p.url ? { src: absoluteUrl(p.url), label: /github\.com/i.test(p.url) ? "GitHub" : displayUrl(p.url) } : null}
                />
              </View>
            ))}
          </>
        )}

        {cv.sections.educations.length > 0 && (
          <>
            <Text style={st.sectionTitle}>{L.education}</Text>
            {cv.sections.educations.map((e, i) => (
              <View key={i} style={st.block} wrap={false}>
                <HeaderRow
                  st={st}
                  title={<Text style={st.bold}>{ty([e.degree, e.field].filter(Boolean).join(" : ") || e.school)}</Text>}
                  tail={expDateRange(e.start_date, e.end_date, language)}
                />
                {(e.degree || e.field) && (
                  <Text style={st.italic}>{[e.school, e.location].filter(Boolean).join(", ")}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {(cv.sections.skills_flat?.length || cv.sections.languages.length) ? (
          <>
            <Text style={st.sectionTitle}>{L.skills}</Text>
            {groups.length > 0 ? (
              groups.map((g, i) => (
                <View key={i} style={st.bullet}>
                  <Text style={st.bulletDot}>•</Text>
                  <Text style={st.bulletText}>
                    <Text style={st.bold}>{ty(`${capitalizeFirst(g.label)} :`)}</Text>
                    {` ${g.items.map((x) => capitalizeFirst(x)).join(", ")}.`}
                  </Text>
                </View>
              ))
            ) : (
              cv.sections.skills_flat?.length > 0 && (
                <Text>{cv.sections.skills_flat.map((x) => capitalizeFirst(x)).join(" | ")}</Text>
              )
            )}
            {cv.sections.languages.length > 0 && (
              <View style={st.bullet}>
                <Text style={st.bulletDot}>•</Text>
                <Text style={st.bulletText}>
                  <Text style={st.bold}>{ty(`${L.languages} :`)}</Text>
                  {` ${cv.sections.languages.map((l) => formatLanguage(l.name, l.level)).join(", ")}.`}
                </Text>
              </View>
            )}
          </>
        ) : null}
        {probe > 0 ? <View style={{ height: probe }} /> : null}
      </Page>
    </Document>
  );
}

// =============================================================
// Lettre de motivation — modèle de référence
// =============================================================

const lmStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 56,
    paddingVertical: 50,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.32,
    color: "#000000",
  },
  senderName: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 1 },
  senderLine: { fontSize: 10.5, marginBottom: 0.5 },
  blockGap: { height: 8 },
  smallGap: { height: 4 },
  dateLine: { fontSize: 10.5, marginBottom: 8 },
  recipient: { fontSize: 10.5, marginBottom: 8 },
  subject: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 10 },
  salutation: { marginBottom: 8 },
  paragraph: { textAlign: "justify", marginBottom: 8 },
  signatureSpace: { height: 14 },
  signature: { fontFamily: "Helvetica-Bold" },
});

export function LMDocument({
  identity,
  recipient,
  object,
  body_paragraphs,
  language = "fr",
}: {
  identity: GeneratedCV["identity"];
  recipient: { company: string; location?: string | null };
  object: string;
  body_paragraphs: string[];
  language?: DocLang;
}) {
  const L = LABELS[language];
  const ty = typographyFor(language);
  const senderCity = identity.location?.split(",")[0]?.trim() || null;
  const dateLine = letterDateLine(senderCity, language);
  const company = (recipient.company ?? "").trim();

  return (
    <Document>
      <Page size="A4" style={lmStyles.page}>
        <Text style={lmStyles.senderName}>{identity.full_name}</Text>
        {identity.phone && <Text style={lmStyles.senderLine}>{identity.phone}</Text>}
        {identity.email && <Text style={lmStyles.senderLine}>{identity.email}</Text>}
        <View style={lmStyles.smallGap} />
        {identity.location && <Text style={lmStyles.senderLine}>{identity.location}</Text>}

        <View style={lmStyles.blockGap} />
        <Text style={lmStyles.dateLine}>{dateLine}</Text>

        {/* Destinataire uniquement si l'entreprise est connue : un pays seul n'a aucun sens */}
        {company ? (
          <Text style={lmStyles.recipient}>
            {company}
            {recipient.location ? `\n${recipient.location}` : ""}
          </Text>
        ) : null}

        <Text style={lmStyles.subject}>{ty(`${L.subject} : ${cleanJobTitle(object)}`)}</Text>
        <Text style={lmStyles.salutation}>{L.salutation}</Text>

        {body_paragraphs
          .filter((p) => p && p.trim())
          .map((p, i) => (
            <Text key={i} style={lmStyles.paragraph}>
              {ty(p)}
            </Text>
          ))}

        {L.closing ? <Text style={lmStyles.paragraph}>{L.closing}</Text> : null}
        {L.signoff ? <Text style={lmStyles.paragraph}>{L.signoff}</Text> : null}
        <View style={lmStyles.signatureSpace} />
        <Text style={lmStyles.signature}>{identity.full_name}</Text>
      </Page>
    </Document>
  );
}
