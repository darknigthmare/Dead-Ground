# Rapport de validation — Dead Ground 2.2.0

Date : **30 juillet 2026**

## Résultat préproduction

La chaîne reproductible a été exécutée sous Windows avec Node.js :

```bash
npm run validate
npm audit --audit-level=moderate
```

Résultats :

- syntaxe JavaScript : **37 fichiers validés** ;
- audit TypeScript `allowJs + checkJs` : réussi ;
- tests Node : **114 réussis sur 114** ;
- build statique sans clé Google : réussi ;
- validation des imports, références, pages légales et shell PWA : **48 fichiers cohérents** ;
- audit npm : **0 vulnérabilité**.

Une simulation déterministe de six jours exécute 14 400 pas moteur. Elle contrôle l’absence d’exception, de valeur non finie, de ressource négative et de fuite au-delà des plafonds de zombies, journal et historique de missions.

## Parcours couverts

La suite automatisée vérifie notamment :

- mondes procéduraux et hybrides, campagne, modules, nids et épave ;
- combat manuel, mêlée et autofire pendant les assauts ;
- vagues nocturnes, siège final, ressources renouvelables, défaite prioritaire et victoire ;
- communauté, rôles, blessures, moral, soins, recherche, artisanat, avant-postes et missions ;
- position, trajet, carburant, intégrité, réparation et stationnement du fourgon ;
- migration 1.x/2.x, récupération secondaire, import/export borné et assainissement ;
- expiration des coordonnées Places et exclusion du contenu descriptif Google ;
- terrain de secours, projection, overlays, focus, pause, paramètres et modales accessibles ;
- registre et cache des onze WebP d’interface ;
- catalogue des neuf atlas, manifeste direction-major, dimensions, poids, alpha, chroma, cellules, sampling, zoom, réduction des mouvements et fallback vectoriel ;
- événements réels de tir, mêlée, attaque, cri, crachat, blessure, mort et immobilisation, sans consommation du RNG de gameplay ;
- persistance des cadavres animés après retrait moteur, cap du fourgon indépendant de la visée, cri non écrasé par une attaque et mort du joueur visible en véhicule ;
- horloge et actions figées pendant une pause manuelle, animations terminales autorisées à finir.

## Vérification des atlas 2.2.0

- **9 atlas PNG RGBA** : joueur, sept infectés et fourgon ;
- **2 300 cellules utilisées** et manifeste cohérent ;
- plaques OpenAI de neuf poses articulées pour les huit acteurs biologiques ;
- huit directions `N, NE, E, SE, S, SW, W, NW` ; rotation continue de la source orthographique du fourgon ;
- taille totale : **5 055 638 octets**, chaque texture sous 1 Mo et chaque dimension sous 4 096 px ;
- aucun RGB caché sous alpha nul, aucun résidu chroma, aucune cellule vide, rognée ou hors texture ;
- plusieurs poses distinctes dans chaque clip multiframe ;
- formes vectorielles historiques conservées lorsque le chargement ou le décodage d’un atlas échoue.

## Vérification navigateur locale

Le paquet `dist/` a été servi sur un port isolé, puis contrôlé dans un Chromium frais avec `agent-browser`.

### Ordinateur — 1 440 × 1 000

- joueur, sept familles d’infectés et fourgon rendus simultanément ;
- repos, déplacement, tir, mêlée, attaque, blessure, cri, crachat, mort et état hors service contrôlés ;
- sampling de frames réellement animé, avec images distinctes à deux temps moteur ;
- **9 atlas prêts, 0 échec** ;
- terrain procédural préservé sous les sprites ;
- aucune erreur de page ou de console.

### Mobile — 390 × 844

- largeur du document strictement égale au viewport, sans débordement horizontal ;
- HUD, carte, sprites, fiche de POI, gestion et commandes tactiles rendus ;
- **9 atlas prêts, 0 échec** ;
- région horizontale des ressources focalisable au clavier, nommée comme région ;
- audit axe-core WCAG 2 A/AA : **0 violation** ; le contraste reste incomplet pour les fonds en dégradé et a été contrôlé visuellement.

### PWA, hors ligne et réduction des mouvements

- service worker contrôlant la page et cache local `dead-ground-2.2.0` actif ;
- `src/sprites.js`, manifeste et neuf atlas présents : **11 ressources d’animation sur 11** ;
- serveur réellement arrêté avant rechargement : menu, sauvegarde et partie animée encore disponibles, **9 atlas prêts** ;
- avec réduction des mouvements, boucles figées sur une pose et actions non bouclées tenues sur leur pose finale ;
- aucun échec de ressource, erreur de page ou erreur de console observé.

Captures fraîches :

- `docs/screenshots/game-v2-2-animation-actions.png` ;
- `docs/screenshots/game-v2-2-animated-mobile.png`.

## Point non exécuté avec une clé facturable

Google Maps satellite, Geocoding et Nearby Search n’ont pas été appelés avec une clé réelle : aucune clé navigateur restreinte n’a été fournie. Le contrat Places est limité à `id` et `location`, les erreurs d’authentification basculent vers le terrain procédural et ces chemins sont couverts par tests. La validation des quotas, de la facturation et des restrictions HTTP reste à faire avec la clé du propriétaire sur son domaine final.
