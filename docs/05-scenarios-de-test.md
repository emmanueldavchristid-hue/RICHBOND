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

## S2 – Réception partielle, refus et facture (LOT-06, 13)
1. BC de 100 unités. Réception 1 : 60 livrées, 55 acceptées, 5 refusées (« Abîmé ») → non-conformité créée, BC partiellement reçu.
2. Réception 2 : 40 livrées acceptées → BC reçu.
3. Acheteur : facture de 100 unités → rapprochement en ÉCART (95 reçues acceptées) ; facture corrigée à 95 → CONFORME → Responsable : bon à payer.

## S3 – Rupture anticipée et réappro (LOT-07)
1. Article critique avec consommation régulière sur 90 jours ; sorties jusqu'à passer sous le point de commande.
2. L'article apparaît dans « Risques de rupture » (tableau de bord Responsable) et dans `/stock/reappro`.
3. Magasinier : génère la DA depuis la liste → DA soumise avec la quantité suggérée.
4. Sortie supérieure au stock refusée avec message clair.

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
