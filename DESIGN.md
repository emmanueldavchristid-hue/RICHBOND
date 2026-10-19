# DESIGN.md – RICHBOND Achats & Stocks

Système de design de l'application. **Tout écran nouveau ou modifié doit le respecter.** Les agents le lisent avant toute UI.
Esprit : logiciel métier **premium, calme, précis et dense**, dans la lignée de Linear, Stripe Dashboard et Vercel.
Ce n'est pas un site vitrine : peu d'animation, beaucoup de clarté, l'information d'abord.

## 1. Principes
1. **Lisibilité avant décoration** : hiérarchie nette (un seul titre fort par page, le reste en retrait).
2. **Densité maîtrisée** : un acheteur doit voir 12 à 15 lignes de tableau sans défiler sur un écran 1366×768.
3. **Couleur = sens** : la couleur sert les statuts et les alertes, jamais la décoration.
4. **Une action principale par écran**, visible en haut à droite. Les actions secondaires en bouton discret ou menu « … ».
5. **Chiffres impeccables** : tabulaires, alignés à droite, séparateur d'espace (`1 250 000 FCFA`).
6. **Réglages de goût** (skill design-taste-frontend) : `DESIGN_VARIANCE=3` (mises en page sobres et alignées),
   `MOTION_INTENSITY=3` (micro-animations seulement), `VISUAL_DENSITY=7` (écrans riches en information).

## 2. Typographie (next/font, aucune police serif nulle part)
| Usage | Police | Taille / graisse |
|---|---|---|
| Interface | Inter | 14 px / 400, 500 pour les libellés |
| Titres de page | Inter | 24 px / 600, interlettrage -0,02em |
| Titres de section | Inter | 15 px / 600 |
| Petits libellés, en-têtes de colonnes | Inter | 12 px / 500, couleur atténuée, **pas de MAJUSCULES** |
| Numéros de pièces (DA-2026-00003) | JetBrains Mono | 13 px / 500 |
| Chiffres clés (KPI) | Inter | 28 px / 600, `tabular-nums` |
La police par défaut du `body` doit être Inter : aucun texte ne doit s'afficher en police à empattements (bug actuel à corriger).

## 3. Couleurs (tokens CSS dans `globals.css`, thème clair et sombre)
| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `--background` | `#F8F8F7` | `#0B0D12` | fond de l'application |
| `--surface` | `#FFFFFF` | `#12151C` | cartes, tableaux, panneaux |
| `--border` | `#E8E8E5` | `#232733` | bordures 1 px |
| `--text` | `#111318` | `#ECEDF0` | texte principal |
| `--muted` | `#6B6F78` | `#9097A3` | texte secondaire |
| `--sidebar` | `#0E1726` | `#080B11` | menu latéral |
| `--sidebar-text` | `#AAB4C3` | `#AAB4C3` | |
| `--sidebar-active` | `#1C2738` + barre gauche 2 px `--primary` | | |
| `--primary` | `#2F5BEA` | `#5B7FFF` | actions, liens, focus |
| `--accent` | `#E8A13A` | `#F0B45A` | essai, mises en avant |

**Statuts** (badge : fond teinté 10 %, texte foncé, petit point coloré de 6 px à gauche, rayon 6 px, 12 px / 500) :
brouillon gris `#6B7280` · à valider / soumis ambre `#D97706` · validé bleu `#2F5BEA` · envoyé / confirmé indigo `#4F46E5` ·
partiellement reçu violet `#7C3AED` · reçu / conforme / terminé vert `#15803D` · refusé / annulé / rupture rouge `#DC2626`.
**Urgences** : Normale = texte simple atténué ; Urgente = badge ambre ; Arrêt de production = badge rouge plein + icône.

## 4. Forme et espacement
Grille de 4 px. Rayons : 8 px (champs, boutons), 12 px (cartes), 6 px (badges). Ombres : aucune sur les cartes posées
(bordure seulement), ombre douce uniquement sur menus déroulants, dialogues et toasts. Largeur de contenu fluide, marges 24 px (32 px ≥ 1440).

## 5. Structure des écrans
- **Menu latéral** 240 px (repliable à 64 px), fond `--sidebar`. En haut : logotype texte « RICHBOND » (600, interlettrage 0,08em)
  et sous-titre « Achats & Stocks ». Sections titrées (ACHATS, STOCK, FOURNISSEURS, PILOTAGE, PARAMÈTRES – 11 px atténué),
  icônes lucide 18 px, compteurs en pastilles (DA à valider, BC en retard). En bas : utilisateur et bascule clair/sombre.
- **En-tête** 56 px, fond surface, bordure basse : fil d'Ariane à gauche ; à droite recherche globale (Ctrl+K), badge d'essai,
  cloche, avatar à initiales.
- **Bandeau d'alerte critique** (arrêt de production) : fin (40 px), rouge sobre `#FEF2F2` / texte `#991B1B` avec bord gauche rouge,
  pas un aplat rouge vif sur toute la largeur.
- **En-tête de page** : titre + description courte en `--muted`, action principale à droite.
- **Onglets** soulignés (2 px `--primary`) avec compteur en pastille neutre.
- **Barre de filtres** compacte : recherche à gauche, filtres en menus déroulants « pilules » de 32 px, bouton « Réinitialiser ».
- **Tableaux** : en-têtes 12 px atténués en casse normale, lignes 44 px, séparateurs très légers, survol `--background`,
  numéros en mono, montants à droite, colonnes vides affichées « — » atténué, actions au survol, sélection par case discrète,
  barre d'actions groupées qui apparaît en bas quand des lignes sont cochées. Pagination compacte.
- **Fiches** : en-tête (numéro mono, statut, actions), **frise de statut** horizontale, grille 2/3 contenu + 1/3 panneau latéral
  (informations clés, chronologie verticale avec avatars et horodatage relatif « il y a 2 h »).
- **Formulaires** : sections en cartes avec titre, libellés au-dessus des champs, champs 36 px, aide en 12 px atténué,
  lignes d'articles façon tableur avec recherche d'article (code + désignation + stock dispo), totaux en temps réel en bas à droite.
- **États vides** : icône fine 40 px, phrase utile, bouton d'action. **Chargements** : squelettes, jamais de page blanche.
- **Tableau de bord** : rangée de 4 à 6 cartes KPI (libellé, valeur, variation ±% colorée, mini-courbe), puis 2 colonnes
  (graphiques Recharts sobres : barres arrondies 4 px, grille horizontale très légère, pas de légende inutile) et listes « À traiter ».
- **Connexion** : écran partagé ; panneau gauche `--sidebar` avec logotype, une phrase de valeur et un motif géométrique SVG discret ;
  formulaire à droite, centré, 360 px de large.
- **Fenêtre d'essai** : tuiles jours / heures / minutes en grands chiffres, barre de progression, texte chaleureux, bouton « Continuer ».

## 6. Interaction
Transitions 150 ms (couleurs, ombres), ouverture de dialogue 180 ms. Toasts en bas à droite. Confirmation pour toute action irréversible.
Focus visible (anneau 2 px `--primary`). Raccourcis : Ctrl+K recherche, N nouvelle DA sur la liste des DA.

## 7. Contrôle qualité visuel (obligatoire)
Après chaque écran modifié : capture Playwright en 1366×768 et 1920×1080 (clair et sombre), **regarder la capture**,
corriger ce qui est mal aligné, trop vide, trop chargé ou incohérent avec ce document, puis recapturer.
Lancer la revue `web-design-guidelines` (accessibilité, clavier, formulaires) sur les écrans modifiés.
