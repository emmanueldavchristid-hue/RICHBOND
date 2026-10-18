# LOT-18 – Durcissement, sauvegardes, guide utilisateur, déploiement

## Sécurité
- En-têtes de sécurité, protection CSRF des actions, limitation des tentatives de connexion, sessions expirées après 8 h d'inactivité.
- Revue complète des permissions par l'agent relecteur (toutes les server actions ont `requireAction` + `requireWritable`).
- `npm audit` sans vulnérabilité haute.

## Données
- Script de sauvegarde PostgreSQL quotidienne (`pg_dump`, conservation 30 jours) + procédure de restauration testée, dans `docs/deploiement.md`.
- Export complet des données en Excel accessible au Responsable (réversibilité : le client garde la maîtrise de ses données).

## Performance et qualité
- Pages principales < 2 s avec 10 000 mouvements et 2 000 articles (seed de charge).
- Accessibilité de base (contrastes, libellés, navigation clavier), affichage tablette vérifié.

## Documentation
- `docs/guide-utilisateur.md` : un chapitre par rôle, avec les parcours du quotidien (destiné à être converti en PDF).
- `docs/deploiement.md` : options d'hébergement (serveur interne du client sous Windows ou Linux, ou VPS), variables d'environnement,
  HTTPS, planification des alertes, sauvegardes, mise à jour de l'application, génération de la clé de licence.

## Recette finale
- Tous les scénarios de `docs/05-scenarios-de-test.md` passent.
- `docs/recette/RECETTE-FINALE.md` : tableau exigence EX-xx → lot → preuve (test, capture) → statut.
