# Recette LOT-02 – Période d'essai, compte à rebours, licence

- Date : 19/10/2026
- Branche : `lot/02-periode-essai` (dernier commit `de29dc3`). Pendant la recette, l'arbre de travail contenait aussi des modifications non commitées dans `tests/e2e/helpers/license.ts` et `S0-2-essai.spec.ts`, faites par un autre agent.
- Recetteur : agent recette métier (ancien Responsable Achats)
- Périmètre : `docs/specs/LOT-02-periode-essai.md` et EX-05. J'ai relu la recette de deux points de vue : M. DIBI en essai (et les autres rôles), puis Jason quand il active la licence. Aucun fichier `.env*` n'a été lu.
- Contrôles lancés :
  - `npm test` : 20 fichiers, 319 tests verts ;
  - `npm run typecheck` : OK ;
  - `npm run lint` : 0 erreur, 2 avertissements ;
  - `S0-2-essai.spec.ts` : 36/36 verts, en desktop et sur tablette iPad paysage ;
  - un parcours Playwright de recette sur tablette, avec captures d'écran à J-30, J-5, le dernier jour à 16 h 30, à J+2 (échéance passée), puis activation.

## Verdict : **Accepté avec réserves**

Le lot est solide et le ton est professionnel. Le compte à rebours est lisible, sa couleur change bien selon l'échéance, et la date de fin est écrite en toutes lettres (« mercredi 18 novembre 2026 »).

À l'échéance, l'application passe en consultation seule sans brutalité :
- la connexion reste possible ;
- un bandeau rouge sobre s'affiche ;
- une fenêtre rassure l'utilisateur : « aucune donnée n'a été supprimée » ;
- les boutons d'écriture sont grisés et une infobulle explique pourquoi ;
- le serveur refuse réellement les écritures.

Le statut est calculé côté serveur. Une protection empêche de gagner du temps en reculant l'horloge, et la licence est tracée dans le journal sans jamais y écrire la clé. Rien ne bloque la démo à M. DIBI.

Deux réserves concernent surtout le jour de l'activation chez le client (I1, I2). Une troisième (I3) concerne la communication avec M. DIBI une fois l'essai expiré.

## Critères d'acceptation

| # | Critère | Résultat | Preuve |
|---|---|---|---|
| 1 | Tests unitaires du statut et du temps restant (fuseau, dernier jour, échéance passée) | OK | `tests/unit/licensing.state.test.ts` couvre plusieurs cas. La borne est stricte : à 23:59:59.998 l'essai est en cours, à 23:59:59.999 il est terminé. Le calcul ne dépend pas de `process.env.TZ`. Le test couvre aussi les rappels, les tons, le format `12 j 05 h 32 min`, le badge du dernier jour avec les heures restantes, `TRIAL_END_DATE` et `TRIAL_DAYS`, et l'anti-recul d'horloge. `tests/unit/clock.test.ts` vérifie que `TEST_NOW` est ignorée en production. |
| 2 | Licence expirée : une création de DA est refusée côté serveur, un export reste possible | OK (par procuration) | Le module DA n'existe pas encore (LOT-04). `tests/integration/licensing.test.ts` utilise l'action `purchaseRequest.create`, enveloppée par `withAction`. Elle est refusée avec le message exact de la spec, et rien n'est écrit. Une action de lecture/export reste autorisée. En E2E, l'appel direct d'une vraie action serveur (création d'utilisateur) est refusé, et aucun compte n'est créé. **À rejouer au LOT-04 avec la vraie création de DA et un vrai export.** |
| 3 | Clé valide → ACTIVE ; clé invalide → message, statut inchangé | OK | Test d'intégration : la clé valide est acceptée même en minuscules, seule l'empreinte sha256 est stockée, et l'audit ne contient pas la clé. Une clé invalide donne « Clé de licence invalide. », le statut ne change pas et l'échec est tracé. Une 6e tentative est bloquée 15 min. Les autres rôles reçoivent `FORBIDDEN`. Rejoué en E2E et dans mon parcours sur tablette. |
| 4 | Playwright : fenêtre à la connexion, couleur du badge selon la date simulée (`TEST_NOW`) | OK | S0.2 couvre :<br>- J-30 et J-8 : neutre ;<br>- J-7 et J-3 : orange ;<br>- J-2, J-1 et le dernier jour à 18 h : rouge.<br>Ces cas passent en desktop et sur tablette. La fenêtre s'affiche une fois par session pour les 5 rôles, et le badge la rouvre. Le cookie `rb-test-now` est bien lu côté serveur. |
| 5 | Aucune donnée supprimée ni masquée à l'expiration | OK | En E2E, le nombre d'utilisateurs et de lignes d'audit ne baisse pas, et tous les comptes restent visibles. Le Magasinier consulte le stock. Dans mon parcours, le journal, Mon compte et la liste des utilisateurs restent consultables. Le statut EXPIRED n'est jamais enregistré en base : une prolongation remet donc l'essai en cours. |

## Ce que voit l'utilisateur (vérifié sur tablette)

- **Fenêtre « Version d'essai »**
  - Remerciement, date de fin en toutes lettres, gros compte à rebours (« 30 j 22 h 38 min »), barre « x % de la période d'essai écoulée », gros bouton « Continuer ».
  - Le dernier jour, le compte à rebours passe en rouge : « 7 h 29 min ».
  - Le ton est juste : pas de menace, pas de jargon.
- **Badge dans l'en-tête**
  - « Essai : 5 j restants » en orange, puis « Essai : se termine dans 7 h 29 min » en rouge le dernier jour, puis « Consultation seule ».
  - Il est assez grand pour le doigt (44 px de haut).
- **Après l'échéance**
  - Bandeau rouge « Période d'essai terminée – consultation seule » avec un lien « En savoir plus ».
  - La fenêtre explique la situation en 3 points : rien n'est supprimé ; on peut consulter, imprimer et exporter ; il faut contacter Christ-Emmanuel Mouhi.
  - « Nouvel utilisateur » et « Modifier » sont grisés. Sur tablette, l'infobulle s'ouvre au premier toucher.
- **Pour Jason, page `/parametres/licence`**
  - L'état est clair : statut, début, fin, temps restant.
  - Prolongation par date, avec confirmation si la nouvelle date raccourcit l'essai.
  - Activation par clé, avec confirmation « définitive ».
  - Ensuite, la page n'affiche plus que « Licence active – RICHBOND CI – activée le 20/11/2026 ». Le badge et le bandeau disparaissent pour tous les utilisateurs.

## Anomalies

### Bloquant
Aucune.

### Important
- **I1 – L'activation échoue si le bénéficiaire n'est pas saisi exactement comme lors de la génération, et le message ne dit pas pourquoi.**
  - Constat : « Richbond CI » au lieu de « RICHBOND CI » donne « Clé de licence invalide. » (capture du parcours).
  - Risque : le jour J, devant le client, Jason peut griller ses 5 essais et être bloqué 15 min.
  - Correction possible :
    - normaliser le bénéficiaire (majuscules, espaces) dans `generateLicenseKey` et `verifyLicenseKey`, ou bien le verrouiller en lecture seule à « RICHBOND CI » ;
    - et préciser le message : « Clé invalide pour ce bénéficiaire : vérifiez le nom exact (majuscules, espaces) et la clé. ».
- **I2 – Aucun moyen de rattraper une horloge serveur partie dans le futur.**
  - Constat : l'anti-recul retient `lastSeenAt`. Si l'horloge du poste serveur est réglée par erreur en 2027 (BIOS, mauvaise saisie), puis corrigée, l'essai reste expiré.
  - La prolongation ne l'efface pas : `extendTrial` ne remet pas `lastSeenAt` à zéro, et sa date « aujourd'hui » est calculée avec l'heure réelle, pas avec l'heure effective.
  - Il ne reste que l'activation définitive, ou une intervention en base.
  - Correction proposée : la prolongation par le Super-admin remet `lastSeenAt` à l'heure courante (c'est une action tracée et volontaire).
- **I3 – La fenêtre « Période d'essai terminée » ne donne aucun moyen de contact.**
  - Constat : elle dit « contactez Christ-Emmanuel Mouhi », sans téléphone ni email.
  - M. DIBI connaît Jason, mais un magasinier ou un acheteur bloqué un lundi matin ne saura pas qui appeler.
  - Correction proposée : ajouter un téléphone ou un email paramétrable (variable non secrète). Il n'y a pas de numéro réel à mettre dans le dépôt : à noter « à confirmer ».

### Confort
- **C1 – Les jours de rappel (J-7, J-3, J-1, J0), la fenêtre peut s'afficher deux fois dans la même session.**
  - À la connexion, la clé « vue dans la session » est posée, mais pas la clé du jour de rappel. La fenêtre se rouvre donc au premier rechargement complet de la page (F5).
  - Correction proposée : poser aussi la clé du jour lors de la première ouverture.
- **C2 – La barre de progression reste noire même quand le compteur est rouge.** La colorer selon le ton (orange, rouge) rendrait l'urgence lisible d'un coup d'œil.
- **C3 – Le badge rouge du dernier jour est long : « Essai : se termine dans 7 h 29 min ».** Il passe sur iPad paysage, mais sur une tablette en portrait l'en-tête risque d'être serré. « Fin dans 7 h 29 » suffirait.
- **C4 – En consultation seule, le Responsable peut encore désactiver un compte et réinitialiser un mot de passe.** Ce choix est volontaire et documenté (A9 / I1 du LOT-01 : actions de sécurité). Il est cohérent, mais à valider avec M. DIBI : la mention « consultation seule » du bandeau n'est alors pas tout à fait exacte.
- **C5 – Le compte à rebours affiche « 30 j 22 h » le premier jour d'un essai de « 30 jours ».** L'essai court jusqu'à 23 h 59 du 30e jour. C'est plus généreux que prévu et ce n'est pas gênant, mais il faut le dire à M. DIBI pour éviter une question.
- **C6 – Le nom « Licence » apparaît comme une entrée de menu séparée, sous Paramètres, pour le Super-admin.** C'est correct, puisque le menu est invisible pour les autres rôles.

## Idées d'amélioration à forte valeur

1. **Garde-fou automatique sur les boutons d'écriture** (dès le LOT-03 ou le LOT-04) : une règle de lint ou un test qui signale tout `<Button>` déclenchant une action serveur d'écriture sans passer par `<WriteButton>`. Les écrans métier vont se multiplier, et le serveur ne protège que la donnée, pas l'expérience : un bouton actif qui renvoie une erreur ferait mauvais effet.
2. **Bilan d'essai sur la fenêtre des derniers jours** (J-3, J-1, J0) : « Pendant l'essai : 42 DA, 18 BC, 25 réceptions saisies ». Rappeler à M. DIBI ce qu'il a déjà construit est l'argument d'activation le plus fort. À brancher quand les LOT-04 à LOT-06 existeront.
3. **Export complet en un clic, même en consultation seule** (LOT-09 ou LOT-16) : un classeur Excel de toutes les données (DA, BC, réceptions, stock). Il rend concrète la promesse « rien n'est perdu », et rassure un Responsable Achats qui doit rendre des comptes à sa direction.

## Note de recette
Pour mon parcours sur tablette, j'ai créé deux scripts temporaires dans `tests/e2e/_recette/`. Leur suppression m'a été refusée par l'environnement : il faut supprimer ce dossier (non suivi par git) avant le commit. Je n'ai modifié aucun fichier de code.
