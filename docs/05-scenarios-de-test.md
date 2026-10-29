# Scénarios de test du workflow (multi-rôles)

Joués par l'agent **testeur-workflow** (Playwright, `tests/e2e/scenarios/`) et vérifiés par l'agent **recette-metier**.
Chaque scénario se joue avec les comptes du seed, en changeant d'utilisateur à chaque étape. Une date simulée (`TEST_NOW`) est utilisée quand le temps compte.
Un scénario n'est activé qu'une fois son lot terminé ; il doit ensuite rester vert pour toujours (non-régression).

## S0 – Accès et essai (LOT-01, LOT-02)
1. Chaque rôle se connecte, voit son menu, la fenêtre d'essai et le badge.
2. Le magasinier tente d'ouvrir `/parametres/utilisateurs` → accès refusé.
3. Avec `TEST_NOW` après la fin d'essai : connexion OK, bandeau rouge, création de DA refusée, export autorisé.
4. Le super-admin saisit une clé valide → plus de badge, création de DA possible.

## SR1 à SR6 – Référentiels (LOT-03)
Joués en desktop et en tablette (`tests/e2e/scenarios/SR-referentiels.spec.ts`). Chaque scénario vérifie l'interface **et** l'effet en base (fiche créée, historique de prix, journal d'audit, statut).

### SR1 – Acheteur import : fournisseur Chine, article PDR et historique de prix
1. Acheteur import crée le fournisseur « Shenzhen … » (Import, Chine, CNY, FOB, 2 contacts) : code `FRS-xxxxx` généré, 2 contacts en base, trace au journal.
2. Il crée l'article PDR critique « Roulement 6308 » (équipement « Ligne mousse continue », achat CARTON de 10 U) avec ce fournisseur principal : code `ART-xxxxx`, aperçu « 1 Carton = 10 U », lien fournisseur créé automatiquement.
3. Il saisit le prix en CNY puis le modifie : l'onglet « Historique des prix » montre les deux prix avec le taux et l'équivalent FCFA ; 2 lignes en base.
4. La fiche fournisseur liste l'article (« Articles fournis »).

### SR2 – Magasinier sur tablette : consultation sans écriture ni prix (H13)
1. Tablette. Magasinier filtre les articles « PDR » + « Critique » + équipement « Ligne mousse continue » et ouvre la fiche « Roulement 6308 ».
2. Aucun bouton d'écriture, fiche en lecture seule, ni onglet de prix, ni prix dans les données envoyées au navigateur ; `/fournisseurs` et l'export des fournisseurs sont refusés.
3. Le Responsable active « Afficher les prix d'achat au Magasinier » : le Magasinier voit alors les prix ; le réglage est ensuite remis à zéro.

### SR3 – Blocage et déblocage d'un fournisseur
1. Acheteur : le motif est obligatoire (5 caractères minimum) ; il bloque un fournisseur qui est principal d'articles actifs : avertissement avec la liste des articles, bandeau rouge avec le motif, statut « Bloqué » en base.
2. L'Acheteur ne peut pas débloquer (message « Seul le Responsable Achats peut débloquer »). Le fournisseur bloqué n'est plus proposé comme fournisseur principal d'un nouvel article.
3. Responsable : débloque ; statut « Actif », motif effacé de la fiche, blocage et déblocage tracés au journal ; le fournisseur est de nouveau proposé.

### SR4 – Listes : recherche, tri, filtres, pagination, export
1. Articles : « 1–25 sur N », page 2, tri par désignation (croissant puis décroissant), recherche par désignation et par référence fournisseur, filtres catégorie et famille, résultat vide, réinitialisation, état dans l'URL.
2. Export Excel des articles avec un filtre : fichier `articles_AAAAMMJJ.xlsx`, lignes = lignes de la liste filtrée.
3. Fournisseurs : filtres type/pays/statut, tri, export Excel (lignes = liste).
4. Recherche tapée puis clic immédiat (moins de 300 ms) sur une ligne : la fiche s'ouvre et on n'est pas ramené à la liste.

### SR5 – Essai expiré : consultation et export seulement
1. `TEST_NOW` après la fin d'essai : listes articles et fournisseurs consultables, export Excel téléchargeable.
2. « Nouvel article », « Nouveau fournisseur », « Enregistrer », « Bloquer », « Saisir un taux » et « Enregistrer » des réglages sont désactivés.

### SR6 – Devises et taux de change
1. Le Responsable voit XOF « devise de base » et les taux EUR/USD/CNY du seed, sans alerte.
2. Taux EUR différent de 655,957 : confirmation demandée ; annuler n'enregistre rien ; confirmer enregistre. Taux USD avec virgule accepté ; doublon de date refusé.
3. Acheteur : peut saisir un taux mais ni créer une devise ni ouvrir les dépôts.
4. `TEST_NOW` à +45 jours : alerte « taux ancien » pour chaque devise ; la saisie d'un taux du jour retire l'alerte de cette devise.

## Non-régression S0 (LOT-01, LOT-02)
La suite `npm run test:e2e` rejoue S0.1 et S0.2 après chaque lot ; elles doivent rester vertes.

## S1 – Achat local standard (LOT-04, 05, 06)
1. Magasinier : DA « fourniture de bureau » (Administration), 2 lignes, urgence Normale → soumise.
2. Responsable : voit la DA dans « À valider », réduit une quantité, valide.
3. Acheteur local : notifié ; crée le BC pour le fournisseur principal.
4. Responsable : valide le BC → numéro `BC-AAAA-xxxxx` attribué ; PDF téléchargeable.
5. Acheteur : marque le BC envoyé puis confirmé avec une date promise.
6. Magasinier : réceptionne la totalité → stock augmenté, PMP mis à jour, BC « Reçu ».

### S1 (partie automatisée, LOT-04) – Étapes 1 et 2 + notification de l'étape 3
Fichier `tests/e2e/scenarios/S1-da.spec.ts`, joué en desktop et en tablette. Les étapes 3 (BC) à 5 sont automatisées par le LOT-05 (ci-dessous) ; l'étape 6 (réception) est ajoutée par le LOT-06 (voir plus bas).

### S1 étendu (partie automatisée, LOT-05) – Étapes 3 à 5 : du BC à la confirmation
Fichier `tests/e2e/scenarios/S1-bc.spec.ts`, joué en desktop et en tablette. Il rejoue d'abord les étapes 1 et 2 (DA du Magasinier validée par le Responsable, toner réduit à 1) pour partir d'une DA neuve.
3. Acheteur local : notification, fiche DA (aucun BC lié, bouton « Créer le BC ») puis écran « À commander » avec les 2 lignes pré-cochées et le fournisseur principal (PAPETERIE MODERNE ABIDJAN), puis brouillon : lignes en cartons, allocations rattachées à la DA, adresse du dépôt reprise. Prix saisis (toner +30 % par rapport au dernier prix connu), « Enregistrer et soumettre » : BC « À valider » libellé `BC-BROUILLON-…`, sans numéro, DA toujours « Validée » et affichant le BC dans « Commandes liées ».
4. Responsable : notification et pastille d'accueil « BC à valider », onglet « À valider », alerte de prix visible sur la fiche, aperçu PDF filigrané « NON VALIDÉ » sans numéro. Il valide : numéro `BC-AAAA-NNNNN` attribué (unique), statut « Validé », DA « Commandée », historique de prix alimenté, audit `PO_APPROVE`. Le PDF `BC-AAAA-NNNNN-v1.pdf` est téléchargeable et son texte contient le numéro, le fournisseur et le total TTC (calculé sur les prix saisis). Le créateur de la DA et celui du BC sont notifiés ; l'acheteur ne voit aucun bouton de validation.
5. Acheteur local : « Marquer comme envoyé » (PDF et texte d'accompagnement citant le numéro), envoi par WhatsApp enregistré. La confirmation exige une date promise (refus sans date), puis le BC passe à « Confirmé » ; date promise, 1re date promise et date attendue enregistrées, audits `PO_SEND` et `PO_CONFIRM` ; le BC apparaît dans « En cours » sans badge de retard.

## SC1 à SC6 – Cas particuliers des bons de commande (LOT-05)
Fichier `tests/e2e/scenarios/SC-commandes.spec.ts`, joué en desktop et en tablette. Chaque scénario vérifie l'interface et l'effet en base (statut, numéro, DA, événements, audit, notifications).

### SC1 – Fournisseur bloqué refusé
1. Une DA locale de rame de papier est validée ; le fournisseur principal est bloqué : « À commander » affiche l'avertissement et désactive « Créer le BC » ; le formulaire ne propose plus ce fournisseur.
2. Débloqué, l'acheteur crée et soumet le BC ; le fournisseur est bloqué entre-temps : la validation du Responsable est refusée (« … est bloqué : aucun bon de commande possible »), le BC reste « À valider » sans numéro, la DA reste « Validée ».

### SC2 – Regroupement de 2 DA, commande partielle, annulation
1. Deux DA (10 et 6 cartons) validées ; « À commander » les regroupe chez le même fournisseur ; la 2e est commandée à hauteur de 2 seulement : une ligne de BC de 12 cartons rattachée aux deux DA (allocations 10 + 2).
2. Validation : DA A « Commandée », DA B « Partiellement commandée » (2 commandés, 4 restants).
3. Le Responsable annule le BC validé (motif obligatoire) : numéro conservé, les 2 DA redeviennent « Validée », l'acheteur est notifié « DA-… rouverte : BC-… annulé ».

### SC3 – BC en retard, relance, report de la date promise (`TEST_NOW`)
1. Le Responsable passe une commande directe (motif), la valide, l'envoie ; le fournisseur confirme à J+2 : le BC n'est pas en retard.
2. `TEST_NOW` à J+6 : onglet « En retard » (« En retard de 4 j »), bandeau de retard sur la fiche, pastille d'accueil, indicateur « À relancer ».
3. L'acheteur local relance : texte prêt à copier (numéro, retard, quantité restante), moyen obligatoire, texte copié dans le presse-papiers, relance enregistrée (compteur, événement `REMINDED`, audit `PO_REMIND`), l'indicateur « À relancer » disparaît.
4. Le Responsable reporte la date promise : motif obligatoire, 1re date conservée, glissement compté (« Reportée 1 fois »), le BC sort de « En retard ».

### SC4 – Avenant et abandon d'avenant
1. BC validé et envoyé ; « Créer un avenant » (motif obligatoire) : version 2 en brouillon, même numéro, fournisseur verrouillé.
2. Quantité 5 puis 8, soumission, validation : « BC-AAAA-NNNNN v2 », statut « Validé » (à renvoyer au fournisseur), versions 1 et 2 listées ; PDF v1 (77 500 FCFA) et v2 (124 000 FCFA) distincts avec le même numéro.
3. Un second avenant (20 cartons) est abandonné : le BC retrouve exactement la version 2 validée (quantité 8), événement `AMENDMENT_ABANDONED`.

### SC5 – Magasinier sans accès aux BC
Le Magasinier n'a ni lien de menu ni pastille d'accueil ; liste, fiche, « À commander » et « Nouveau BC » mènent à « Accès refusé » ; le PDF et l'export Excel des BC répondent 403 ; sa fiche DA n'a ni « Créer le BC » ni lien vers un BC.

### SC6 – Essai expiré : consultation, PDF et export seulement
Après la fin d'essai (`TEST_NOW`) : liste et fiche des BC consultables ; « Nouveau BC », « Valider », « Refuser », « Renvoyer », « Confirmer », « Créer un avenant », « Commenter » et « Relancer » désactivés ; PDF et export Excel des commandes servis (200) ; aucun changement en base.
1. Magasinier : DA « fourniture de bureau » (Administration, Rame papier A4 ×10, Toner ×2, Normale) ; il ne voit ni prix ni désignation libre ; soumise → numéro `DA-AAAA-NNNNN`, statut « À valider », DA de réappro « À définir », 1 audit `PR_SUBMIT`.
2. Responsable : notifié (cloche), voit la DA dans « À valider » avec le compteur, ouvre la fiche, choisit le type Local, réduit le toner de 2 à 1, valide → « Validée », quantité validée « modifié », événement `QTY_CHANGED`, audit, acheteur local assigné automatiquement.
3. Acheteur local (notification seulement) : cloche « DA-… validée et assignée à vous », DA dans « Assignées à moi », aucun bouton de validation.

## SD1 à SD5 – Cas particuliers des demandes d'achat (LOT-04)
Fichier `tests/e2e/scenarios/SD-demandes.spec.ts`, joué en desktop et en tablette. Chaque scénario vérifie l'interface et l'effet en base (statut, priorité, événements, audit, notifications).

### SD1 – Arrêt de production
1. Acheteur local : DA « Arrêt de production » (Maintenance, Roulement 6308) ; la date de besoin passe à aujourd'hui ; soumise → priorité 0, alerte rouge sur la fiche.
2. Responsable : bandeau rouge « Arrêt de production : DA-… à valider » sur toutes les pages, notification de gravité CRITIQUE.
3. La DA est en tête de « À valider » (ligne surlignée, avant urgentes et normales), même avec un tri par date décroissante.
4. Le Responsable valide depuis le bandeau : le bandeau de cette DA disparaît ; l'acheteur assigné reçoit une notification CRITIQUE.

### SD2 – Retour « à compléter », resoumission, refus
1. Acheteur import soumet une DA ; le Responsable la renvoie « à compléter » (commentaire obligatoire) ; l'acheteur est notifié et lit le commentaire.
2. L'acheteur corrige et resoumet : même numéro DA, une seule DA en base, événements `RETURNED` puis `RESUBMITTED`.
3. Le Responsable refuse (motif de 5 caractères minimum obligatoire) ; l'acheteur est notifié, le motif est affiché, la DA est définitivement fermée (aucun bouton d'action).

### SD3 – Doublon
1. Acheteur local soumet 5 « Cutter de découpe ».
2. Acheteur import saisit une 2e DA avec le même article : avertissement non bloquant « Déjà demandé : DA-…, 5 …, besoin le JJ/MM » avant l'envoi ; la DA peut être soumise.
3. Le Responsable retrouve le rappel sur la fiche ; une fois la 1re DA annulée, le rappel disparaît.

### SD4 – Validation groupée sur tablette
1. Acheteur local soumet 3 DA locales.
2. Responsable (tablette) coche les 3 DA, « Valider la sélection (3) », récapitulatif puis confirmation : « 3 validées, 0 écartée par le contrôle ».
3. Les 3 DA sont validées, assignées à l'acheteur local, tracées (1 audit chacune), notifiées ; elles quittent « À valider » et apparaissent dans « Assignées à moi ».

### SD5 – Essai expiré : consultation et export seulement
1. Une DA est soumise avant l'expiration ; `TEST_NOW` après la fin d'essai : connexion OK, bandeau « lecture seule ».
2. Liste et fiche consultables ; « Nouvelle DA », « Valider », « Refuser », « Renvoyer à compléter » désactivés avec infobulle ; la DA reste « À valider ».
3. Export Excel `demandes_AAAAMMJJ.xlsx` téléchargeable (contient la DA) ; « Tout marquer lu » dans la cloche reste autorisé.

## S2 – Réception partielle, refus et facture (LOT-06, 13)
1. BC de 100 unités. Réception 1 : 60 livrées, 55 acceptées, 5 refusées (« Abîmé ») → non-conformité créée, BC partiellement reçu.
2. Réception 2 : 40 livrées acceptées → BC reçu.
3. Acheteur : facture de 100 unités → rapprochement en ÉCART (95 reçues acceptées) ; facture corrigée à 95 → CONFORME → Responsable : bon à payer.

### S1 étape 6 et S2 (parties automatisées, LOT-06, EX-24)
- **S1 étape 6** (suite de `tests/e2e/scenarios/S1-bc.spec.ts`) : le Magasinier ouvre la saisie du BC (par son lien : le BC est promis à J+10, hors de la semaine affichée), voit les restants dus sans prix, « Tout accepter », N° de BL, validation. Vérifié en base : rame 10 cartons = 50 U et toner 1 entrés en stock, PMP recalculé à partir du stock existant, BC « Reçu », audit `RECEIPT_CREATE`; l'acheteur voit la réception sur la fiche du BC.
- **S2** (`tests/e2e/scenarios/S2-reception.spec.ts`, desktop et tablette, champs et boutons de saisie >= 44 px). Trois tests, chacun avec son propre BC de 100 « Toner imprimante » (48 750 FCFA, prix atypique pour détecter toute fuite vers le Magasinier) :
  1. Étapes 1 et 2 : réception 1 de 60 livrées, 55 acceptées, 5 refusées « Abîmé » (contrôles du N° de BL et du motif, NC `NC-AAAA-NNNNN` ouverte, stock +55 au coût du BC, PMP, BC « Partiellement reçu », restant dû 45) ; sur-livraison à 46 bloquée pour le Magasinier ; réception 2 de 45 → « Bon soldé », BC « Reçu », stock +100 ; le Responsable est notifié du refus ; l'acheteur décide « Remplacement » (NC clôturée, audit `NC_DECIDE`). Le Magasinier ne voit aucun prix (texte et code de la page).
  2. Contre-passation et reliquat : réceptions 55 puis 40 ; ni Magasinier ni acheteur ne contre-passent ; le Responsable est refusé si le stock a été sorti (simulé en base), puis contre-passe REC2 (mouvements inverses, stock, PMP, quantités du BC et statut revenus, audit `RECEIPT_CANCEL`) ; l'acheteur solde le reliquat de 45 (motif obligatoire) → BC « Reçu », audit `PO_CLOSE_REMAINDER` ; la contre-passation de REC1 est alors refusée.
  3. Essai expiré : réceptions consultables ; « Valider la réception », « Contre-passer », « Décider » et « Solder le reliquat » désactivés ; rien ne change en base.
- **S2 – facture** (`tests/e2e/scenarios/S2-facture.spec.ts`, desktop, LOT-13) : BC de 100 toners reçu en totalité ; l'acheteur saisit la facture 1 (50 au prix du BC, ligne pré-remplie depuis la réception) → CONFORME ; un doublon (même fournisseur, même n° à la casse et aux espaces près) est refusé ; la facture 2 (50 restants à +5 %) → ÉCART (ligne `ECART_PRIX`).
  L'acheteur n'a aucun bouton « Bon à payer » ; le Responsable le donne sur la conforme sans motif, et sur l'écart seulement avec un motif de dérogation (obligatoire), tracé en base et dans l'audit.
  Le bouton « Exporter les écarts » télécharge `factures-ecarts_*.xlsx`.
- Hors périmètre automatisé (couvert par les tests d'intégration) : sur-livraison forcée par le Responsable, retour fournisseur (P2), écart de quantité et facturation partielle (tests du rapprochement).
- Seed : le BC `lot05:11` est reçu en totalité et `lot05:06` partiellement reçu avec une NC ouverte (réceptions `BL-DEMO-0001/0002`) ; les scénarios existants n'en dépendaient pas, le scénario « essai expiré » de S2 s'appuie sur `BL-DEMO-0002` en lecture seule.

## S3 – Rupture anticipée et réappro (LOT-07)
1. Article critique avec consommation régulière sur 90 jours ; sorties jusqu'à passer sous le point de commande.
2. L'article apparaît dans « Risques de rupture » (tableau de bord Responsable) et dans `/stock/reappro`.
3. Magasinier : génère la DA depuis la liste → DA soumise avec la quantité suggérée.
4. Sortie supérieure au stock refusée avec message clair.

### S3 – partie automatisée (LOT-07, EX-31)
Fichier `tests/e2e/scenarios/S3-reappro.spec.ts` (+ `tests/e2e/helpers/stock.ts`), joué en desktop et en tablette. Article : « Roulement 6205 » du seed (PDR critique, 25 U au Magasin PDR, point de commande 40 U, délai 20 jours, consommation régulière sur 6 mois). Arrangement : les DA ouvertes du seed qui portent l'article sont mises de côté pendant le test (sinon l'article serait déjà « DA en cours »), puis rétablies ; les DA de réappro créées par le test sont annulées.
1. **Constat** (Magasinier) : `/stock/articles` montre l'article avec une couverture rouge ; « Recalculer » (ABC) absent pour le Magasinier.
2. **Sortie refusée** : formulaire vide (4 messages de champs obligatoires) ; quantité supérieure au stock : « Stock insuffisant : N U disponibles », validation bloquée, aucun mouvement ; si le stock a baissé entre-temps (écart simulé en base), le serveur refuse avec « Stock insuffisant : 3 U disponibles au dépôt MAGASIN PDR » et rien n'est écrit.
3. **Sortie valide** de 2 U (machine obligatoire pour une PDR ; champs tactiles >= 44 px en tablette) : bon `SOR-AAAA-NNNNN` « Validée », stock -2, un mouvement `SORTIE` de -2 (valeur négative, stock après), audit `STOCK_ISSUE_CREATE`, ligne dans `/stock/mouvements`.
4. **Réappro** : l'article est sur `/stock/reappro` (couverture rouge, point de commande 40 U, sans DA en cours). « Créer les DA » refuse 0 article et une quantité nulle ; avec l'article seul, une DA `REAPPRO` au statut `SOUMISE` à la quantité suggérée (audit, notification au Responsable) ; l'article est ensuite signalé « DA-… en cours » et décoché.
5. **Transfert** (Magasinier, depuis la fiche de stock) : quantité excessive refusée ; 2 U PDR vers MAGASIN CENTRAL : deux mouvements `TRANSFERT` (-2 / +2) liés par `TRF-AAAA-NNNNN`, stocks par dépôt à jour, fiche de stock à jour.
6. **Ajustement** : aucun bouton pour le Magasinier (fiche de stock et Mouvements). Responsable : motif obligatoire (5 caractères), puis -1 U : mouvement `AJUSTEMENT` `AJU-AAAA-NNNNN`, audit `STOCK_ADJUST`. Le Responsable consulte la sortie avec sa valeur et peut l'annuler ; « Recalculer » l'ABC est tracé (`ITEM_ABC_RECOMPUTE`) ; « Appliquer les valeurs suggérées » lui est réservé.
7. **Essai expiré** : stock, sorties, mouvements, réappro consultables ; « Nouvelle sortie », « Valider la sortie », « Transfert », « Créer les DA », « Ajuster le stock », « Recalculer » désactivés ; rien ne change en base.
- Le PMP et la valeur sont visibles du Magasinier (droit `price.viewPmp`), jamais le prix d'achat. Le test « 2 sorties parallèles sur le dernier stock » reste couvert par les tests d'intégration. Le tableau de bord « Risques de rupture » arrive avec le LOT-08.

## S-dashboard – Tableau de bord d'accueil par rôle (LOT-08, EX-60)
Fichier `tests/e2e/scenarios/S-dashboard.spec.ts`, joué en desktop et en tablette (4 scénarios x 2 projets). Les compteurs affichés sont comparés à la base, jamais à des valeurs figées.
1. **Responsable** : cartes à traiter (DA à valider, BC à valider, non-conformités ouvertes = base), 6 KPI du mois (FCFA, %), 3 graphiques dessinés, risques de rupture avec le Roulement 6205 visible et sans article à couverture confortable (Roulement 6308). Clic sur « DA à valider » : onglet « à valider » de la liste des DA (même compteur) ; « BC en retard » : onglet « en retard » des BC ; « Non-conformités » et « Risques de rupture » : écrans correspondants.
2. **Acheteur local** : uniquement ses DA assignées et ses BC (jamais ceux de l'autre acheteur), ni KPI ni graphiques du Responsable ; bouton « Relancer » sur son BC en retard : ouvre la fenêtre de relance, rien n'est écrit sans confirmation ; clics sur « Mes DA » (onglet assignées) et « BC en retard » (filtre `acheteur=`).
3. **Magasinier** : gros boutons « Recevoir une livraison » / « Enregistrer une sortie » (zone tactile), listes de réceptions attendues, articles sous le point de commande, dernières sorties (état vide si aucune sortie) ; aucun montant dans le texte ni dans le HTML livré (FCFA, XOF, PMP, prix, valeur, champs `totalXof`) ; pas de défilement horizontal sur tablette ; clic sur « sous le point de commande » : stock filtré.
4. **Essai expiré** (`TEST_NOW` : lendemain de la fin) : bandeau « lecture seule », le tableau de chaque rôle s'affiche, les cartes restent des liens de consultation, « Relancer » désactivé, aucune relance écrite en base.
- Risques de rupture : les articles de sévérité verte (couverture confortable) ne sont jamais listés. Le seed fictif ne contient aucune sortie de stock : « Dernières sorties » affiche l'état vide tant qu'une sortie n'est pas saisie (S3 en crée une).

## S4 – Consultation et comparatif (LOT-10)
1. DA validée de 3 articles ; consultation de 3 fournisseurs (dont 1 local suggéré).
2. Saisie de 3 offres (une en EUR) ; le comparatif convertit et classe ; recommandation affichée.
3. Responsable choisit un fournisseur différent du recommandé → motif obligatoire ; BC générés ; gain calculé.

## S5 – Inventaire tournant sur tablette (LOT-11)
1. Viewport tablette. Magasinier ouvre l'inventaire de la semaine : pas de quantité théorique affichée.
2. Saisie avec un gros écart → recomptage demandé ; recomptage saisi.
3. Responsable valide → ajustements créés, fiabilité calculée.

## S6 – Achat import de PDR (LOT-12)
1. Acheteur import : BC en USD (CIF) pour des roulements ; dossier import ; jalons ETD/ETA saisis.
2. Frais : fret, assurance, droits, transitaire (un estimé puis réel) ; répartition par valeur.
3. Réception magasin ; clôture du dossier → coût d'arrivée dédouané et PMP réajustés ; coefficient d'approche visible.
4. Acheteur local ne voit pas le menu Import.

## S7 – Alertes (LOT-16)
1. Appel de `/api/cron/alertes` à 08:00 simulé → chaque rôle reçoit un digest adapté, compteur de la cloche à jour.
2. Deuxième appel au même créneau → aucun doublon.
3. DA « Arrêt de production » → notification immédiate du Responsable.

## S8 – Échanges Sage (LOT-17)
1. Import d'un export Sage fictif d'articles → création/mise à jour sans doublon, rapport d'écarts.
2. Génération du fichier d'import des BC validés → téléchargeable ; un second export ne reprend pas les mêmes BC.
