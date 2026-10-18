# Blocages en attente d'une action de Jason

Rempli par Claude Code quand un lot ne peut pas avancer sans Jason. Le plus récent en haut.
Format : date · lot · ce qui manque · ce que Jason doit faire exactement · lots qui continuent en attendant.

## 2026-10-18 · LOT-00 · Vérifier `.env.example`
- Ce qui manque : `.env.example` a été réécrit par un agent sans pouvoir lire l'ancienne version. Des clés de l'original ont pu disparaître : `TRIAL_END_DATE`, `TRIAL_DAYS`, `LICENSE_SECRET`, `TZ`, `SMTP_*`.
- Ce que Jason doit faire : lancer `git diff 4ca9796 -- .env.example` et remettre dans le fichier les clés utiles qui manquent (elles servent au LOT-02 et au LOT-16). Vérifier aussi que `SEED_DEFAULT_PASSWORD` y figure : le seed s'arrête sans cette clé.
- Les lots continuent en attendant.
