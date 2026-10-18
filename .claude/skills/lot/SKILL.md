---
name: lot
description: Réalise un seul lot du projet RICHBOND de bout en bout (plan, code, tests unitaires, tests de workflow, recette, revue, fusion).
argument-hint: "[numéro du lot, ex. 05]"
disable-model-invocation: true
---
Réalise uniquement le lot LOT-$ARGUMENTS en suivant les étapes 1 à 10 de `PROMPT-CLAUDE-CODE.md`, sans attendre de validation.
Arrête-toi après la fusion dans `main` et donne le compte rendu de 5 lignes.
