# Blocages en attente d'une action de Jason

Rempli par Claude Code quand un lot ne peut pas avancer sans Jason. Le plus récent en haut.
Format : date · lot · ce qui manque · ce que Jason doit faire exactement · lots qui continuent en attendant.

## Résolu le 2026-10-19 (par Jason)
- `.env.example` reconstruit avec toutes les clés réellement utilisées par le code (DATABASE_URL*, AUTH_*, TZ, SEED_DEFAULT_PASSWORD,
  LICENSE_SECRET, TRIAL_END_DATE, TRIAL_DAYS, CONTACT_EMAIL, CONTACT_PHONE, ALLOW_TEST_NOW/TEST_NOW commentées, CRON_SECRET, SMTP_*, SAGE_*).
  `LICENSE_PUBLIC_KEY` retirée (non utilisée par le code).
- `.env` complété : SEED_DEFAULT_PASSWORD, CONTACT_EMAIL, CONTACT_PHONE ajoutés ; LICENSE_SECRET (64 caractères), TRIAL_DAYS et TZ déjà présents.
- Les dossiers `tests/e2e/_dbg/` et `tests/e2e/_recette/` sont des fichiers de débogage non suivis : à exclure des commits (les ajouter à `.gitignore`).

## 2026-11-01 · Campagne finale (recette B1, B2, B3)
- B1 Codes Sage : obtenir de M. DIBI un extrait reel d une vingtaine de codes articles et fournisseurs Sage, pour valider le format (17/18 caracteres, espaces, "/"). Les regles de validation actuelles ne changent pas avant confirmation du client.
- B2 Alertes : creer la tache planifiee 8h/15h appelant /api/cron/alertes avec CRON_SECRET (voir docs/deploiement.md), puis verifier par curl -i sans cookie (200 ou 401, jamais 307).
- B3 Sauvegardes : tester la restauration sur une base vierge et verifier que le dossier storage/ est inclus dans la sauvegarde.
