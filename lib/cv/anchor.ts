import type { ProfileFull } from "./types";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Compétence ancrée : prouvée par une expérience OU par un projet du profil.
 * Module sans dépendance serveur : partagé par le scoring, la génération des
 * documents et les écrans (badge « ancrée »).
 */
export function isAnchoredSkill(profile: ProfileFull, skill: ProfileFull["skills"][number]): boolean {
  if (skill.evidence_experience_ids.length > 0) return true;
  const key = normalize(skill.name);
  return (profile.projects ?? []).some((p) => (p.skills_used ?? []).some((u) => normalize(u) === key));
}
