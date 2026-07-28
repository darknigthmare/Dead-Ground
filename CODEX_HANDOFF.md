# Reprise du projet avec Codex — Dead Ground 2.0.0

## Mission

Continuer **Dead Ground: Satellite Survival**, jeu navigateur solo de survie zombie géolocalisé. Le joueur choisit une position réelle, établit une base, explore des lieux Google ou procéduraux, gère une communauté et cherche à organiser l’évacuation.

## État livré

La version 2.0 est jouable de l’installation jusqu’à la victoire et comprend :

- Google Maps satellite, géocodage et Places API (New) ;
- terrain procédural de secours ;
- monde hybride avec lieux réels ;
- simulation indépendante du fournisseur de carte ;
- déplacement, combat, bruit, menace, endurance et météo ;
- blessures, saignement, infection et soins ;
- communauté, rôles, moral et consommation ;
- missions radio dynamiques ;
- nids, sept familles d’infectés et boss Alpha ;
- artisanat, pièges et recherche ;
- avant-postes et production ;
- fourgon réparable ;
- campagne d’évacuation et siège final ;
- sauvegardes principales/secondaires, migration 1.x, import/export ;
- PWA responsive ;
- **48 tests** et simulation longue de six jours.

## Commande obligatoire avant livraison

```bash
npm run validate
```

L’audit statique complémentaire se lance avec `npm run check:types` lorsqu’un exécutable TypeScript `tsc` est disponible.

Une modification visuelle doit aussi être contrôlée en :

```text
1440 × 1000
390 × 844
```

## Contraintes à préserver

1. Ne jamais télécharger, extraire, reconditionner ou mettre en cache les tuiles Google Maps.
2. Le jeu doit toujours rester jouable sans clé grâce à `FallbackMapAdapter`.
3. `GameEngine` ne doit jamais dépendre directement de Google Maps.
4. Toutes les positions restent des objets `{ lat, lng }`.
5. Toute nouvelle entité cartographique passe par `renderer.js` et la projection de l’adaptateur.
6. Ne pas recouvrir ni supprimer les logos, attributions ou mentions Google.
7. Ne jamais committer une clé non restreinte.
8. Préserver souris, clavier, tactile, responsive et `prefers-reduced-motion`.
9. Toute règle de jeu nouvelle reçoit au moins un test Node.
10. Toute modification du schéma de sauvegarde reçoit une migration et une validation.
11. Préserver la copie de secours et la récupération d’une sauvegarde principale corrompue.
12. Limiter les collections longues : zombies 125, logs 140, historique de missions 30.

## Carte des fichiers

- `src/main.js` : cycle de vie global, cartes, sauvegarde et événements.
- `src/engine.js` : commandes et mise à jour de la simulation.
- `src/world.js` : état initial, POI, missions, survivants, nids et infectés.
- `src/constants.js` : équilibrage et définitions des systèmes.
- `src/migrations.js` : normalisation et migration de sauvegarde.
- `src/real-places.js` : types Places, conversion et filtrage.
- `src/geo.js` : calculs géographiques.
- `src/renderer.js` : affichage tactique canvas.
- `src/maps/google-map.js` : Maps JavaScript, géocodage, Nearby Search et projection.
- `src/maps/fallback-map.js` : carte de secours.
- `src/ui.js` : DOM, HUD, onglets et modales.
- `src/storage.js` : sauvegarde, backup, import/export et paramètres.
- `src/audio.js` : effets Web Audio.
- `tests/long-run.test.mjs` : stabilité sur six jours.
- `tsconfig.audit.json` : audit statique `checkJs`.

## Prochaines extensions cohérentes

### Navigation réelle

- option de trajet suivant les routes ;
- coût de déplacement selon longueur du parcours ;
- obstacles, ponts et routes coupées ;
- fallback direct lorsque Directions est indisponible.

### Expéditions en escouade

- sélection de deux ou trois survivants ;
- inventaire de mission ;
- compétences et blessures individuelles ;
- risques hors écran pour les missions déléguées.

### Événements humains

- survivants hostiles, négociation et commerce ;
- appels radio à choix ;
- réputation locale ;
- événements qui n’utilisent jamais de noms ou d’adresses de personnes privées.

### Persistance optionnelle

- compte et sauvegarde cloud ;
- chiffrement des données sensibles ;
- synchronisation explicite, jamais requise pour jouer localement.

## Critères d’acceptation

- `npm run validate` réussit ;
- aucune erreur de console ou de page ;
- mode sans clé jouable ;
- panne Google non bloquante ;
- migration des anciennes sauvegardes testée ;
- aucun secret dans le dépôt ni le build ;
- UI utilisable en 1440 × 1000 et 390 × 844 ;
- documentation et changelog mis à jour ;
- build extrait et revalidé avant livraison.

## Prompt prêt à donner à Codex

```text
Travaille directement dans ce dépôt Dead Ground: Satellite Survival 2.0.0. Lis README.md, GAME_DESIGN.md, CODEX_HANDOFF.md et QA_REPORT.md avant de modifier le code. Implémente réellement la fonctionnalité demandée et préserve le mode Google Maps satellite, Google Places et le terrain procédural de secours. Ne télécharge jamais les tuiles Google, ne masque pas les attributions et ne place aucune clé non restreinte dans le dépôt. Garde GameEngine indépendant de la carte et toutes les entités en latitude/longitude. Ajoute les migrations nécessaires, les tests ciblés et un test de régression. Exécute npm run validate, vérifie 1440×1000 et 390×844, puis documente précisément les fichiers, règles et limites restantes.
```
