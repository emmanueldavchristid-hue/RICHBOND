# LOT-01 – Authentification, rôles, utilisateurs, audit, mise en page

## Objectif
Chaque membre de l'équipe se connecte avec son compte et ne voit que ce qui le concerne.

## Règles
- Rôles : `SUPER_ADMIN`, `RESPONSABLE_ACHATS`, `ACHETEUR`, `MAGASINIER`. Les acheteurs ont un périmètre `LOCAL`, `IMPORT` ou `ALL`.
- Matrice unique `src/lib/permissions.ts` : `can(user, action, resource?)`. Actions nommées `purchaseRequest.create`, `purchaseRequest.approve`,
  `purchaseOrder.approve`, `stock.issue`, `inventory.validate`, `settings.manage`, `license.manage`, etc.
  - Responsable Achats : tout sauf `license.manage`.
  - Acheteur : DA, consultations, BC (création, envoi, relance ; pas de validation), dossiers import, factures, fournisseurs, articles (modification), rapports achats.
  - Magasinier : réceptions, sorties, inventaires (comptage), consultation articles et stock, création de DA de réapprovisionnement. Ne voit pas les prix d'achat sauf PMP en lecture (réglable).
  - Super-admin : comptes, licence, maintenance, tout en lecture.
- Mot de passe : 8 caractères minimum, changement obligatoire à la première connexion, verrouillage 15 min après 5 échecs.
- Le Responsable Achats peut désactiver un compte (jamais supprimer : l'historique doit rester).

## Écrans
- `/connexion` : logo texte RICHBOND, email, mot de passe, message d'erreur clair.
- Mise en page : menu latéral par domaine (Accueil, Achats, Import, Stock, Fournisseurs, Rapports, Paramètres), filtré par rôle ;
  en-tête avec nom, rôle, cloche de notifications (vide pour l'instant), emplacement du badge d'essai (LOT-02), déconnexion.
- `/parametres/utilisateurs` : liste, création, modification (nom, email, rôle, périmètre), réinitialisation du mot de passe, désactivation.
- `/mon-compte` : changer son mot de passe.

## Audit
`audit.log(user, action, entity, id, before?, after?)` appelé par toutes les actions d'écriture. Écran `/parametres/journal` (Responsable, Super-admin) filtrable.

## Seed
Super-admin Jason ; Responsable « François DIBI » ; « Acheteur Local » (LOCAL) ; « Acheteur Import » (IMPORT) ; « Magasinier » ;
emails `@richbond.test`, mot de passe de démo commun documenté dans `README.md`.

## Critères d'acceptation
- [ ] Chaque rôle se connecte et voit un menu différent.
- [ ] Accès direct par URL à une page interdite → page « Accès refusé » (et l'action serveur refuse aussi).
- [ ] Tests unitaires de la matrice : chaque rôle × chaque action sensible.
- [ ] Verrouillage après 5 échecs testé.
- [ ] Création d'utilisateur tracée dans le journal.
