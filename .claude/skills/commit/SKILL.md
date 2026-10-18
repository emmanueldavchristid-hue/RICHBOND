---
name: commit
description: Vérifie lint et tests puis fait un commit propre au format du projet.
disable-model-invocation: true
model: haiku
---
1. Lance `npm run lint`, `npm run typecheck` et `npm test`. En cas d'échec, arrête-toi et explique.
2. Résume `git status` et les changements.
3. Commit au format `type(module): description en français` (feat, fix, refactor, test, docs, chore), avec LOT-xx / EX-xx si pertinent.
   N'ajoute jamais `.env` ni les fichiers ignorés.
