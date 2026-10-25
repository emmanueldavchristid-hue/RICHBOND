# Mode MARATHON – terminer le maximum aujourd'hui

Objectif : une application **livrable au client ce soir**. Chaque lot fusionné dans `main` doit laisser l'application
utilisable en l'état : si le quota s'épuise en cours de route, ce qui est fait est déjà exploitable.
Référence design : `DESIGN.md`. Référence métier : `docs/specs/`.

## Ordre des lots (remplace l'ordre numérique de `docs/03-plan-des-lots.md`)
Priorité = ce dont M. DIBI a besoin pour **utiliser vraiment** l'application, pas pour la regarder.

| Rang | Lot | Pourquoi ce rang |
|---|---|---|
| 1 | **LOT-08** Tableau de bord | Termine le parcours complet ; c'est l'écran d'accueil de la démo |
| 2 | **LOT-09** Import Excel/CSV | Sans lui, impossible de charger les vrais articles et fournisseurs : l'application reste une maquette |
| 3 | **LOT-16** Alertes 8h/15h + notifications | Demande explicite du cahier des charges (EX-64), peu de code, fort effet |
| 4 | **LOT-11** Inventaires hebdomadaires | Le magasinier s'en sert chaque semaine (EX-32) |
| 5 | **LOT-13** Factures et rapprochement | Évite de payer ce qui n'a pas été reçu (EX-25) |
| 6 | **LOT-12** Achats import et frais d'approche | Point douloureux du client (EX-40 à 42), mais plus lourd |
| 7 | **LOT-15** Rapports et KPI | Complète le pilotage (EX-61 à 63) |
| 8 | **LOT-10** Comparatif des offres | Utile mais le client peut démarrer sans (EX-26) |
| 9 | **LOT-14** Évaluation fournisseurs | Demande 12 mois d'historique réel pour avoir du sens (EX-50) |
| 10 | **LOT-18** Durcissement et déploiement | À faire avant l'installation chez le client |
| 11 | **LOT-17** Sage 100 | **Laissé en dernier** : bloqué tant que le client n'a pas donné version, accès et format d'export |

## Règles de vitesse (mode marathon)
- **Tous les sous-agents en `sonnet`**, y compris `chef-de-projet` : plan en 10 lignes maximum, pas d'analyse longue.
- `dev-backend` et `dev-frontend` **en parallèle** dès le schéma Prisma posé.
- **Tests unitaires : règles critiques seulement** (calculs, transitions de statut, droits, licence).
- **Playwright : un seul scénario par lot.** La suite complète ne tourne **qu'une fois**, au tout dernier lot fait.
- **Pas de captures d'écran par lot.** Une seule campagne de captures à la fin.
- **Pas de recette métier ni de relecture par lot.** Une recette globale + une relecture sécurité **après le LOT-13**, puis à la fin.
- Ne lire que les fichiers du lot en cours. Pas de relecture du code existant.
- Commits courts, fusion dès que lint + typecheck + tests du lot sont verts.

## À chaque fin de lot (obligatoire, 3 lignes)
Mettre à jour `docs/03-plan-des-lots.md` et `docs/journal.md`, fusionner dans `main`, `git push`,
puis **passer immédiatement au lot suivant** sans me demander.

## Non négociable même en marathon
Droits vérifiés côté serveur, garde de licence sur les écritures, stock modifié uniquement par mouvements,
numérotation transactionnelle, aucune donnée réelle dans le dépôt, lint et typecheck verts avant chaque fusion.

## Si le quota s'épuise ou la connexion coupe
Relire ce fichier, `docs/03-plan-des-lots.md`, `git status`, `git log --oneline -10`.
Terminer proprement le lot en cours (fusion incluse), puis continuer dans l'ordre du tableau ci-dessus.

## Quand les lots 1 à 10 sont faits
Lancer la campagne finale : suite e2e complète, recette métier globale, relecture sécurité, corrections,
captures dans `docs/captures/`, `docs/demo-1.md`, `docs/guide-utilisateur.md`, puis écrire « PROJET PRÊT » avec
la liste de ce qui reste ouvert (LOT-17 Sage et les hypothèses à confirmer).
