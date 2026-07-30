# Rapport de validation — Dead Ground 2.1.0

Date : **30 juillet 2026**

## Résultat préproduction

La chaîne reproductible a été exécutée sous Windows avec Node.js :

```bash
npm install
npm run validate
npm audit --audit-level=high
```

Résultats :

- syntaxe JavaScript : **35 fichiers validés** ;
- audit TypeScript `allowJs + checkJs` : réussi ;
- tests Node : **101 réussis sur 101** ;
- build statique sans clé Google : réussi ;
- validation des imports, références, pages légales et shell PWA : **37 fichiers cohérents** ;
- audit npm : **0 vulnérabilité**.

## Parcours couverts

La suite automatisée vérifie notamment :

- création de mondes procéduraux et hybrides, campagne, modules, nids et épave ;
- combat manuel, mêlée et autofire pendant les assauts de lieux ;
- défenseurs associés à leur POI, sans duplication après annulation ;
- vagues nocturnes, siège final, ressources renouvelables et victoire ;
- priorité des défaites létales sur la victoire et élimination de toutes les signatures au siège final ;
- communauté, rôles, blessures, moral et soins autonomes ;
- recherche, artisanat, infrastructures, avant-postes et missions ;
- position, proximité, stationnement, carburant, blindage et réparation du fourgon ;
- marqueur, distance et trajet de retour vers le fourgon garé ;
- migration 1.x/2.x, récupération secondaire, limites de collections et valeurs extrêmes ;
- nettoyage du contenu descriptif Google dans la sauvegarde principale et sa copie ;
- expiration des coordonnées Places, stabilité des types tactiques et déplacement de l’épave ;
- import/export borné à 5 Mo et rejet des identifiants ou valeurs dangereuses ;
- plafonnement des vagues et temporisateurs, consommation du générateur sans boucle excessive ;
- composition du terrain fallback avec la couche canvas ;
- focus, annonces, pause, paramètres et états `inert` de l’interface.
- registre des onze visuels, présence physique, unicité, poids borné et attribution stable des portraits.

Une simulation déterministe de six jours exécute 14 400 pas moteur. Elle contrôle l’absence d’exception, de valeur non finie, de ressource négative et de fuite au-delà des plafonds de zombies, journal et historique de missions.

## Vérification navigateur locale

Le serveur Node du dépôt a été lancé sur HTTP, puis le parcours a été joué dans un Chromium frais avec l’outil `agent-browser`.

### Ordinateur — 1440 × 1000

- terrain procédural, routes et bâtiments réellement visibles sous les overlays ;
- choix de difficulté et création d’une base ;
- consentement informatif affiché avant la demande de géolocalisation ;
- monde créé avec 22 POI, 3 modules, 1 épave et 3 nids ;
- horloge figée pendant le tutoriel, puis reprise après fermeture ;
- focus placé dans le tutoriel, la pause et les écrans terminaux, puis rendu au jeu à la fermeture ;
- sept onglets accessibles, missions affichées et départ d’expédition effectif ;
- pause et paramètres sans reprise involontaire ;
- sauvegarde locale retrouvée après rechargement et bouton Continuer fonctionnel ;
- pages Confidentialité et Conditions servies et rendues ;
- paquet `dist/` relancé séparément, sans clé Google et sans erreur ;
- service worker contrôlant la page et rechargement du jeu réussi réseau coupé ;
- routes propres `/privacy` et `/terms` rendues avec leur contenu légal même hors ligne à cache froid ;
- aucune erreur de page ou de console observée.

### Mobile — 390 × 844

- largeur du document égale à celle du viewport, sans débordement horizontal ;
- HUD, carte, fiche de POI et commandes tactiles rendus ;
- tiroir Gestion initialement masqué et `inert` ;
- ouverture au-dessus des commandes, navigation vers Missions et fermeture vérifiées ;
- retour à l’état masqué, `aria-hidden=true` et `inert=true`.

## Vérification du pack visuel 2.1.0

- scène d’ouverture rendue et décodée en 1280 × 720 sur ordinateur et mobile ;
- six portraits civils assignés par `survivor.id`, rôle conservé comme badge décoratif ;
- fourgon et poste radio visibles dans Atelier et Missions sans déplacer les informations ni les commandes ;
- illustrations de défaite et de victoire lisibles en 390 × 844 ;
- modales terminales bornées et défilables en paysage 844 × 390 ;
- largeur du document strictement égale au viewport sur les deux formats ;
- serveur source et serveur `dist` capables de servir WebP avec le bon type MIME ;
- cache `dead-ground-2.1.0` prêt avec **11 visuels sur 11** ;
- rechargement de `dist` réseau coupé, titre et scène d’ouverture toujours rendus ;
- aucune erreur de page, de console ni overlay de framework.

L’audit axe-core WCAG 2 A/AA ne remonte **aucune violation** sur le jeu ni sur la page Confidentialité. Le contraste automatisé reste marqué « incomplet » lorsque le fond est un dégradé ; ces zones ont été contrôlées sur les captures réelles.

Captures fraîches :

- `docs/screenshots/game-v2-menu-desktop.png` ;
- `docs/screenshots/game-v2-desktop.png` ;
- `docs/screenshots/game-v2-mobile.png`.

## Point non exécuté en direct

Google Maps satellite, Geocoding et Nearby Search n’ont pas été appelés avec une clé facturable réelle : aucune clé navigateur restreinte n’a été fournie. Le contrat de requête Places est limité à `id` et `location`, les erreurs d’authentification basculent vers le terrain procédural et ces chemins sont couverts par tests. La validation des quotas, de la facturation et des restrictions HTTP doit être faite avec la clé du propriétaire sur son domaine final.
