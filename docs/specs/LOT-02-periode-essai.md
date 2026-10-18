# LOT-02 – Période d'essai, compte à rebours, licence

## Objectif
Le client voit clairement combien de temps il reste dans sa période d'essai. À l'échéance, l'application passe en lecture seule
de façon professionnelle (aucune perte de données), jusqu'à activation par Jason.

## Règles
- Table `License` (une seule ligne) : `status` TRIAL | ACTIVE | EXPIRED, `trialStartsAt`, `trialEndsAt`, `licensedTo`, `activatedAt`, `keyFingerprint`.
- Initialisation : si absente, créée au premier démarrage avec `trialStartsAt = maintenant`, `trialEndsAt = TRIAL_END_DATE` du `.env`
  ou, à défaut, maintenant + `TRIAL_DAYS` (défaut 30). L'heure de fin est 23:59 heure d'Abidjan.
- Statut calculé côté **serveur** (heure serveur, jamais l'horloge du navigateur) : TRIAL tant que `now < trialEndsAt`, puis EXPIRED.
- Lecture seule : la garde `requireWritable()` bloque toutes les actions d'écriture avec le message
  « Période d'essai terminée : l'application est en consultation seule. Contactez Christ-Emmanuel Mouhi pour l'activer. »
  Les consultations, impressions et exports restent autorisés. La connexion reste possible.
- Activation : le Super-admin saisit une clé dans `/parametres/licence`. Clé = `RB-` + base32(HMAC-SHA256(`LICENSE_SECRET`, `licensedTo|ACTIVE`)) tronquée en groupes de 5.
  Script `npm run license:generate -- "RICHBOND CI"` pour générer la clé (exécuté par Jason seulement). Seule l'empreinte est stockée.
- Le Super-admin peut prolonger l'essai (nouvelle date) ; chaque changement est tracé dans l'audit.
- Les utilisateurs ne peuvent pas modifier la licence.

## Interface
- **Fenêtre à la connexion** (une fois par session) : titre « Version d'essai », gros compte à rebours `12 j 05 h 32 min`
  (mis à jour chaque minute), date de fin en toutes lettres, barre de progression des jours écoulés, bouton « Continuer ».
  Texte : « Merci de tester l'application RICHBOND Achats & Stocks. La version d'essai se termine le … »
- **Badge permanent** dans l'en-tête : « Essai : 12 j restants ». Cliquable : rouvre la fenêtre.
  Couleurs : neutre > 7 jours, orange ≤ 7 jours, rouge ≤ 2 jours (avec l'heure restante le dernier jour).
- Rappels : la fenêtre se réaffiche automatiquement à J-7, J-3, J-1 et le dernier jour à chaque connexion.
- **Après l'échéance** : bandeau rouge fixe « Période d'essai terminée – consultation seule » + fenêtre explicative à la connexion ;
  boutons d'action désactivés avec infobulle.
- Après activation : badge et fenêtre disparaissent, `/parametres/licence` affiche « Licence active – RICHBOND CI – activée le … ».

## Critères d'acceptation
- [ ] Tests unitaires du calcul du statut et du temps restant (fuseau, dernier jour, échéance passée).
- [ ] Test : avec une licence expirée, une création de DA est refusée côté serveur, un export reste possible.
- [ ] Test : clé valide → ACTIVE ; clé invalide → message d'erreur, statut inchangé.
- [ ] Playwright : la fenêtre s'affiche à la connexion, le badge change de couleur selon la date simulée (`TEST_NOW`).
- [ ] Aucune donnée n'est supprimée ni masquée à l'expiration.
