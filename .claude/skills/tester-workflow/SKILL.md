---
name: tester-workflow
description: Rejoue tous les scénarios de workflow multi-rôles (Playwright) et produit un rapport.
disable-model-invocation: true
---
Utilise l'agent `testeur-workflow` pour réinitialiser la base de test, rejouer tous les scénarios actifs de `docs/05-scenarios-de-test.md`
(`npm run test:e2e`) et me donner le rapport : scénarios OK / KO, et pour chaque KO l'étape, l'attendu, l'observé et la cause probable.
Propose ensuite les corrections, et applique-les si elles sont sans risque, puis rejoue les scénarios.
