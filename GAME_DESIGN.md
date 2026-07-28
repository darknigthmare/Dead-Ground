# Game Design — Dead Ground: Satellite Survival 2.0

## Vision

Transformer un endroit réel choisi par le joueur en campagne de survie. La familiarité d’un quartier, d’un village ou d’une destination devient une contrainte tactique : où installer la base, quels bâtiments fouiller, jusqu’où s’éloigner, quelles ressources sacrifier et quand déclencher l’évacuation.

La version 2.0 doit maintenir quatre tensions :

1. partir assez loin pour trouver du matériel rare sans manquer la nuit ;
2. accepter le bruit et le risque nécessaires pour progresser ;
3. nourrir et organiser une communauté plutôt qu’un personnage isolé ;
4. construire une issue finale au lieu de survivre indéfiniment sans objectif.

## Piliers

### Géographie réelle, simulation autonome

La base, les POI, les trajectoires, les avant-postes et les infectés utilisent de vraies coordonnées. Google Maps ou la carte procédurale ne sont que des moyens de projection. Une panne du fournisseur ne doit jamais supprimer le moteur de jeu.

### Monde hybride

Les établissements Google compatibles deviennent des objectifs. Le générateur procédural complète les zones vides et garantit toujours un nombre jouable de POI. Les noms et adresses sont affichés comme informations de lieu ; le jeu n’invente aucune donnée personnelle.

### Préparation contre urgence

Le jour favorise exploration, mission, recherche et production. La nuit concentre les zombies autour de la base. Les réserves, la météo, l’état du véhicule, les blessures et les rôles rendent chaque journée différente.

### Communauté systémique

Les survivants consomment, produisent, soignent, construisent et défendent. Ils ne sont pas de simples nombres : leur rôle, moral, santé et blessure modifient les calculs du moteur.

### Campagne terminable

Trois modules de signal, un protocole de recherche, une radio améliorée, une balise coûteuse et un siège final donnent une progression claire jusqu’à la victoire.

## Temps

- départ à 08:00 ;
- une seconde réelle = 2,4 minutes de jeu ;
- production des avant-postes à 06:20 ;
- consommation quotidienne à 07:00 ;
- génération des transmissions à 09:00 ;
- croissance de la menace des nids à 18:00 ;
- vague principale à 20:00 ;
- météo changeante sur plusieurs heures de jeu.

## Exploration

Les POI sont distribués en plusieurs distances, jusqu’à environ 1,7 km pour les lieux réels acceptés. La couverture dépend de la radio, des éclaireurs, des recherches et des avant-postes. Le joueur clique sur la carte ou utilise une fiche de mission pour définir une destination.

Une fouille :

- exige d’être à moins de 27 mètres ;
- immobilise temporairement le joueur ;
- augmente bruit et menace ;
- peut faire apparaître des défenseurs ;
- est impossible tant qu’un nid actif occupe le lieu ;
- attribue un butin déterministe lié au lieu et à la difficulté.

## Types de lieux

| Lieu | Danger | Butin principal | Production d’avant-poste |
|---|---:|---|---|
| Maison | 1 | nourriture, eau, bois | nourriture, eau |
| Supérette | 2 | nourriture, eau | nourriture, eau |
| Pharmacie | 2 | médicaments | médicaments |
| Poste de police | 4 | munitions, métal, renseignements | munitions |
| Entrepôt | 3 | bois, métal, pièces | bois, métal |
| Station-service | 4 | carburant, pièces | carburant |
| Centre médical | 4 | soins, eau, renseignements | médicaments, eau |
| Bricolage | 3 | bois, métal, pièces | métal, pièces |
| École | 2 | ressources mixtes | nourriture, eau |
| Abri civil | 5 | butin complet et rare | munitions, pièces |

## Combat et conditions

### Arme à feu

Portée de 82 mètres, consommation d’une munition, dégâts influencés par la difficulté et la recherche balistique. La météo peut réduire la précision. Le tir automatique cible la menace la plus proche.

### Mêlée

Très courte portée, coût d’endurance, bruit modéré et impossibilité d’utilisation dans le véhicule.

### Conditions persistantes

- **saignement** : perte de santé continue jusqu’à stabilisation ;
- **entorse** : pénalité de mobilité ;
- **fracture** : pénalité plus forte et soins plus longs ;
- **infection** : progresse après les morsures et inflige des dégâts à haut niveau ;
- **100 d’infection** : fin de partie.

Les médicaments, kits, médecins et infirmerie traitent ces états. L’antidote nécessite la virologie.

## Infectés

- **Rôdeur** : ennemi de base, lent et régulier.
- **Coureur** : rapide et fragile.
- **Hurleur** : portée de détection élevée, attire du renfort.
- **Colosse** : grande santé et dégâts lourds.
- **Cracheur** : attaque infectieuse à distance.
- **Blindé** : forte réduction des dégâts conventionnels.
- **Alpha** : boss de horde, blindage partiel, infection élevée et récompense en renseignements.

Les nids possèdent une force de 1 à 3. Les niveaux élevés produisent des mutations plus dangereuses. Les détruire réduit la menace et rapporte des renseignements.

## Communauté

Rôles :

- garde : tir défensif et réduction du risque pendant les vagues ;
- médecin : soin du joueur et des survivants ;
- ingénieur : réduction des coûts ;
- éclaireur : couverture, révélation, fouille ;
- producteur : récoltes supplémentaires ;
- disponible : réserve sans bonus.

Les rations quotidiennes dépendent du nombre de survivants. Le manque de nourriture ou d’eau réduit moral et santé. Une mission de sauvetage peut augmenter la population.

## Base

Le centre de commandement possède sa santé. La palissade absorbe d’abord les dégâts. Les sept infrastructures ont trois niveaux et des coûts croissants : palissade, tour, atelier, infirmerie, potager, générateur et radio.

Le générateur fonctionne automatiquement la nuit tant qu’il reste du carburant. Les tours et gardes consomment des munitions. Les pièges sont des charges jetables.

## Recherche et artisanat

Les renseignements viennent des missions, nids, lieux dangereux, boss et vagues. L’arbre impose des choix : puissance, soins, mobilité, réseau ou objectif final.

Recettes : munitions, kit de terrain, kit de réparation, piège et antidote. L’atelier définit le niveau minimum et les ingénieurs réduisent certains coûts.

## Véhicule

Le fourgon :

- est associé à une mission et à un POI ;
- doit être retrouvé, ramené conceptuellement à la base puis réparé ;
- nécessite la recherche Mécanique ;
- roule à 16 m/s ;
- consomme 1,65 unité de carburant par kilomètre avant bonus ;
- absorbe 55 % des dégâts tant que son intégrité est positive ;
- peut être réparé avec un kit.

## Avant-postes

Un POI doit être fouillé, sans nid actif, et le joueur doit se trouver sur place. Le coût de prise est de 12 bois, 6 métal et 1 pièce avant réductions. Un avant-poste étend le réseau, fournit une zone sûre et produit selon son type chaque matin.

## Campagne

1. trouver les trois modules de signal ;
2. développer Réseau radio, Triage, Virologie et Protocole d’évacuation selon les prérequis ;
3. améliorer la radio ;
4. payer le coût de la balise ;
5. appeler le convoi ;
6. repousser la vague finale ;
7. passer l’état de partie à `victory`.

## Difficultés

- **Reconnaissance** : ressources et butin supérieurs, ennemis moins puissants, missions plus longues.
- **Survie** : référence d’équilibrage.
- **Cauchemar** : ressources réduites, loot moindre, dégâts, santé, infection et apparitions augmentés.

## Direction artistique et UX

Surcouche tactique civile/militaire improvisée : verts sombres, jaune d’alerte, rouge critique, panneaux translucides et symboles simples lisibles sur photo satellite. L’UI doit compartimenter les systèmes en onglets plutôt que d’empiler une page géante.

Priorités :

- la carte reste la scène principale ;
- les états critiques sont visibles sans ouvrir un panneau ;
- les actions impossibles expliquent leur prérequis ;
- le mobile ouvre la gestion dans un tiroir ;
- les animations respectent `prefers-reduced-motion`.

## Limites de conception assumées

- pas de collision avec les bâtiments réels ;
- pas de pathfinding routier ;
- pas d’intérieurs 3D ;
- pas de compte cloud ;
- pas de multijoueur ;
- pas d’extraction ni de cache de tuiles Google.

## Suite possible

- routes réelles et événements de trajet ;
- escouades de survivants avec inventaire individuel ;
- factions humaines et commerce ;
- événements narratifs radio ;
- synchronisation cloud optionnelle ;
- scénarios saisonniers sans modifier le cœur géographique.
