import "server-only";
import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { GeneratedCV } from "@/lib/ai/generate-cv";
import {
  typographyFor,
  formatLanguage,
  displayUrl,
  capitalizeFirst,
  eduYearRange,
  expDateRange,
  cleanJobTitle,
} from "@/lib/text/typography";
import { LABELS, letterDateLine, type DocLang } from "@/lib/text/lang";

// Pas de césure automatique : react-pdf coupe les mots avec des règles
// anglaises (« corre-spond », « ar-tisans »), inacceptable dans une lettre.
Font.registerHyphenationCallback((word) => [word]);

// =============================================================
// CV — modèle sobre une colonne, compatible ATS
// Tous les libellés fixes viennent de LABELS[language] : un CV pour une
// offre anglophone est entièrement en anglais (titres de sections,
// « Present », « Languages: »), avec la typographie anglaise.
// =============================================================

// Tailles et espacements dérivés de la taille de corps `fs` : fitCVToOnePage choisit
// la plus grande qui tient sur une page, pour ne pas laisser de vide en bas.
// Croissant, par pas de 0,25 pt : la plus grande taille qui tient laisse le moins de vide.
export const CV_FONT_SIZES = Array.from({ length: 11 }, (_, i) => 8.5 + i * 0.25);

const makeStyles = (fs: number) =>
  StyleSheet.create({
    page: {
      paddingHorizontal: 42,
      paddingVertical: 30,
      fontFamily: "Helvetica",
      fontSize: fs,
      lineHeight: 1.22,
      color: "#000000",
    },
    name: {
      textAlign: "center",
      fontSize: fs + 5,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: fs * 0.6,
    },
    headline: { textAlign: "center", fontSize: fs + 2, fontFamily: "Helvetica-Bold", marginBottom: fs * 0.5 },
    contactLine: { fontSize: fs, color: "#202020", marginBottom: fs * 0.9 },
    sectionTitle: {
      fontSize: fs + 1,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: fs * 0.8,
      marginBottom: 3,
      paddingBottom: 1,
      borderBottomWidth: 0.6,
      borderBottomColor: "#000000",
    },
    summary: { fontSize: fs, marginBottom: 2, textAlign: "justify" },
    expBlock: { marginTop: fs * 0.4 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1, fontSize: fs + 0.5 },
    headerTitle: { flex: 1, paddingRight: 8 },
    headerTail: { flexShrink: 0, fontStyle: "italic", color: "#3a3a3c" },
    expHeaderLine: { fontSize: fs + 0.5, marginBottom: 1 },
    expTitleBold: { fontFamily: "Helvetica-Bold" },
    expDates: { fontStyle: "italic", color: "#3a3a3c" },
    bullet: { flexDirection: "row", marginBottom: fs * 0.1, paddingLeft: 6 },
    bulletDot: { width: 7, fontSize: fs },
    bulletText: { flex: 1, fontSize: fs },
    eduBlock: { marginTop: fs * 0.4 },
    eduSchool: { fontSize: fs + 0.5, marginBottom: 1 },
    eduDegree: { fontSize: fs, fontStyle: "italic", color: "#202020", marginBottom: 1 },
    skillsFlow: { fontSize: fs, marginTop: 2, marginBottom: 2 },
    skillLabel: { fontFamily: "Helvetica-Bold" },
    languagesLine: { fontSize: fs, fontFamily: "Helvetica-Bold" },
  });

type CvStyles = ReturnType<typeof makeStyles>;

type Ty = (s: string | null | undefined) => string;

function Bullets({ items, ty, st }: { items: string[]; ty: Ty; st: CvStyles }) {
  return (
    <>
      {items
        .filter((b) => b && b.trim())
        .map((b, j) => (
          <View key={j} style={st.bullet}>
            <Text style={st.bulletDot}>•</Text>
            <Text style={st.bulletText}>{ty(b)}</Text>
          </View>
        ))}
    </>
  );
}

// Titre à gauche (il peut passer sur 2 lignes), dates à droite : aucun séparateur à
// couper, donc plus de tiret parasite en fin de ligne.
function HeaderRow({ st, title, tail }: { st: CvStyles; title: string; tail: string }) {
  return (
    <View style={st.headerRow}>
      <Text style={[st.expTitleBold, st.headerTitle]}>{title}</Text>
      {tail ? <Text style={st.headerTail}>{tail}</Text> : null}
    </View>
  );
}

export function CVDocument({
  cv,
  language = "fr",
  fontSize = 9,
  probe = 0,
}: {
  cv: GeneratedCV;
  language?: DocLang;
  fontSize?: number;
  /** Hauteur (pt) d'un espaceur final : sert à mesurer la place libre (lib/pdf/fill.ts). */
  probe?: number;
}) {
  const cvStyles = makeStyles(fontSize);
  const L = LABELS[language];
  const ty = typographyFor(language);
  const contact = [
    cv.identity.phone,
    cv.identity.email,
    cv.identity.location,
    displayUrl(cv.identity.linkedin_url),
    displayUrl(cv.identity.portfolio_url),
  ].filter(Boolean) as string[];
  const projects = cv.sections.projects ?? [];
  const groups = (cv.sections.skill_groups ?? []).filter((g) => g.items.length > 0);

  return (
    <Document>
      <Page size="A4" style={cvStyles.page}>
        <Text style={cvStyles.name}>{cv.identity.full_name}</Text>
        {cv.headline?.trim() ? <Text style={cvStyles.headline}>{ty(cleanJobTitle(cv.headline))}</Text> : null}
        {contact.length > 0 && (
          // Un Text par élément : le saut de ligne ne tombe qu'entre deux éléments (« | - » sinon).
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginBottom: fontSize * 0.9 }}>
            {contact.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Text style={{ ...cvStyles.contactLine, marginBottom: 0, marginHorizontal: 5 }}>|</Text>}
                <Text style={{ ...cvStyles.contactLine, marginBottom: 0 }}>{c}</Text>
              </React.Fragment>
            ))}
          </View>
        )}

        {cv.summary && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.profile}</Text>
            <Text style={cvStyles.summary}>{ty(cv.summary)}</Text>
          </>
        )}

        {cv.sections.experiences.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.experience}</Text>
            {cv.sections.experiences.map((e, i) => (
              <View key={i} style={cvStyles.expBlock} wrap={false}>
                <HeaderRow
                  st={cvStyles}
                  title={`${cleanJobTitle(e.title)}${e.company ? ` — ${e.company}` : ""}`}
                  tail={[expDateRange(e.start_date, e.end_date, language), e.location].filter(Boolean).join("  |  ")}
                />
                <Bullets items={e.bullet_points ?? []} ty={ty} st={cvStyles} />
              </View>
            ))}
          </>
        )}

        {projects.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{projects.length > 1 ? L.projects : L.project}</Text>
            {projects.map((p, i) => (
              <View key={i} style={cvStyles.expBlock} wrap={false}>
                <HeaderRow
                  st={cvStyles}
                  title={`${p.name}${p.role ? ` — ${p.role}` : ""}`}
                  tail={[expDateRange(p.start_date, p.end_date, language), displayUrl(p.url)].filter(Boolean).join("  |  ")}
                />
                <Bullets items={p.bullet_points ?? []} ty={ty} st={cvStyles} />
              </View>
            ))}
          </>
        )}

        {cv.sections.educations.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.education}</Text>
            {cv.sections.educations.map((e, i) => (
              <View key={i} style={cvStyles.eduBlock} wrap={false}>
                <HeaderRow st={cvStyles} title={e.school} tail={eduYearRange(e.start_date, e.end_date, language)} />
                {(e.degree || e.field) && (
                  <Text style={cvStyles.eduDegree}>{ty([e.degree, e.field].filter(Boolean).join(" — "))}</Text>
                )}
                <Bullets items={e.bullet_points ?? []} ty={ty} st={cvStyles} />
              </View>
            ))}
          </>
        )}

        {(cv.sections.skills_flat?.length || cv.sections.languages.length) ? (
          <>
            <Text style={cvStyles.sectionTitle}>{L.skills}</Text>
            {groups.length > 0 ? (
              groups.map((g, i) => (
                <View key={i} style={cvStyles.bullet}>
                  <Text style={cvStyles.bulletDot}>•</Text>
                  <Text style={cvStyles.bulletText}>
                    <Text style={cvStyles.skillLabel}>{ty(`${capitalizeFirst(g.label)} :`)}</Text>
                    {" "}
                    {g.items.map((s) => capitalizeFirst(s)).join(", ")}
                  </Text>
                </View>
              ))
            ) : (
              cv.sections.skills_flat?.length > 0 && (
                <Text style={cvStyles.skillsFlow}>
                  {cv.sections.skills_flat.map((s) => capitalizeFirst(s)).join(" | ")}
                </Text>
              )
            )}
            {cv.sections.languages.length > 0 && (
              <Text style={cvStyles.languagesLine}>
                {ty(
                  `${L.languages} : ${cv.sections.languages
                    .map((l) => formatLanguage(l.name, l.level))
                    .join(" | ")}`
                )}
              </Text>
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
