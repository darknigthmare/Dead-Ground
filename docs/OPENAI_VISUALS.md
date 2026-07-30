# Visuels originaux OpenAI

Les packs visuels de **Dead Ground 2.2.0** ont été générés avec le mode ImageGen intégré d’OpenAI le 30 juillet 2026, puis normalisés localement pour le jeu. Ils ne reprennent aucun fichier officiel, logo, marque, personnage de franchise ni image de stock.

## Direction commune

Illustration cinématique semi-réaliste, survie contemporaine crédible dans une périphérie urbaine européenne ou méditerranéenne anonyme, matériaux mats, palette charbon et olive accordée à `#070a08`, touches de signal `#c9f46b`, proportions réalistes, sujet lisible après recadrage. Aucun texte lisible, logo, uniforme officiel, gore, monument identifiable ni filigrane.

## Pack livré

| Fichier | Usage | Format |
|---|---|---:|
| `menu-sector-fall.webp` | ouverture et choix du secteur | 1280 × 720 |
| `missions-radio-desk.webp` | panneau des transmissions | 960 × 480 |
| `survivor-01.webp` à `survivor-06.webp` | portraits assignés par identifiant stable | 320 × 320 |
| `vehicle-expedition-top.webp` | atelier et état du fourgon | 384 × 384 |
| `ending-zone-fallen.webp` | défaite | 960 × 540 |
| `ending-convoy-evacuation.webp` | victoire et évacuation | 960 × 540 |

## Variations de prompt

- ouverture : base civile fortifiée vue en plongée oblique au crépuscule, balise radio verte et silhouettes infectées lointaines ;
- transmissions : poste radio d’urgence, carte papier, casque, lampe verte et matériel civil usé ;
- portraits : six adultes civils diversifiés en âge, genre et origine, cadrage carré, expression neutre, liseré vert discret ;
- véhicule : fourgon civil robuste et non marqué, vue orthographique du dessus, galerie et fournitures ;
- défaite : base bréchée de nuit, mât radio effondré, éclairage d’urgence rouge et menace lointaine, sans gore ;
- victoire : communauté embarquant dans un convoi civil à l’aube, balise réparée et signal vert, espoir contenu.

Les images sont décoratives dans l’interface : les noms, états, missions et résultats restent disponibles en texte HTML. Les onze fichiers appartiennent aussi au shell PWA afin de rester disponibles hors ligne.

## Atlas tactiques animés 2.2.0

Neuf maîtres distincts ont été générés sur fond chroma magenta : survivant, fourgon, Rôdeur, Coureur, Colosse, Hurleur, Cracheur, Blindé et Alpha. Une plaque OpenAI 3 × 3 ajoute neuf poses réellement articulées à chacun des huit acteurs biologiques. Le helper OpenAI de détourage chroma a produit les sources RGBA, puis `scripts/build_sprite_atlases.py` a assemblé les clips et fabriqué huit directions dans une grille direction-major.

| Atlas | Dimensions | Clips |
|---|---:|---|
| `player-survivor.png` | 576 × 4 032 | repos, marche, sprint, tir, mêlée, impact, mort |
| `infected-walker.png` | 576 × 2 880 | repos, marche, attaque, impact, mort |
| `infected-runner.png` | 576 × 2 880 | repos, course, attaque, impact, mort |
| `infected-brute.png` | 576 × 2 880 | repos, marche, frappe, impact, mort |
| `infected-screamer.png` | 576 × 3 456 | clips communs et hurlement |
| `infected-spitter.png` | 576 × 3 456 | clips communs et crachat |
| `infected-armored.png` | 576 × 2 880 | repos, marche, frappe, impact, mort |
| `infected-alpha.png` | 864 × 2 880 | repos, marche, frappe, impact, mort |
| `vehicle-expedition.png` | 576 × 384 | garé, moteur, conduite, hors service |

Le joueur et les infectés utilisent `N, NE, E, SE, S, SW, W, NW`. Le fourgon reste une source orthographique unique tournée continûment par son cap, ce qui évite les ruptures visuelles lors des trajets. Les formes vectorielles historiques restent le fallback si une image n’est pas encore décodée ou devient invalide. `src/sprites.js`, les neuf PNG et leur manifeste appartiennent au shell PWA et restent donc disponibles hors ligne.

### Prompt commun des maîtres tactiques

Vue top-down orthographique exacte à 90 degrés, sujet original entier centré et orienté nord, silhouette lisible à 32–64 px, peinture tactique de survie semi-réaliste, palette charbon/olive et accent propre au type, lumière ambiante uniforme, aucune ombre portée, aucun sol, décor, texte, logo, marque, gore ou magenta sur le sujet, fond uni chroma `#ff00ff`.

Les variantes ont demandé : survivant civil avec carabine et accent lime ; fourgon civil renforcé ambre ; Rôdeur bordeaux ; Coureur rouille ; Colosse brun massif ; Hurleur longiligne violet sombre ; Cracheur olive à gorge gonflée ; Blindé en protections civiles récupérées ; Alpha charbon/cramoisi/ambre. Les plaques 3 × 3 demandent, selon l’acteur, repos, deux foulées opposées, course, recul de tir, mêlée, préparation et impact d’attaque, blessure, spécial, chute et corps immobile. Les maîtres de production restent hors dépôt ; les neuf atlas normalisés et `atlas-manifest.json` sont les sources runtime versionnées.

## Empreintes des onze WebP d’interface

```text
ending-convoy-evacuation.webp 79449151462902519daf087fa617578d275faa979486dfc6ebb91c544e2d40ca
ending-zone-fallen.webp        27316be03bc9a9dee7e9e63fdedae000d7de42c5ae2e0684ac2c0104e6d09769
menu-sector-fall.webp          f5634c2346245a3da01eb7d32ded6895f5cd4250769f74012b71fb9d0e6b3790
missions-radio-desk.webp       dad54d095eac3378b96860ae2980aa29e2ef9afe2244d8a95216593fc3677c0a
survivor-01.webp               e7973499ac2e65ce05b1ac798adaa56b84765d52deccdc19eb5e9e65c5da44fc
survivor-02.webp               75a144a5924684cd8bc9012d7aeeabd3584ba414839cd7b97d345d9b3227c31a
survivor-03.webp               06b4318ceb4a1898d46d5a99da54c7a210420609e9c928f139e0d464a12b781d
survivor-04.webp               d529871a65263a575740c9fc22e1ea88ee5c2ad2fde9211dd36bc92cf5191fbf
survivor-05.webp               988d1596c59d8e3504734feb65ee4dd86b2a74c30eeee27ac138b69146d1eb9f
survivor-06.webp               7573077bc94b6610ef181a02b3331b3260be8c138957af3a31b547da33779024
vehicle-expedition-top.webp    ead92cb2a16c9b8a83d57ca222b3e5bca1269aafbdd7a4b56a8705ee7202b330
```

## Empreintes des atlas runtime 2.2.0

```text
atlas-manifest.json    e7fa6bdc2c26e8a1cf9c231d18de8cff9ea8cddbafd6846aa832db05f3ceb0a1
infected-alpha.png     800012a96ed4ab3d6f6e3ab59b50c0d10bcf586ad21b3a6dddfa020225320640
infected-armored.png   b193eeb2fbb787aa245763401cf20b8a1a089a9f91afe6d9e3715ce663ce2126
infected-brute.png     4db2ab9bf2600cc9d89a9024eb2d7f2bad6983a8824b3b9150a6faf9e8432a10
infected-runner.png    cb972ee4d29d99e4b84b14859630620dcd584404c83019d623230b96248e5723
infected-screamer.png  a4b705da95a85702ee1bcecf1297d19b7398988f5cab0afe78f551863ce7f4f3
infected-spitter.png   ec6abf077a7ea5dfa1e5344a146b5da31eee1365df960be5bed324f591d28ce3
infected-walker.png    013b051019e99eada91fb3b82ec16a5e75281830d82121210bbfd76600acf667
player-survivor.png    c7a4b8202374fe8adaa824f24bab327ceeac306bc7f111a14fd0d2e576ac6a94
vehicle-expedition.png ccfabd043213bb5a1602a2e86f6e589fa80fe1934f418d831e3da182b7d18438
```
