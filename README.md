# JobScout

Trouvez des offres d'emploi grâce à un scan multi-plateformes, triez-les avec un score calculé sur votre vrai profil, et générez pour chacune un CV et une lettre de motivation d'une page (compatibles ATS), sans jamais inventer une compétence que vous n'avez pas.

Tout tourne sur votre machine : base SQLite locale, serveur limité à `127.0.0.1`, aucun compte à créer (une version hébergée protégée par mot de passe est possible : [Hébergement en ligne](#hébergement-en-ligne)). Seuls sortent les recherches envoyées aux sites d'offres pendant un scan et, si vous utilisez une IA en ligne, les textes transmis au fournisseur que vous avez choisi, plus quelques requêtes techniques ([détail](#confidentialité-et-conditions-dutilisation)).

> Site et guide de démarrage : **https://latenightsbeats1208-pixel.github.io/jobscout/** · [Installation](#installation) · [Installation sur Mac](#installation-sur-mac) · [Choisir une IA](#choisir-une-ia) · [Confidentialité et conditions d'utilisation](#confidentialité-et-conditions-dutilisation)
>
> **En vidéo**, moins de 2 minutes chacune : [1. Installation](https://youtu.be/cIh4PSmPlKE) · [2. Mise en place](https://youtu.be/gOMQkcsD6LA) · [3. Utilisation](https://youtu.be/45uLxsWXXLQ)

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind**
- **IA au choix** — Anthropic Claude (référence : Opus 4.8 pour la rédaction, Sonnet 5 pour la relecture), OpenAI, Google Gemini, Mistral, DeepSeek, Groq, OpenRouter, Ollama et LM Studio en local, ou tout serveur compatible OpenAI. Deux modèles par fournisseur : un de **rédaction** (extraction du CV, CV, lettre, message V.I.E) et un de **relecture** (relecture, traduction anglaise, réparation ciblée de la lettre). Couche commune : `lib/ai/llm.ts` ; catalogue : `lib/ai/providers.ts`.
- **Tests** : Vitest (`npm test`) et intégration continue GitHub Actions (types, tests, build sur Windows, Linux et macOS à puce Apple avec Node 22, 24 et 26, et sur Mac Intel avec Node 24 ; sur les deux types de Mac, le parcours d'[installation sur Mac](#installation-sur-mac) est rejoué : `npm ci`, démarrage, moteur LinkedIn installé puis lancé, lanceur)
- **SQLite** intégré (`node:sqlite`, WAL) + fichiers locaux
- **Scraping** : `fetch` + parsing DOM (`jsdom`) + JSON-LD `JobPosting` ; Playwright uniquement pour LinkedIn
- **@react-pdf/renderer** + **docx** pour les documents générés ; **xlsx** pour l'import/export des candidatures

## Installation

> **Première installation ?** Les prérequis, les commandes et les messages normaux sont ci-dessous. Sur Mac, voir [Installation sur Mac](#installation-sur-mac).
>
> En vidéo : [installation](https://youtu.be/cIh4PSmPlKE) · [mise en place](https://youtu.be/gOMQkcsD6LA) · [utilisation](https://youtu.be/45uLxsWXXLQ). Elles ont été tournées sous Windows ; les gestes sont les mêmes sur Mac, avec le Terminal à la place de PowerShell.
>
> En résumé (repères établis sous Windows) : **environ 10 à 20 minutes au total avec les réglages par défaut (jusqu'à 35 si vous activez d'autres sources), dont 10 à 15 devant l'écran**. `npm ci` prend environ 1 minute ; le premier scan dure 1 à 3 minutes avec France Travail seule, 10 à 20 minutes avec toutes les sources. Pendant ce temps, l'ordinateur doit rester allumé (hors veille), le terminal ouvert.

Requiert **Node ≥ 22.13** (module `node:sqlite` sans drapeau expérimental ; Node 24 convient). Au démarrage, Node affiche `ExperimentalWarning: SQLite is an experimental feature` : c'est normal et sans effet.

```bash
git clone https://github.com/latenightsbeats1208-pixel/jobscout.git
cd jobscout
npm ci
npm run dev
```

L'app démarre sur http://127.0.0.1:3000 (écoute limitée à la machine locale, rien n'est exposé au réseau). Sous Windows, `scripts/Start-JobScout.ps1` lance le serveur de développement et ouvre le navigateur. Sur Mac, `npm run shortcut:mac` (après `npm ci`) crée un lanceur `JobScout.command` dans le dossier du projet, avec une copie sur le Bureau : un double-clic ouvre le Terminal, démarre JobScout avec `caffeinate -i` (pas de mise en veille automatique tant qu'il tourne) et ouvre http://127.0.0.1:3000 dès qu'il répond (voir [Installation sur Mac](#installation-sur-mac)).

**IA à configurer dès l'inscription** : l'onboarding lit votre CV avec un modèle d'IA pour créer le profil ([Choisir une IA](#choisir-une-ia)). Dans l'écran « Génération IA », choisissez votre fournisseur et collez votre clé :

| Fournisseur | Clé | Remarque |
|---|---|---|
| Anthropic (Claude) | https://platform.claude.com | référence de JobScout, meilleure fidélité au profil ; les modèles récents qui refusent l'appel d'outil forcé (Opus 5.5, Sonnet 5.5) passent d'eux-mêmes en mode « auto » |
| OpenAI | https://platform.openai.com/api-keys | GPT-6 Sol / Luna, raisonnement coupé (requis pour les réponses structurées en Chat Completions) |
| Google Gemini | https://aistudio.google.com/apikey | offre gratuite limitée |
| Mistral | https://console.mistral.ai/api-keys | fournisseur européen |
| DeepSeek | https://platform.deepseek.com/api_keys | très économique ; mode « thinking » coupé (requis pour l'appel d'outil forcé) |
| Groq, OpenRouter | console du fournisseur | Groq : offre gratuite très limitée (≈ 8 000 jetons/min) ; OpenRouter : une clé pour des centaines de modèles |
| Ollama, LM Studio | aucune clé | 100 % local et gratuit ; qualité selon le modèle (par exemple `gemma4:12b`, `qwen3.5:9b`, `ministral-3:14b`) ; réponse contrainte par le schéma JSON, ces serveurs ne sachant pas forcer un appel d'outil |
| Autre | selon le serveur | tout serveur au format OpenAI Chat Completions (URL de base à indiquer) |

« Charger la liste » propose les modèles disponibles chez le fournisseur, « Vérifier » teste la connexion. Les clés restent dans la base locale, enregistrées en clair (non chiffrées) : protégez l'accès à votre ordinateur. Une adresse de serveur doit être en `https://`, sauf serveur sur la machine même (`http://127.0.0.1…`). Mode développement : une `ANTHROPIC_API_KEY` dans `.env` sert de repli si rien n'est configuré.

**LinkedIn (optionnel)** : c'est la seule source qui a besoin d'un navigateur Chromium. Cochez-la dans Profil › Recherche › Sources : l'encadré « Moteur LinkedIn requis » apparaît, cliquez « Installer le moteur LinkedIn » (~100 Mo à télécharger, ~265 Mo sur le disque). En ligne de commande : `npm run playwright:install`.

**Mises à jour** : arrêtez JobScout (`Ctrl + C`), puis `git pull` et `npm ci`.

**Messages npm normaux** : `npm warn deprecated node-domexception`, « packages are looking for funding », et, avec npm récent, le script d'installation de `tesseract.js` ignoré (il n'affiche qu'un appel aux dons). `npm audit --omit=dev`, qui ne regarde que ce qui tourne réellement, doit afficher `found 0 vulnerabilities` (le PostCSS embarqué par Next.js est forcé en version corrigée via `overrides`). `npm audit` complet signale des failles dans des outils de développement (Tailwind CSS et ses dépendances), sans effet sur l'application. **Ne lancez jamais `npm audit fix --force`** : il installerait Tailwind CSS 4, incompatible.

## Installation sur Mac

Mêmes étapes que ci-dessus, avec les gestes du Mac :

1. Installez **Node.js ≥ 22.13** avec l'installeur `.pkg` de nodejs.org, puis vérifiez dans le Terminal (⌘ + Espace, « Terminal ») : `node -v`.
2. Récupérez le projet (`git clone …` ou le ZIP du dépôt), puis dans le dossier : `npm ci`.
3. Lancez `npm run dev`, ou `npm run shortcut:mac` pour créer le lanceur `JobScout.command` (double-clic = Terminal + serveur + navigateur, sans veille tant qu'il tourne).
4. « Ctrl + V » se lit ⌘V, « Ctrl + C » (arrêt) reste `Ctrl + C`. Les données restent dans le dossier `jobscout/data`.

Une IA locale (Ollama, LM Studio) demande **macOS 14 Sonoma ou plus récent** ; LM Studio, une puce Apple. Sur un Mac plus ancien, prenez une IA en ligne. Pour tout effacer : supprimez le dossier du projet et, si vous l'aviez installé, `~/.ollama` (les modèles pèsent plusieurs Go ; mettre l'application à la Corbeille ne suffit pas).

## Paquet Windows

`npm run package` produit `installer/output/JobScout_Setup_v<version>.exe` : un installeur autonome (Node 22 LTS embarqué, aucune dépendance sur la machine cible), avec launcher natif, données sous `%LOCALAPPDATA%\JobScout` et contrôle anti-fuite de données personnelles bloquant.

**Windows uniquement** : la commande a besoin d'Inno Setup 6 (`ISCC.exe`) et embarque un Node pour Windows (`win-x64`). Sur Mac ou Linux, elle échoue après la compilation de Next.js. Sur Mac, JobScout se lance depuis les sources (voir ci-dessus).

## Choisir une IA

JobScout en a besoin pour lire votre CV puis rédiger CV et lettres. Deux voies :

- **Clé chez un fournisseur en ligne** (tableau ci-dessus) : créez la clé sur sa console (le bouton « Créer une clé » de Profil › Génération IA ouvre la bonne page), collez-la, « Charger la liste », « Vérifier ». Claude (Anthropic) est la référence ; Gemini a une offre gratuite limitée.
- **IA locale, gratuite** : installez Ollama ou LM Studio, téléchargez un modèle (par exemple `ollama pull qwen3.5:9b`), puis choisissez-le dans « Génération IA » (adresse `http://127.0.0.1:11434` pour Ollama). Ollama : refusez le compte et les modèles « cloud », et réglez `OLLAMA_CONTEXT_LENGTH=16384` puis relancez-le. Si c'est lent, vérifiez que le modèle tourne bien sur la carte graphique (ou la puce Apple), sinon prenez un modèle plus petit (`qwen3.5:4b`).

## Sources de scan

| Source | Méthode | Périmètre | Par défaut |
|--------|---------|-----------|------------|
| France Travail | API officielle si `FT_CLIENT_ID` / `FT_CLIENT_SECRET` sont définis (https://francetravail.io), sinon HTML SSR | France | cochée |
| Welcome to the Jungle | Index de recherche Algolia du site, avec la clé de recherche de son interface (lecture seule, aucune page HTML) | International (filtré par pays cibles) | à activer vous-même |
| HelloWork | HTML SSR + JSON-LD | France | à activer vous-même |
| Talent.com | HTML SSR multi-domaines + JSON-LD | France, Belgique, Suisse, Luxembourg, Canada, USA, Maroc, Tunisie, Sénégal | à activer vous-même |
| LinkedIn | Playwright (pages publiques « guest ») | International (tous pays cibles) | à activer vous-même, moteur à installer |
| Recrutement sur le web (via Google) | SerpAPI (résultats Google) : extraits des annonces publiques de recrutement (posts LinkedIn, X, Reddit, pages de recrutement d'entreprises, au choix), sans contacter ces sites. Clé SerpAPI et choix des lieux dans Profil › Recrutement sur le web (via Google), adresse du service réglable par `SERPAPI_URL` ; une page de 10 résultats = une recherche de votre forfait | International | à activer vous-même, clé à renseigner |
| APEC | — | France (cadres) | **suspendue** : le site bloque désormais les requêtes automatiques |
| Civiweb (V.I.E) | — | International | **suspendue** : Business France exige désormais une authentification que JobScout ne gère pas |

**Avant d'activer une source, lisez [Confidentialité et conditions d'utilisation](#confidentialité-et-conditions-dutilisation)** : les conditions de Welcome to the Jungle, HelloWork, Talent.com et LinkedIn interdisent l'extraction automatisée. C'est pourquoi, depuis la 3.4.13, seule France Travail est cochée d'office. Chaque source s'active ou se désactive dans Profil › Recherche › Sources (ou à l'étape Préférences de l'onboarding). Une source suspendue n'est jamais interrogée, même si elle est restée cochée dans un ancien profil. Une source hors périmètre géographique (ex. HelloWork quand le profil ne cible pas la France) est automatiquement sautée. **Profondeur de recherche** (Profil › Profondeur de recherche) : nombre de pages de résultats parcourues par intitulé cible et par source, de 1 à 10 (5 par défaut) ; le plafond d'offres par source suit la même proportion. Plus c'est profond, plus le scan est long et plus les sites risquent de limiter les requêtes (LinkedIn surtout). La disponibilité des sources dépend des sites tiers (anti-bot, changements d'API) ; une source en échec est signalée dans le journal du scan.

WTTJ est interrogée avec la clé de recherche (lecture seule) qu'utilise l'interface du site. Si elle cesse de fonctionner, décochez la source.

## Scoring des offres (local, déterministe, gratuit)

`lib/scoring/local.ts` — critères exposés dans le détail de chaque offre :

- **Secteur** (30 %) — titre et description comparés aux secteurs cibles du profil
- **Compétences** (50 %) — une compétence ancrée dans une expérience pèse davantage qu'une compétence simplement listée
- **Pays** (20 %) — 100 si le pays de l'offre fait partie des pays cibles, 0 sinon ; neutre si l'offre n'a pas de pays ou si aucun pays cible n'est déclaré
- **Contrat** (±10) — selon les contrats recherchés du profil (`preferred_contracts`, par défaut CDI et CDD ; catégories CDI, CDD, V.I.E, stage, alternance, graduate program, ce dernier convenant aussi à qui cherche un CDI) : +10 si le contrat de l'offre en fait partie, neutre s'il est inconnu, −6 s'il est identifié mais non recherché
- **Bonus Langue** (jusqu'à +8) — +8 si l'offre est rédigée dans une langue maîtrisée (B2+) ; +2,4 si elle n'est pas en anglais mais que l'utilisateur maîtrise l'anglais
- **Bonus Durée V.I.E** (jusqu'à +5, V.I.E uniquement) — +5 pour 12–24 mois, +3 pour 6–11 mois

Aucun appel IA : instantané et illimité. Re-scoring global : `POST /api/offres/rescore` (après modification du profil).

## Filtre par expérience (local)

Page Offres › « Expérience de X à Y ans » (`lib/experience.ts`). L'annonce n'a pas de champ dédié : l'exigence est lue dans le texte (4 000 premiers caractères), seulement à côté du mot « expérience » pour ne pas confondre avec « 20 ans d'existence ».
- **Reconnu** : tranche (« 2 à 5 ans d'expérience », « 3-5 years »), minimum (« au moins 3 ans », « 5+ years of experience »), « débutant accepté », « jeune diplômé » ; à défaut de chiffre, le titre (« Junior » : 0 à 2 ans ; « Senior », « Lead », « Confirmé » : 5 ans et plus).
- **Filtre** : une offre est gardée si son exigence chevauche votre fourchette (0 à 3 ans garde « débutant », « 2 ans minimum », « 3 à 5 ans », pas « 5 ans minimum »). Chaque champ peut rester vide.
- **Sans précision** (environ la moitié des offres) : écartées par défaut, avec leur nombre et un bouton « Les inclure ».
- C'est une lecture de texte : elle peut se tromper sur une phrase ambiguë. L'exigence lue est affichée sur chaque offre.

## Filtre par distance (local)

Page Offres › « Définir ma ville » : choisissez votre ville de référence par son nom ou son code postal. La ville de votre profil est proposée, jamais enregistrée sans clic. Le menu « Toutes distances » garde ensuite les offres de votre ville ou situées jusqu'à 5, 10, 20, 30, 50, 100 ou 200 km, avec le nombre d'offres de chaque rayon, croisé avec les autres filtres. Le tri « Plus proches » classe la liste par distance, et chaque offre comme sa fiche affiche la sienne.

- **À vol d'oiseau**, depuis le centre de la commune, arrondie (au kilomètre sous 100 km) ; le filtre compare la distance affichée.
- **Lieu approximatif** (connu au seul département, ou commune devinée parmi des homonymes) : distance précédée de « ≈ », lieu compris affiché.
- **Offres en France sans ville précise** (télétravail, région seule) : hors rayon par défaut, « Les inclure » les ajoute. Une offre à l'étranger sans ville n'entre jamais dans un rayon.
- **Calcul local** : communes françaises et villes du monde sont embarquées dans `lib/geo/data` (`lib/geo`) ; rien n'est envoyé hors de l'ordinateur, aucune carte n'est chargée. Seul le code de la commune choisie est enregistré dans la base locale. Reconstruire la base : `node scripts/build-geo.mjs <dossier des sources>` (sources et adresses de téléchargement en tête du script).

## Extraction du CV

Cascade selon le type de fichier : PDF (`pdf-parse` ou `pdfjs-dist` multi-colonnes, meilleur retenu), DOCX (`mammoth`), image (`tesseract.js` FR+EN), TXT. Les modèles de reconnaissance d'image (FR, EN) sont téléchargés une fois depuis `cdn.jsdelivr.net`. Puis extraction structurée par le fournisseur d'IA choisi (appel d'outil forcé, ou réponse JSON contrainte selon le fournisseur), validation Zod, score de confiance et **garde-fou anti-hallucination** (suppression des entreprises et compétences non ancrées dans le profil).

## Génération de documents

`data/documents/…` — CV et lettre en PDF **et** DOCX, avec une boucle de rétrécissement qui garantit une page A4. Langue détectée par offre (français, ou anglais si l'annonce est en anglais). Relecture automatique : orthographe, affirmations non étayées par le profil. Message court (V.I.E) réservé aux offres V.I.E.

Coût : avec Claude (Anthropic), environ 0,12 à 0,20 $ par dossier (CV + lettre, relecture comprise) aux tarifs actuels, selon la longueur du profil et de l'offre. Avec un autre fournisseur, le coût suit ses tarifs ; en local (Ollama, LM Studio), il est nul. Le nombre de jetons de chaque appel est écrit dans le journal du serveur (`[llm] …`).

**Qualité selon le modèle** : les garde-fous anti-invention (validation contre le profil, limites de mise en page) s'appliquent quel que soit le modèle. Mais JobScout a été mis au point avec Claude : avec un autre modèle, relisez vos premiers documents. Si un modèle renvoie une réponse mal formée, JobScout tente un repli (mode JSON, extraction tolérante) avant d'afficher une erreur qui invite à choisir un modèle plus capable.

## Candidatures par e-mail et spontanées
- **Envoi par e-mail** depuis la fiche d'une offre : CV et lettre en PDF joints, message prérempli, candidature enregistrée comme « envoyée ». SMTP à renseigner une fois pour tous les envois, dans Profil › Messagerie (hôte, port, utilisateur, mot de passe d'application) ; l'adresse de candidature est cherchée dans l'annonce (`lib/mail/contact.ts`).
- **Candidatures spontanées** : page *Spontanées*, import d'un fichier Excel ou CSV d'entreprises et d'adresses (`lib/mail/contacts-file.ts`, `lib/excel/contacts.ts`), liste paginée (25 par page).
- **Vérification DNS** des adresses (le domaine accepte-t-il des e-mails ?) avant tout envoi ; un domaine invalide est refusé par l'API.
- **Candidature automatique** (page *Spontanées* et page *Offres*) : un lot de 1 à 50 candidatures, sans relecture. Pour chaque cible, JobScout génère le CV et la lettre s'ils n'existent pas, envoie le mail et enregistre la candidature « envoyée ». Sur *Offres*, seules les offres dont l'annonce donne une adresse de candidature, avec un score minimum réglable (70 par défaut) et sans candidature existante, sont concernées, les mieux notées d'abord ; celles où l'on postule sur le site de la source restent à faire à la main (`lib/auto/apply.ts`).
  - Suivi en direct : envoyées, échecs, contact en cours ; échec conservé sur la cible et écarté des lots suivants pour les offres.
  - Garde-fous : pause de 45 à 120 s entre deux envois, bouton « Arrêter », arrêt après 3 échecs de suite ou si la messagerie refuse l'identifiant, jamais deux candidatures pour la même cible, un seul lot à la fois.
- **Poste visé par contact** : saisi à la main, ou choisi par l'IA d'après l'adresse et le nom de l'entreprise (`lib/ai/choose-role.ts`) ; le CV est généré pour ce poste.

## Hébergement en ligne
Optionnel. `JOBSCOUT_HOSTED=1` protège tout le site (pages et API) par un mot de passe unique, `JOBSCOUT_ACCESS_PASSWORD`, sans compte utilisateur ; sans lui, le serveur ne sert rien. En local, rien ne change. Image Docker (avec Chromium), `compose.yml` et Caddy (HTTPS), workflow GitHub Actions qui publie l'image sur ghcr.io (amd64 et arm64) puis met le serveur à jour par SSH. Sur le serveur : copiez `compose.yml` et un fichier `.env` voisin (`JOBSCOUT_HOSTED=1`, `JOBSCOUT_ACCESS_PASSWORD`, nom de domaine pour Caddy), puis `docker compose up -d`. Les variables `DEPLOY_HOST` et les secrets SSH du dépôt activent la mise à jour automatique (`.github/workflows/deploy.yml`).

## Sécurité

- Serveur limité à `127.0.0.1` ; l'API refuse les requêtes venant d'un autre site ou d'un hôte non local (`middleware.ts`)
- Version hébergée : mot de passe d'accès, session signée (`HttpOnly`, 7 jours), 5 essais par 15 minutes, actions réservées au poste local désactivées
- Clés IA stockées en clair dans la base locale, jamais renvoyées au navigateur (seuls les 4 derniers caractères sont affichés)
- Aucune télémétrie : JobScout n'envoie rien à son éditeur, et les scripts de lancement (`npm run dev`, `npm run build`) coupent celle de Next.js (`scripts/next.mjs`)
- Whitelist de colonnes sur la mise à jour des candidatures (anti mass-assignment)
- Bornage des chemins d'écriture du dossier documents ; ouverture de dossier restreinte au dossier configuré
- Descriptions d'offres assainies (DOMPurify) ; `rel="noopener noreferrer"` sur tous les liens sortants

## Modes IA

JobScout est gratuit (licence MIT), sans compte ni abonnement. Modes IA (`lib/ai/client.ts`) : `byok` (votre clé ou votre modèle local, fournisseur au choix) ; `unset` (rien de configuré : l'onboarding reste bloqué à l'import du CV). Le code contient aussi un mode `pack` (relais défini par `JOBSCOUT_PROXY_URL`) : il est inactif dans cette version, aucun relais n'étant configuré.

**Secours automatique** : plusieurs fournisseurs peuvent être configurés ; si le fournisseur actif est injoignable, sans crédit ou à court de quota, JobScout passe au suivant dans l'ordre choisi (Profil › Secours automatique), puis écarte le fournisseur en échec 5 minutes (`lib/ai/llm.ts`). Une demande refusée ou une réponse mal formée ne déclenche pas de bascule.

## Tests

```bash
npm test            # tests automatiques (Vitest) : couche IA, fournisseurs, configuration, génération de bout en bout
npm run typecheck   # vérification des types
```

Les tests n'utilisent ni clé ni réseau : un faux serveur compatible OpenAI rejoue la génération complète (prompts, validation anti-invention, relecture). GitHub Actions les lance à chaque push et pull request (`.github/workflows/ci.yml`).

Test réel optionnel avec votre propre fournisseur (appels facturés par lui, quelques centimes) :

```bash
JOBSCOUT_LIVE=1 JOBSCOUT_LIVE_PROVIDER=openai JOBSCOUT_LIVE_KEY=sk-... npx vitest run tests/live
```

## Confidentialité et conditions d'utilisation

**Ce qui reste chez vous** : profil, offres, documents, candidatures et clés API sont dans la base locale (`data/`, ou `%LOCALAPPDATA%\JobScout` avec l'installeur Windows). L'éditeur de JobScout ne reçoit rien et il n'y a aucune télémétrie. Pour tout effacer : fermez JobScout, supprimez ce dossier (et le dossier des documents si vous en avez choisi un autre).

**Ce qui sort, et vers qui**
- Les **sites d'offres** que vous activez reçoivent vos mots-clés, vos pays cibles et votre adresse IP pendant un scan.
- **Recrutement sur le web (via Google)** : `serpapi.com` (ou `SERPAPI_URL`) reçoit vos intitulés de poste et votre clé ; SerpAPI interroge Google pour vous, ni LinkedIn, ni X, ni Reddit, ni les sites d'entreprises ne sont contactés. Source à activer vous-même, après avoir saisi la clé.
- Le **fournisseur d'IA** que vous choisissez reçoit le texte de votre CV à l'import, puis votre profil (identité comprise) et l'offre à chaque génération. Aucun envoi avec un modèle local.
- Les **modèles de reconnaissance d'image** (`cdn.jsdelivr.net`, une fois) et les requêtes de mise à jour ou de géolocalisation de villes ne contiennent aucune donnée sur vous.
- La **messagerie** : vos candidatures partent par le serveur SMTP que vous avez renseigné ; son mot de passe est chiffré (AES-256-GCM) dans la base locale.

**Conditions d'utilisation**
- JobScout est gratuit (MIT) et fourni sans garantie. Vous restez responsable de l'usage que vous en faites et de ce que vous envoyez aux recruteurs.
- Les conditions de Welcome to the Jungle, HelloWork, Talent.com et LinkedIn **interdisent l'extraction automatisée** : seule France Travail est cochée d'office, et activer une autre source est votre choix et votre responsabilité. Les offres collectées servent à votre propre recherche d'emploi, pas à être revendues ou republiées.
- Pour une recherche menée pour vous-même, le RGPD ne s'applique en principe pas (usage strictement personnel) ; si vous utilisez JobScout pour d'autres personnes ou dans un cadre professionnel, il peut s'appliquer à vous.
- Vérifiez toujours les CV et lettres générés avant envoi : l'IA peut se tromper, même avec les garde-fous anti-invention.

## Licence

MIT — voir [`LICENSE`](LICENSE). Les marques des sites scannés appartiennent à leurs propriétaires ; JobScout n'est affilié à aucun d'eux.

Composants tiers embarqués, avec leurs propres licences : polices DM Sans et Plus Jakarta Sans (SIL OFL 1.1) ; données géographiques du filtre par distance (`lib/geo/data`) :

- `geo-fr.json.gz` (communes et départements français) : base de données mise à disposition sous [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Elle contient des informations issues du jeu « Contours administratifs » (Etalab, data.gouv.fr), disponible sous ODbL, à partir duquel geo.api.gouv.fr calcule les centres des communes (contours d'ADMIN EXPRESS, IGN, pour la métropole ; d'un jeu publié pour chacune pour la Polynésie française et la Nouvelle-Calédonie). Communes, codes et populations : INSEE ; codes postaux : La Poste (Licence Ouverte 2.0 pour leurs propres données). Données modifiées ; méthode de construction : [`scripts/build-geo.mjs`](scripts/build-geo.mjs). L'ODbL porte sur cette base, pas sur le code de JobScout (MIT).
- `geo-world.json.gz` (villes et pays du monde) : villes et pays de GeoNames (CC BY 4.0, données modifiées), noms français des pays de l'INSEE (Licence Ouverte 2.0).

Sources, dates, modifications et textes de licence : [`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt).
