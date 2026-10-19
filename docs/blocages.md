# Blocages en attente d'une action de Jason

Rempli par Claude Code quand un lot ne peut pas avancer sans Jason. Le plus récent en haut.
Format : date · lot · ce qui manque · ce que Jason doit faire exactement · lots qui continuent en attendant.

## 2026-10-19 · LOT-02 · Variables de licence à définir
- Ce qui manque : valeurs réelles des variables d'essai et de licence (les agents ne lisent aucun `.env*`).
- Ce que Jason doit faire, dans le `.env` du serveur client (jamais dans le dépôt) :
  - `LICENSE_SECRET` : **obligatoire hors test**, au moins 32 caractères aléatoires (ex. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Sans elle, l'essai fonctionne mais l'activation est refusée. La garder secrète : elle sert aussi à `npm run license:generate -- "RICHBOND CI"`. Ne jamais la changer après activation (la clé deviendrait invalide pour une réactivation).
  - `TRIAL_END_DATE=AAAA-MM-JJ` (fin à 23:59 heure d'Abidjan) **ou** `TRIAL_DAYS` (défaut 30). Lue **uniquement à la création** de la licence ; ensuite, utiliser « Prolonger » dans `/parametres/licence`.
  - Ne jamais définir `TEST_NOW` ni `ALLOW_TEST_NOW` en production (ignorées si `NODE_ENV=production`).
  - `CONTACT_EMAIL` et `CONTACT_PHONE` (optionnelles) : coordonnées de Christ-Emmanuel Mouhi affichées dans la fenêtre et le bandeau d'expiration. Non affichées si non définies.
  - Dédoublonner `.env.example` : le LOT-02 y ajoute ces clés en fin de fichier sans l'avoir lu.
- Les lots continuent en attendant.

## 2026-10-18 · LOT-00 · Vérifier `.env.example`
- Ce qui manque : `.env.example` a été réécrit par un agent sans pouvoir lire l'ancienne version. Des clés de l'original ont pu disparaître : `TRIAL_END_DATE`, `TRIAL_DAYS`, `LICENSE_SECRET`, `TZ`, `SMTP_*`.
- Ce que Jason doit faire : lancer `git diff 4ca9796 -- .env.example` et remettre dans le fichier les clés utiles qui manquent (elles servent au LOT-02 et au LOT-16). Vérifier aussi que `SEED_DEFAULT_PASSWORD` y figure : le seed s'arrête sans cette clé.
- Les lots continuent en attendant.
