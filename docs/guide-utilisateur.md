---
title: "RICHBOND – Application Achats & Stocks"
subtitle: "Guide utilisateur"
lang: fr
---

# Guide utilisateur – RICHBOND Achats & Stocks

Ce guide décrit ce que l'application permet de faire **aujourd'hui**. Il est organisé par rôle : chacun lit son chapitre. Les exemples utilisent des données fictives.

## Avant de commencer

**Connexion.** Ouvrez l'application dans votre navigateur (ordinateur ou tablette), saisissez votre identifiant et votre mot de passe. Après 5 échecs de suite, le compte est verrouillé 15 minutes. La session dure 8 heures. Changez votre mot de passe dans **Mon compte**.

**Votre écran d'accueil** dépend de votre rôle (voir chapitres suivants). Le menu latéral ne montre que ce qui vous concerne ; une page non autorisée affiche « Accès refusé ». La recherche rapide s'ouvre avec **Ctrl+K**.

**Cloche de notifications.** Elle vous prévient quand une pièce vous attend (DA à valider, BC validé, réception…). La page **Notifications** permet de filtrer par gravité, de n'afficher que les non lues et de tout marquer comme lu.

**Alertes de 8h et de 15h.** Deux fois par jour (heure d'Abidjan), l'application dépose dans votre cloche un résumé adapté à votre rôle (retards, pièces à traiter, ruptures). Aucun résumé n'est envoyé s'il n'y a rien à signaler, et il n'est jamais envoyé deux fois pour le même créneau. Une rupture d'un article critique déclenche en plus une alerte immédiate, sans attendre 8h ou 15h. Les alertes critiques apparaissent aussi dans un bandeau en haut des pages.

**Période d'essai.** Pendant l'essai, un badge indique le nombre de jours restants. Une fenêtre de compte à rebours s'affiche à l'ouverture, avec des rappels à J-7, J-3, J-1 et le dernier jour. **Après l'échéance**, l'application passe en **lecture seule** : un bandeau rouge l'annonce, vous pouvez toujours vous connecter, consulter, télécharger les PDF et exporter en Excel, mais toute création ou validation est refusée (les boutons sont grisés avec une infobulle). Le Super admin active la licence avec une clé et tout redevient possible.

**Conventions.** Montants affichés `1 250 000 FCFA`, dates `JJ/MM/AAAA`. Les listes se trient, se filtrent, se recherchent et s'exportent en Excel ; l'état de la liste est conservé dans l'adresse de la page.

**Numéros de pièces** (générés automatiquement) : `DA-AAAA-NNNNN` (demande d'achat), `BC-AAAA-NNNNN` (bon de commande), `NC-AAAA-NNNNN` (non-conformité), `SOR-` (sortie), `TRF-` (transfert), `AJU-` (ajustement), `INV-` (inventaire), `FAC-` (facture).

---

# Chapitre 1 – Responsable Achats

Vous avez accès à tout : validation, paramètres métier, rapports.

## 1.1 Tableau de bord d'accueil

À l'ouverture, vous voyez :

- **Cartes « à traiter »** : DA à valider, BC à valider, BC en retard, non-conformités ouvertes. Un clic ouvre la liste correspondante déjà filtrée (même compteur).
- **6 indicateurs du mois** (montants en FCFA, pourcentages) et **3 graphiques**.
- **Risques de rupture** : articles dont la couverture est insuffisante (les articles confortables ne sont jamais listés).

## 1.2 Valider les demandes d'achat (DA)

1. Menu **Achats > Demandes d'achat**, onglet **À valider**. Les DA « Arrêt de production » sont en tête, surlignées, et un **bandeau rouge** apparaît sur toutes les pages jusqu'à traitement.
2. Ouvrez la fiche : lignes, urgence, avertissement de doublon éventuel (« Déjà demandé : DA-…, besoin le JJ/MM »).
3. Choisissez le **type** (Local ou Import) et, si besoin, **réduisez les quantités** (la modification est tracée).
4. Trois décisions :
   - **Valider** : la DA est assignée automatiquement à l'acheteur du bon périmètre, qui est notifié.
   - **Renvoyer à compléter** : commentaire obligatoire ; le demandeur corrige et resoumet (même numéro).
   - **Refuser** : motif de 5 caractères minimum ; la DA est définitivement fermée.
5. **Validation groupée** (pratique sur tablette) : cochez plusieurs DA, **Valider la sélection**, vérifiez le récapitulatif, confirmez. Le message indique combien sont validées et combien écartées par le contrôle.

## 1.3 Valider les bons de commande (BC)

1. **Achats > Bons de commande**, onglet **À valider**. Le BC préparé par l'acheteur porte encore un libellé `BC-BROUILLON-…` : il n'a pas de numéro.
2. Sur la fiche, contrôlez les lignes, les prix et l'**alerte de prix** (écart par rapport au dernier prix connu). L'aperçu PDF est filigrané « NON VALIDÉ ».
3. **Valider** : le numéro `BC-AAAA-NNNNN` est attribué, le PDF est généré, la DA passe à « Commandée » (ou « Partiellement commandée »), l'historique de prix est alimenté. Vous pouvez aussi **Refuser** (avec motif).
4. Vous pouvez passer une **commande directe** (avec motif), **annuler** un BC validé (motif obligatoire : les DA liées sont rouvertes et l'acheteur prévenu), **reporter la date promise** (motif obligatoire ; la 1re date promise est conservée et le nombre de reports est affiché), ou créer un **avenant** (nouvelle version du même numéro).
5. Un fournisseur **bloqué** ne peut pas recevoir de BC : la validation est refusée.

## 1.4 Suivre les retards

Le BC dont la date promise est dépassée apparaît dans l'onglet **En retard** (« En retard de 4 j »), avec une pastille sur l'accueil et l'indicateur **À relancer**. L'acheteur relance ; vous pouvez le faire aussi.

## 1.5 Réceptions et non-conformités

- **Stock > Réceptions** : consultez les livraisons du magasinier. Vous êtes notifié des refus.
- **Non-conformités** : suivez les NC ouvertes ; l'acheteur décide (remplacement, avoir…).
- Vous seul pouvez **autoriser une sur-livraison**, **contre-passer une réception** (refusé si le stock a déjà été sorti) et solder un reliquat avec l'acheteur.

## 1.6 Stock

- **Stock > Articles** : couverture en jours, point de commande, PMP et valeur. **Recalculer** la classification ABC. **Appliquer les valeurs suggérées** (seuils proposés, jamais appliqués sans votre clic).
- **Ajuster le stock** (seul vous le pouvez) : motif de 5 caractères minimum, mouvement `AJU-…` tracé.
- **Mouvements** : journal de tous les mouvements ; **Sorties** : consultation avec valeur, annulation possible.
- **Réappro** : articles sous le point de commande, d'où partent les DA de réapprovisionnement.

## 1.7 Inventaires

Vous ouvrez l'inventaire hebdomadaire (sélection tournante d'articles A/B/C), puis, une fois le comptage terminé, vous **validez** : les ajustements de stock ne sont créés qu'à ce moment-là. Pour chaque ligne vous voyez le théorique, le compté, l'écart et sa valeur au PMP ; un grand écart (5 % ou 100 000 FCFA) impose un **recomptage** et un motif. La **fiabilité du stock** est calculée à la validation.

## 1.8 Factures fournisseurs

**Achats > Factures** : l'acheteur saisit la facture, l'application la rapproche ligne à ligne du BC et de la réception.

- Statut **CONFORME** : vous donnez le **Bon à payer** sans motif.
- Statut **ÉCART** (prix ou quantité hors tolérance) : le bon à payer exige un **motif de dérogation**, tracé.
- Vous seul donnez le bon à payer. Le bouton **Exporter les écarts** produit un fichier Excel. L'**échéancier** liste les factures par date d'échéance.

## 1.9 Paramètres et suivi

- **Paramètres > Réglages** : société, logo, règles des BC, seuil de validation, afficher ou non les prix d'achat au Magasinier.
- **Dépôts, Services, Devises** : référentiels et **taux de change datés** (confirmation demandée si EUR s'écarte de 655,957 ; alerte « taux ancien » après 30 jours).
- **Utilisateurs** : comptes du service. **Journal d'audit** : toute création, validation, annulation y est tracée.
- **Fournisseurs** : fiche, contacts, **blocage** avec motif (vous seul pouvez débloquer), historique des prix.
- **Import** (Paramètres > Import) : reprise des données initiales par fichier Excel/CSV (articles, fournisseurs, article-fournisseur, stock initial) avec aperçu par ligne et rapport Excel.

---

# Chapitre 2 – Acheteur (local, import ou les deux)

Votre périmètre (local, import ou les deux) détermine les DA qui vous sont assignées. Vous voyez vos DA et vos BC, pas ceux de l'autre acheteur.

## 2.1 Accueil

Cartes « Mes DA » (assignées), « BC en retard » avec bouton **Relancer**, BC à suivre. Pas de KPI du Responsable.

## 2.2 Créer une demande d'achat

1. **Achats > Demandes d'achat > Nouvelle DA**.
2. Renseignez le service, la date de besoin, l'urgence (Normale, Urgente, **Arrêt de production** : la date de besoin passe à aujourd'hui et le Responsable est alerté en rouge), puis les lignes (article du référentiel, quantité).
3. Un avertissement non bloquant signale un doublon. **Enregistrer** en brouillon ou **Soumettre** : le numéro `DA-…` est attribué à la soumission.
4. Si le Responsable la renvoie « à compléter », lisez son commentaire, corrigez, resoumettez.

## 2.3 Passer la commande (BC)

1. Vous êtes notifié quand une DA vous est assignée. Ouvrez **Achats > Bons de commande > À commander** : les lignes validées sont regroupées **par fournisseur principal** et pré-cochées. Un fournisseur bloqué désactive « Créer le BC ».
2. **Créer le BC** : brouillon avec lignes converties en unités d'achat (cartons…), adresse du dépôt, rattachement aux DA. Saisissez les prix (écart signalé par rapport au dernier prix), vous pouvez commander une quantité partielle.
3. **Enregistrer et soumettre** : le BC passe « À valider » chez le Responsable. Vous ne pouvez pas le valider vous-même.
4. Une fois validé : téléchargez le **PDF** `BC-AAAA-NNNNN-v1.pdf`, **Marquer comme envoyé** (texte d'accompagnement fourni, envoi WhatsApp enregistré), puis **Confirmer** avec la **date promise** du fournisseur (obligatoire).

## 2.4 Relancer et amender

- BC en retard : **Relancer** donne un texte prêt à copier (numéro, retard, quantité restante) ; choisissez le moyen d'envoi, la relance est enregistrée et l'indicateur « À relancer » disparaît.
- **Créer un avenant** (motif obligatoire) pour changer quantités ou prix : version 2 du même numéro, à faire valider puis à renvoyer.

## 2.5 Réceptions et non-conformités

Vous consultez les réceptions de vos BC. En cas de refus de marchandise, une NC est créée : vous **décidez** (remplacement, avoir, etc.) puis elle est clôturée. Vous pouvez **solder un reliquat** (motif obligatoire) si le fournisseur ne livrera pas le reste.

## 2.6 Factures

1. **Achats > Factures > Nouvelle facture** : choisissez le fournisseur et le BC, la ligne est pré-remplie depuis la réception. Un **doublon** (même fournisseur, même numéro) est refusé.
2. Lisez le rapprochement : **CONFORME** ou **ÉCART** (ligne en écart de prix ou de quantité). Corrigez la facture ou signalez un litige.
3. Le **bon à payer** est donné par le Responsable. Vous pouvez joindre des pièces et exporter les écarts.

## 2.7 Fournisseurs et articles

- **Fournisseurs** : créez la fiche (type local/import, pays, devise, incoterm, contacts), consultez les articles fournis et l'historique des prix. Vous pouvez **bloquer** (motif de 5 caractères minimum) mais pas débloquer.
- **Articles** : création d'articles (PDR, fournitures…) avec unité d'achat et unité de stock (« 1 Carton = 10 U »), criticité, équipement, fournisseur principal.
- **Devises** : vous pouvez saisir un taux de change du jour.

## 2.8 Import de données

Dans Paramètres > Import, selon vos droits, vous pouvez charger un fichier Excel/CSV de données initiales après aperçu.

---

# Chapitre 3 – Magasinier

L'application est conçue pour la **tablette** : gros boutons, champs tactiles. Vous ne voyez **jamais les prix d'achat** (le PMP et la valeur de stock sont visibles ; le Responsable peut aussi activer l'affichage des prix).

## 3.1 Accueil

Deux gros boutons : **Recevoir une livraison** et **Enregistrer une sortie**. Dessous : réceptions attendues, articles sous le point de commande, dernières sorties.

## 3.2 Recevoir une livraison

1. **Stock > Réceptions > Nouvelle** (ou depuis l'accueil). Choisissez le BC attendu ; vous voyez les quantités restantes dues, sans prix.
2. Pour chaque ligne, saisissez la quantité livrée et la quantité **acceptée** (**Tout accepter** en un clic). Les quantités refusées demandent un **motif** (ex. « Abîmé ») et créent automatiquement une **non-conformité** `NC-…`.
3. Saisissez le **numéro de BL** (obligatoire), puis **Valider la réception**.
4. Effets : le stock augmente (conversion unité d'achat vers unité de stock), le PMP est recalculé, le BC passe « Partiellement reçu » ou « Reçu », le Responsable est notifié d'un refus.
5. Une livraison supérieure à ce qui reste dû est bloquée : seul le Responsable peut l'autoriser. Vous ne pouvez pas contre-passer une réception.

## 3.3 Enregistrer une sortie

1. **Stock > Sorties > Nouvelle sortie**. Renseignez dépôt, service, article, quantité ; pour une PDR, la **machine** est obligatoire.
2. Une quantité supérieure au stock est refusée (« Stock insuffisant : N U disponibles »).
3. **Valider la sortie** : bon `SOR-AAAA-NNNNN`, stock diminué.

## 3.4 Transfert entre dépôts

Depuis la fiche de stock d'un article : **Transfert**, dépôt de destination, quantité. Deux mouvements liés `TRF-…` (sortie et entrée) sont créés. Vous ne pouvez pas ajuster le stock (réservé au Responsable).

## 3.5 Consulter le stock et réapprovisionner

- **Stock > Articles** : filtres catégorie (PDR…), criticité, équipement ; fiche en lecture seule. La **couverture** en jours est colorée (rouge = à risque).
- **Stock > Réappro** : articles sous le point de commande. Cochez et **Créer les DA** : une DA de réapprovisionnement est soumise au Responsable avec la quantité suggérée ; l'article est ensuite marqué « DA-… en cours ».
- Une DA ordinaire (ex. fourniture de bureau) se crée comme au chapitre 2.2, sans prix ni désignation libre.

## 3.6 Inventaire hebdomadaire (mode tablette)

1. **Stock > Inventaires** : ouvrez l'inventaire de la semaine puis **Comptage**.
2. Le comptage est **aveugle** : le stock théorique n'est pas affiché. Saisissez la quantité comptée avec le pavé numérique (recherche d'article, sauvegarde automatique, scan facultatif).
3. En cas de gros écart, l'application demande un **recomptage**.
4. Terminez le comptage : le Responsable valide et les ajustements sont créés. Si un mouvement de stock a lieu pendant le comptage, la ligne est à recompter.

---

# Chapitre 4 – Super admin (technique)

Rôle caché, tenu par le prestataire. Il n'intervient pas dans les achats.

- **Licence et essai** (Paramètres > Licence) : voir l'état et les jours restants, **activer** par clé, **prolonger** l'essai. Ses actions de comptes restent permises même en essai expiré.
- **Comptes** (Paramètres > Utilisateurs) : créer, désactiver, réinitialiser un mot de passe (mot de passe temporaire affiché une fois), attribuer le rôle et le périmètre des acheteurs (local, import ou les deux).
- **Journal d'audit** : consulter qui a fait quoi et quand.
- **Maintenance** : alertes de 8h et 15h déclenchées par une tâche planifiée sur le serveur appelant `/api/cron/alertes` avec un secret (voir `docs/deploiement.md`) ; sauvegardes et déploiement détaillés dans les documents techniques du projet.

---

# À venir

Les fonctions suivantes ne sont pas encore disponibles : consultations et comparatif des offres, achats import avec frais d'approche et coût d'arrivée dédouané, évaluation des fournisseurs, rapports et KPI avancés (la page Rapports est encore un écran d'attente), échanges avec Sage 100.
