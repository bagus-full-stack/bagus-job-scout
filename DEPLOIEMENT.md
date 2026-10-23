# Hébergement en ligne

JobScout est conçu pour un seul utilisateur. La version hébergée ajoute **un mot de passe d'accès** devant tout le site (pages et API) ; sans mot de passe configuré, le serveur ne sert rien.

## Ce qui est protégé

- Pages et API exigent une session (cookie signé, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, 7 jours).
- 5 mots de passe faux par adresse et par 15 minutes, puis blocage temporaire.
- Les requêtes venues d'un autre site sont refusées (en-têtes `Sec-Fetch-Site` et `Origin`).
- Désactivés en ligne : ouvrir le dossier des documents, changer ce dossier, installer le moteur LinkedIn (ils n'ont de sens que sur votre poste).
- Seule `/api/health` est publique (sonde, ne révèle rien).

Le mot de passe protège votre CV, vos candidatures, vos contacts et vos clés d'IA, stockés dans le volume `/data`. Choisissez-le long (16 caractères ou plus) et servez toujours le site en **HTTPS** : le compose fourni le fait avec Caddy.

## Mise en place sur un serveur (VPS Linux avec Docker)

1. DNS : faites pointer votre domaine (enregistrement A) vers le serveur ; ports 80 et 443 ouverts.
2. Dans un dossier `jobscout` du serveur, copiez `compose.yml` et `Caddyfile`, et créez `.env` :
   ```
   JOBSCOUT_DOMAIN=jobscout.exemple.fr
   JOBSCOUT_ACCESS_PASSWORD=un-long-mot-de-passe
   ```
3. `docker compose up -d`. Le site est sur `https://jobscout.exemple.fr`.

L'image est publiée sur `ghcr.io/bagus-full-stack/bagus-job-scout` (dépôt privé : `docker login ghcr.io` avec un jeton `read:packages`).

## Déploiement automatique (GitHub Actions)

`.github/workflows/deploy.yml` : après des tests réussis sur `main`, construit l'image et la publie. Si `DEPLOY_HOST` est défini, met aussi le serveur à jour par SSH.

Dans *Settings › Secrets and variables › Actions* du dépôt :

| Type | Nom | Valeur |
|------|-----|--------|
| Variable | `DEPLOY_HOST` | adresse du serveur |
| Variable | `DEPLOY_USER` | utilisateur SSH |
| Variable | `DEPLOY_DIR` | dossier du compose (défaut `jobscout`) |
| Variable | `DEPLOY_DOMAIN` | domaine, pour la vérification finale |
| Secret | `DEPLOY_SSH_KEY` | clé privée dédiée au déploiement |
| Secret | `DEPLOY_KNOWN_HOSTS` | résultat de `ssh-keyscan <serveur>` |

Créez aussi l'environnement `production` (vous pouvez y exiger une validation manuelle).

## Limites

- Un seul serveur, un seul utilisateur : la limite d'essais de connexion est en mémoire.
- L'image embarque Chromium (moteur LinkedIn, environ 300 Mo de plus) : le moteur apparaît déjà installé. LinkedIn peut bloquer les adresses de serveurs d'hébergement, contrairement à votre connexion personnelle.
- Sauvegardez le volume `jobscout-data` (base SQLite et documents).
