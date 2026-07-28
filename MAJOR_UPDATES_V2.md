# Dead Ground 2.0 — détail des 10 mises à jour majeures

Ce document décrit ce qui a réellement été ajouté à la simulation, les interactions principales et les tests qui protègent chaque système.

## 1 — Communauté et affectations

### Contenu

- registre `base.roster` avec identité, santé, moral, blessure, jour d’arrivée et rôle ;
- trois survivants au départ : garde, médecin et ingénieur ;
- recrutement supplémentaire par les missions de sauvetage ;
- changement de rôle uniquement à la base ;
- écran **Survivants** dédié.

### Effets de jeu

- **garde** : tirs défensifs depuis la base ;
- **médecin** : amélioration des soins et réduction de la progression infectieuse ;
- **ingénieur** : remise sur les coûts de construction, réparation et artisanat ;
- **éclaireur** : portée de découverte et qualité du butin ;
- **producteur** : nourriture et eau quotidiennes supplémentaires.

### Couverture de test

`features-v2.test.mjs` et `v2-major-updates.test.mjs` vérifient l’initialisation, l’affectation et la modification réelle des coûts.

## 2 — Missions radio dynamiques

### Contenu

- cinq familles de missions : sauvetage, réserve, nid, renseignement et véhicule ;
- cible liée à un POI existant ;
- durée calculée selon la mission et la difficulté ;
- génération quotidienne dépendante de la radio ;
- historique des missions réussies ou expirées ;
- écran **Missions** dédié.

### Effets de jeu

La fouille ou le nettoyage du lieu cible déclenche la résolution. Les récompenses peuvent apporter ressources, renseignements, score, moral ou nouveau survivant.

### Couverture de test

Les tests vérifient la présence d’une cible, d’une échéance et le recrutement lors d’un sauvetage.

## 3 — Fourgon d’expédition

### Contenu

- mission initiale de localisation d’une épave ;
- découverte et retour du fourgon ;
- recherche **Mécanique de récupération** obligatoire ;
- coût de réparation ;
- activation/désactivation depuis l’Atelier ou avec `V` ;
- condition mécanique, consommation de carburant et distance cumulée ;
- représentation visuelle à la base et sur la carte.

### Effets de jeu

Le véhicule augmente la vitesse, réduit une partie des dégâts et consomme du carburant par kilomètre. La recherche Logistique réduit cette consommation. Les kits de réparation restaurent son état.

### Couverture de test

Les tests vérifient réparation, activation, mouvement accéléré, consommation et protection.

## 4 — Artisanat et consommables

### Contenu

- écran **Atelier** ;
- recettes avec ressources, niveau minimal et recherche éventuelle ;
- caisse de munitions ;
- kit de terrain ;
- kit de réparation ;
- piège de périmètre ;
- antidote expérimental ;
- inventaire séparé des ressources générales.

### Effets de jeu

Les kits soignent ou réparent, les pièges sont déployés autour de la base et frappent les infectés, l’antidote réduit fortement l’infection.

### Couverture de test

Les tests contrôlent les coûts, le stockage du résultat et l’utilisation d’un piège pendant un combat.

## 5 — Arbre de recherche

### Contenu

- recherches achetées avec des renseignements ;
- prérequis entre technologies ;
- écran **Recherche** ;
- progression sauvegardée et migrée ;
- effets consultés directement par le moteur.

### Effets de jeu

La recherche améliore notamment les tirs, défenses, soins, virologie, réparations, logistique et campagne d’évacuation.

### Couverture de test

Les tests refusent une technologie sans prérequis, autorisent l’ordre correct et vérifient les effets permanents.

## 6 — Avant-postes et territoire

### Contenu

- conversion d’un POI fouillé et sécurisé en avant-poste ;
- coût de revendication ;
- icône et état dédiés sur la carte ;
- rayon de couverture supplémentaire ;
- production quotidienne par catégorie de lieu ;
- sécurité locale pour le joueur.

### Effets de jeu

Une maison produit des rations, un poste de police des munitions, une station-service du carburant, une clinique des soins, etc. Le réseau d’avant-postes rend les secteurs éloignés exploitables.

### Couverture de test

Les tests contrôlent les conditions de revendication, la couverture et la production du jour suivant.

## 7 — Météo dynamique

### Contenu

- ciel clair, pluie, brouillard, orage et canicule ;
- durée aléatoire sauvegardée ;
- transition automatique ;
- affichage dans le HUD ;
- effets canvas en arrière-plan et premier plan.

### Effets de jeu

La météo modifie déplacement, coût d’endurance, bruit, détection, apparitions, précision et efficacité des tourelles selon le cas.

### Couverture de test

Les tests forcent une transition et comparent les vitesses/modificateurs de simulation.

## 8 — Nids, mutations et boss

### Contenu

- nids de force 1 à 3 intégrés aux POI ;
- activité de nettoyage distincte de la fouille ;
- apparitions périodiques autour des nids ;
- cracheur à distance ;
- blindé avec réduction des dégâts ;
- Alpha de la horde, boss des vagues et du siège final ;
- compteur de nids et boss éliminés.

### Effets de jeu

Les nids augmentent la menace de fond. Les nettoyer rapporte score et renseignements, débloque le bâtiment et réduit la pression locale.

### Couverture de test

Les tests vérifient la génération, les mutations de niveau élevé, la destruction et la réduction de menace.

## 9 — Blessures et infection

### Contenu

- jauge d’infection 0–100 ;
- saignement ;
- entorse et fracture ;
- indicateurs HUD ;
- progression dans le temps ;
- soins différenciés ;
- fin de partie par infection totale.

### Effets de jeu

Une fracture ralentit fortement, l’entorse réduit la mobilité, le saignement enlève de la santé et l’infection progresse tant qu’elle n’est pas maîtrisée. Les médecins, l’infirmerie, les kits et l’antidote se complètent.

### Couverture de test

Les tests appliquent les états, utilisent les traitements et vérifient la fin de partie à 100 %.

## 10 — Campagne d’évacuation

### Contenu

- trois modules de signal placés dans le monde ;
- collecte par fouille ;
- recherche/protocole et radio niveau 2 requis ;
- coût de construction de la balise ;
- appel seulement de jour et hors vague ;
- siège final plus massif avec boss ;
- état `victory`, score, journal et notification dédiés.

### Effets de jeu

La campagne remplace la survie infinie sans objectif par une trajectoire complète : exploration, développement, préparation, décision de lancer l’appel et défense finale.

### Couverture de test

Les tests vont de la récupération des modules à la construction, l’appel, le déclenchement du siège et la victoire.

## Tests transversaux

Les dix mises à jour sont complétées par :

- tests de migration depuis une sauvegarde 1.x ;
- récupération depuis la sauvegarde secondaire si la principale est corrompue ;
- tests du fournisseur Places et de la génération hybride ;
- tests du renderer avec véhicule, météo et infectés spéciaux ;
- simulation longue de six jours sans valeur invalide ;
- audit TypeScript `checkJs` ;
- build statique refusant les fichiers temporaires ;
- vérification UI de la version `dist/` en bureau et mobile.
