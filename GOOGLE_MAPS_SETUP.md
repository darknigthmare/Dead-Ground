# Configuration Google Maps Platform — Dead Ground 2.0

## Services utilisés

Le mode réel utilise :

- **Maps JavaScript API** pour la carte en mode satellite ;
- **Places API (New)** pour `Place.searchNearby()` ;
- **Geocoding API** pour la recherche d’adresse via `google.maps.importLibrary("geocoding")` ;
- `OverlayView` avec un canvas transparent pour la couche tactique.

Le projet ne capture, n’extrait, ne republie et ne met pas en cache les tuiles satellite. Le service worker ignore les ressources provenant d’un autre domaine que celui de l’application.

## Création de la clé

1. créer un projet Google Cloud dédié ;
2. associer un compte de facturation Maps Platform ;
3. activer Maps JavaScript API ;
4. activer Places API (New) ;
5. activer Geocoding API si la recherche d’adresse est souhaitée ;
6. créer une clé API de type navigateur.

## Restrictions recommandées

### Sites web autorisés

Exemples :

```text
http://localhost:4173/*
https://votre-domaine.fr/*
https://votre-projet.vercel.app/*
```

Ne pas utiliser un joker global en production.

### API autorisées

Limiter la clé à :

```text
Maps JavaScript API
Places API (New)
Geocoding API
```

Ne pas réutiliser la même clé pour un serveur, Android ou iOS.

## Configuration dans le jeu

### Option A — Paramètres

Ouvrir **Paramètres Google Maps**, coller la clé puis enregistrer. La valeur est conservée dans `localStorage` sur le navigateur courant.

### Option B — Développement local

```js
// config.local.js
window.DEAD_GROUND_CONFIG = {
  googleMapsApiKey: "VOTRE_CLE_RESTREINTE"
};
```

### Option C — Build ou Vercel

```text
GOOGLE_MAPS_API_KEY=VOTRE_CLE_RESTREINTE
```

Puis :

```bash
npm run build
```

La clé est écrite dans `dist/config.local.js`. Une clé JavaScript est nécessairement visible par le navigateur ; sa sécurité repose sur les restrictions de domaine et d’API.

## Nearby Search utilisé par le jeu

À la création d’une nouvelle partie :

- centre : position choisie ;
- rayon : 1 500 mètres ;
- maximum : 20 résultats ;
- préférence : popularité ;
- langue : français ;
- région : France ;
- types inclus : commerces alimentaires, pharmacies, santé, sécurité, carburant, bricolage, stockage, écoles, logements et hébergements.

Champs demandés :

```text
id
displayName
location
formattedAddress
primaryType
types
googleMapsURI
```

Le normaliseur écarte :

- les lieux à moins de 70 mètres de la base ;
- les lieux au-delà de 1 700 mètres ;
- les identifiants en doublon ;
- les positions séparées de moins de 22 mètres.

Le monde est ensuite complété procéduralement jusqu’au nombre prévu par la difficulté.

## Vérification fonctionnelle

Après enregistrement d’une clé valide :

1. le badge doit afficher **Satellite Google Maps** ;
2. la carte procédurale doit être remplacée par l’imagerie ;
3. la recherche par adresse doit recentrer la sélection ;
4. une nouvelle partie doit afficher un message indiquant le nombre de lieux réels ;
5. les fiches correspondantes doivent porter la mention **Lieu réel** et conserver leur adresse ;
6. les overlays doivent rester alignés pendant pan et zoom.

En cas d’échec, le jeu revient automatiquement au terrain procédural.

## Erreurs fréquentes

### `RefererNotAllowedMapError`

Le domaine, protocole ou port n’est pas déclaré dans les restrictions HTTP.

### `ApiNotActivatedMapError`

L’une des API nécessaires n’est pas activée dans le projet de la clé.

### Carte grise ou facturation demandée

Le projet n’est pas associé à un compte de facturation actif.

### La carte fonctionne, mais aucun lieu réel n’apparaît

- vérifier Places API (New) ;
- créer une nouvelle partie ;
- vérifier le quota ;
- essayer un secteur contenant des établissements compatibles ;
- regarder la console pour une restriction d’API.

### La carte fonctionne, mais la recherche d’adresse échoue

Vérifier Geocoding API et sa présence dans la restriction d’API.

### Local correct, production en échec

Ajouter le domaine HTTPS exact de production aux restrictions, puis attendre la propagation.

## Attributions

Ne jamais masquer ou recouvrir les logos, mentions légales et attributions rendus par Google. Le layout réserve de l’espace pour eux et la couche visuelle du jeu ne doit pas les déplacer.

## Validation de livraison

Le code et le contrat de requête sont couverts par les tests et l’audit statique. Une vraie session satellite/Places doit néanmoins être effectuée avec la clé restreinte du propriétaire sur le domaine final, car les quotas, la facturation et les restrictions ne peuvent pas être reproduits sans cette clé.
