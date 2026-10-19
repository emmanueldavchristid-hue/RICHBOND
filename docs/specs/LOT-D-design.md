# LOT-D – Design : une application belle, moderne et professionnelle

> **La référence est `DESIGN.md` à la racine** (tokens, typographie, composants, contrôle visuel). En cas d'écart avec ce fichier, `DESIGN.md` prime.
> Défauts constatés par Jason sur la version actuelle : texte en police à empattements (police non appliquée), en-têtes de colonnes en MAJUSCULES,
> bandeau rouge vif trop agressif, menu noir sans hiérarchie, page qui manque de rythme. À corriger en priorité.

## Objectif
Qu'à la première seconde de la démo, M. DIBI se dise : « c'est un vrai logiciel, haut de gamme ».
Style : sobre, premium, industriel chaleureux. Inspiration : Linear, Stripe Dashboard, Vercel – pas un template admin générique.

## Identité visuelle (tokens dans `src/app/globals.css`, thème shadcn)
- **Police** : « Inter » pour l'interface (next/font), chiffres tabulaires (`font-variant-numeric: tabular-nums`) dans tous les tableaux et KPI.
  Titres en « Plus Jakarta Sans » 600/700.
- **Couleurs** :
  - Fond application `#F7F7F5` (gris chaud), surfaces blanches, bordures `#E7E5E4`.
  - Menu latéral bleu nuit profond `#0F1B2D`, texte `#CBD5E1`, élément actif avec barre d'accent et fond `#1B2A41`.
  - Accent principal bleu `#2563EB` (actions), accent secondaire ambre `#F59E0B` (alertes, essai).
  - Statuts (badges pastel + point coloré) : brouillon gris, soumis/à valider ambre, validé bleu, envoyé indigo,
    reçu/conforme vert `#16A34A`, refusé/annulé/rupture rouge `#DC2626`, partiel violet.
- **Rayons** 10 px (cartes 14 px), ombres très légères, espacements généreux (grille de 8 px).
- **Mode sombre** complet via les mêmes tokens, bascule dans le menu utilisateur.

## Composants à soigner
- **Connexion** : écran partagé – à gauche un panneau bleu nuit avec le nom « RICHBOND · Achats & Stocks », une phrase d'accroche
  et un motif géométrique discret (SVG) ; à droite le formulaire centré, champs larges, bouton plein.
- **Menu latéral** repliable (icônes seules), sections titrées (Achats, Stock, Fournisseurs, Pilotage, Paramètres), compteurs (DA à valider, BC en retard) en pastilles.
- **En-tête** : fil d'Ariane, recherche globale (Ctrl+K : articles, fournisseurs, DA, BC par numéro), cloche, badge d'essai élégant, avatar avec initiales.
- **Tableaux** : en-têtes collants, lignes aérées, survol, colonnes numériques alignées à droite, montants en FCFA bien formatés,
  actions au survol, filtres en « chips », état vide illustré (icône + phrase + bouton d'action), squelettes de chargement.
- **Fiches** (DA, BC, réception, article) : en-tête avec numéro, statut et actions principales à droite ; **frise de statut**
  (stepper horizontal Brouillon → Soumise → Validée → Commandée → Reçue) ; chronologie verticale des événements avec avatars.
- **Formulaires** : sections en cartes, lignes d'articles éditables façon tableur, recherche d'article avec auto-complétion
  (code + désignation + stock actuel), totaux en temps réel, validation en ligne.
- **Tableau de bord** : rangée de cartes KPI (valeur en grand, variation vs mois précédent avec flèche colorée, mini-courbe sparkline),
  graphiques Recharts aux couleurs du thème (barres arrondies, infobulles soignées), liste « à traiter aujourd'hui » priorisée,
  bloc « Risques de rupture » avec jauge de couverture en jours.
- **Fenêtre d'essai** : compte à rebours en grands chiffres (jours / heures / minutes en tuiles), barre de progression, ton chaleureux.
- **Retours** : toasts (sonner) en bas à droite, confirmations en dialogue, animations courtes (150-200 ms) sur ouvertures et survols. Pas d'excès.
- **PDF du BC** aux mêmes couleurs et polices.

## Responsive
Parfait sur écran 1366×768 (portables du client), 1920×1080 et tablette 1024 (écrans magasin).

## Critères d'acceptation
- [ ] Toutes les pages existantes harmonisées (aucune page « brute » restante).
- [ ] Contrastes accessibles (texte ≥ 4.5:1), focus clavier visible.
- [ ] Captures d'écran Playwright de chaque page principale, par rôle, dans `docs/captures/` (pour la démo et le portfolio).
- [ ] Aucun test existant cassé.
