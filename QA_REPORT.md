# Rapport de validation — Dead Ground 2.0.0

Date : **28 juillet 2026**

## Résultat global

La chaîne autoportante de validation est exécutée avec :

```bash
npm run validate
```

État de la livraison : **validée**.

- syntaxe de tous les modules JavaScript : réussie ;
- audit TypeScript `allowJs + checkJs` du code navigateur, exécuté séparément : réussi ;
- tests Node : **48 réussis sur 48** ;
- construction de production : réussie ;
- concordance de 21 fichiers source/build et configuration générée sans clé : réussie ;
- réponse HTTP 200 vérifiée pour `index.html`, `src/main.js` et le manifeste : réussie ;
- validation des imports ES : réussie ;
- fichiers PWA et références HTML : validés ;
- vérification visuelle ordinateur et mobile : réussie ;
- aucune clé ou secret Google inclus dans le projet.

## Couverture automatisée

### Moteur historique

- création d’une partie complète ;
- déplacement géographique ;
- construction et déduction des coûts ;
- tir, mêlée, fouille et attribution du butin ;
- vague nocturne ;
- destruction de la base et fin de partie ;
- pause bloquant les commandes de simulation.

### Dix mises à jour majeures

- météo changeante et effets sur les déplacements ;
- blessures, saignement, infection, soin et antidote ;
- rôles et affectation des survivants ;
- recherche et prérequis ;
- fabrication, inventaire et pièges ;
- missions radio, échéances, récompenses et recrutement ;
- nids, défenseurs spéciaux et nettoyage ;
- avant-postes, portée et production ;
- découverte, réparation, utilisation et dégâts du fourgon ;
- collecte des modules, balise, siège final et victoire.

### Monde réel et rendu

- conversion des catégories Google en catégories de jeu ;
- conservation des métadonnées utiles ;
- filtrage géographique et suppression des doublons ;
- génération hybride réel/procédural ;
- compteur exact des lieux effectivement acceptés ;
- rendu canvas avec météo, véhicule et mutations ;
- repère de sélection sans dépendance navigateur.

### Sauvegardes

- sauvegarde et rechargement sans effets temporaires ;
- fonctionnement non bloquant lorsque `localStorage` est refusé ;
- migration d’une sauvegarde 1.x en conservant la progression ;
- ajout de tous les systèmes 2.0 manquants ;
- copie de la sauvegarde d’origine avant migration ;
- récupération automatique depuis la copie secondaire lorsque la principale est corrompue.

### Test de résistance

Une simulation déterministe de **six jours complets** exécute 14 400 pas moteur avec météo, missions, consommation, productions, vagues, IA, défenses et nettoyage des effets.

Contrôles réussis :

- aucune exception ;
- aucune valeur numérique `NaN` ou infinie ;
- aucune ressource négative ;
- zombies limités à 125 ;
- journal limité à 140 entrées ;
- historique des missions limité à 30 ;
- partie toujours cohérente à la fin de la simulation.

## Vérification Chromium

Le scénario navigateur a été exécuté avec un harnais ES modules en mémoire, car l’environnement de validation bloque la navigation directe vers le serveur local alors que le serveur HTTP et le build répondent correctement.

### Ordinateur — 1440 × 1000

- écran de sélection rendu ;
- terrain procédural annoncé ;
- nouvelle partie lancée ;
- sept onglets présents : Base, Expéditions, Survivants, Atelier, Recherche, Missions et Journal ;
- affectation d’un survivant en éclaireur ;
- fabrication d’un kit de terrain ;
- construction, recherche et piège déclenchables ;
- météo Pluie affichée ;
- aucune erreur de page ni overlay d’erreur ;
- aucun débordement horizontal.

### Mobile — 390 × 844

- HUD et carte rendus ;
- bouton Gestion visible ;
- panneau Missions ouvrable ;
- contenu du panneau lisible ;
- aucune erreur de page ;
- aucun débordement horizontal.

Captures :

- `docs/screenshots/game-v2-menu-desktop.png` ;
- `docs/screenshots/game-v2-desktop.png` ;
- `docs/screenshots/game-v2-mobile.png`.

Données structurées :

- `docs/browser-verification-v2.json` pour les sources ;
- `docs/browser-verification-dist-v2.json` pour le build de production.

## Défauts détectés et corrigés pendant l’audit

- schéma de sauvegarde 2.0 incomplet par rapport aux systèmes déjà présents ;
- compteur des résultats Google supérieur au nombre réellement accepté ;
- catégories Places obsolètes ou inadaptées ;
- collision des deux boutons Antidote ;
- appel de rendu de véhicule inexistant ;
- impossibilité de traiter un saignement à santé maximale ;
- commandes encore modifiables pendant la pause ;
- déclarations dynamiques non vérifiables par `checkJs` ;
- traitement superflu de paramètres ignorés.

## Validation des archives de livraison

Les deux archives finales ont été extraites dans des dossiers vierges avant remise :

- le projet source extrait repasse l’audit `checkJs`, les **48 tests**, le build et la validation PWA ;
- le paquet jouable extrait repasse la validation Chromium ordinateur/mobile ;
- aucune clé Google Maps, fichier temporaire ou déclaration de type de développement n’est présent dans le paquet jouable ;
- les sommes SHA-256 sont fournies séparément pour contrôler l’intégrité des téléchargements.

## Point non exécuté en direct

Le mode Google Maps satellite et Nearby Search n’ont pas été appelés avec une vraie clé facturable, car aucune clé restreinte n’a été fournie au projet. L’adaptateur, la normalisation, le contrat de requête, le fallback et le géocodage ont été audités ; la validation finale de l’imagerie, des quotas et des restrictions HTTP doit être faite sur le domaine de production avec la clé du propriétaire.
