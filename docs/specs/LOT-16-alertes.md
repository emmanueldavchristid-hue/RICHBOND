# LOT-16 – Alertes 8h / 15h et centre de notifications

## Objectif
Chaque utilisateur reçoit deux fois par jour le point de ce qui demande son attention, sans aller le chercher.

## Règles
- Tâche `/api/cron/alertes` protégée par `CRON_SECRET`, exécutée à **8h00 et 15h00** (Africa/Abidjan), idempotente (pas de doublon si appelée deux fois).
- Contenu par rôle :
  - Responsable : DA et BC à valider, factures à mettre en bon à payer, risques de rupture sur articles critiques, BC en retard, jalons import en retard.
  - Acheteurs : BC à relancer, BC sans confirmation depuis 3 jours, offres attendues dont la date limite est passée, dossiers import (jalons du jour), échéances de factures.
  - Magasinier : réceptions attendues, articles sous seuil, inventaire à faire, réceptions non validées.
- Une notification « digest » par utilisateur et par passage, avec liens directs. Les alertes urgentes (DA « Arrêt de production », rupture d'un article critique) sont envoyées immédiatement en plus.
- Centre de notifications : cloche avec compteur, liste, marquer comme lu, filtre par gravité. Bandeau à la connexion si alertes critiques non lues.
- Option prévue (désactivée par défaut) : copie par email (SMTP du `.env`).
- Documenter dans `docs/deploiement.md` comment planifier les appels (cron Linux, Planificateur de tâches Windows avec `curl`, ou cron de l'hébergeur).

## Critères d'acceptation
- [ ] Tests : contenu par rôle, idempotence, fuseau horaire.
- [ ] Route refusée sans le bon secret.
- [ ] Scénario S7 (docs/05) passe.
