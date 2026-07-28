# Changelog

## 2.0.0 — 2026-07-28 — Community & Evacuation

### Dix mises à jour majeures

1. météo dynamique avec modificateurs de simulation ;
2. blessures, saignement, infection, kits et antidotes ;
3. communauté de survivants et six rôles fonctionnels ;
4. arbre de recherche avec huit technologies et prérequis ;
5. artisanat, inventaire, pièges et kits de réparation ;
6. missions radio dynamiques avec échéances et récompenses ;
7. nids infectés, cracheurs, blindés et Alpha de la horde ;
8. avant-postes producteurs étendant la couverture ;
9. fourgon d’expédition réparable, motorisé et destructible ;
10. campagne d’évacuation, balise, siège final et écran de victoire.

### Ajouté

- onglets Survivants, Atelier, Recherche et Missions ;
- neuvième ressource : renseignements ;
- compteurs de missions, nids, boss et progression de campagne ;
- effets météo sur la carte et le HUD ;
- migration complète du schéma de sauvegarde 1.x vers 2.0 ;
- sauvegarde secondaire avant migration et récupération après corruption ;
- audit TypeScript `checkJs` sans émission ;
- tests du renderer, de la migration, des dix systèmes et d’une simulation de six jours ;
- vérification visuelle ordinateur et mobile.

### Corrigé

- compteur des lieux Google basé sur les lieux effectivement acceptés, pas sur les résultats bruts ;
- catégories Places remplacées par des types actuels compatibles avec Nearby Search ;
- géocodage chargé via la bibliothèque `geocoding` ;
- collision de sélecteur entre les boutons Antidote du HUD et de l’atelier ;
- interruption du renderer par un second appel de véhicule inexistant ;
- soin désormais capable de stopper un saignement même à santé maximale ;
- commandes sprint et tir automatique bloquées pendant la pause ou après la fin de partie ;
- propriétés dynamiques de l’adaptateur Google déclarées et contrôlées ;
- suppression des doubles traitements de données de lieu.

### Qualité

- 48 tests automatisés réussis ;
- syntaxe JavaScript validée ;
- audit `checkJs` validé ;
- build statique et PWA validés ;
- simulation de six jours sans fuite de collections ni valeur non finie ;
- rendu contrôlé en 1440 × 1000 et 390 × 844 sans débordement horizontal ni erreur de page.

## 1.1.0 — 2026-07-28 — Lieux réels Google Places

### Ajouté

- Nearby Search via `Place.searchNearby()` ;
- conversion des pharmacies, hôpitaux, commissariats, stations-service, commerces, écoles, entrepôts, logements et hôtels en objectifs d’exploration ;
- conservation du nom, de l’adresse, de l’identifiant, du type et du lien Google Maps ;
- monde hybride complété automatiquement par des lieux procéduraux ;
- filtrage des doublons, des emplacements trop proches et des résultats hors zone ;
- indication **Lieu réel** dans l’interface ;
- tests de normalisation et de génération hybride.

## 1.0.0 — 2026-07-28 — Première version jouable

### Ajouté

- sélection mondiale du point de départ ;
- Google Maps satellite avec couche tactique canvas ;
- terrain procédural de secours ;
- déplacement, sprint, tir, mêlée, soins et tir automatique ;
- quatre familles initiales de zombies ;
- cycle jour/nuit et vagues nocturnes ;
- dix familles de lieux à fouiller ;
- huit ressources initiales ;
- sept infrastructures sur trois niveaux ;
- trois difficultés ;
- sauvegarde locale, import/export et autosave ;
- PWA, sons procéduraux et interface responsive ;
- build statique et configuration Vercel.
