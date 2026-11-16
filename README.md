# BestLap — Overlay Sim-Racing Open-Source pour Linux

**BestLap** est une application d'overlay sim-racing légère, modulaire et open-source conçue d'abord pour **Linux** (X11 / Wayland + Proton/Wine) et **Le Mans Ultimate (LMU)**, avec une architecture découplée prête pour le multi-sim et le portage Windows/macOS.

---

## Architecture du projet

```text
BestLap/
├── config/
│   └── default.json              # Configuration serveur, providers télémétrie & UI
├── overlay/
│   ├── main.cjs                  # Fenêtre Electron transparente click-through (Linux X11/Wayland)
│   └── package.json              # Manifeste optionnel pour le shell desktop
├── src/
│   ├── core/
│   │   ├── config.ts             # Chargement config + flags CLI + variables d'env
│   │   ├── telemetry-hub.ts      # Normalisation canonique & throttling (20 Hz par défaut)
│   │   ├── types.ts              # Modèle de données agnostique du simulateur
│   │   └── ws-server.ts          # Serveur HTTP statique + WebSocket RFC 6455 (zéro dépendance)
│   ├── platform/
│   │   └── linux-paths.ts        # Détection X11/Wayland, Steam & préfixe Proton LMU (2399420)
│   ├── providers/
│   │   ├── base-provider.ts      # Interface commune TelemetryProvider
│   │   ├── lmu-rest-provider.ts  # Acquisition via l'API REST locale de LMU (localhost:6397)
│   │   ├── lmu-shm-provider.ts   # Lecture mémoire partagée rF2/LMU (/dev/shm)
│   │   └── mock-provider.ts      # Simulateur WEC Le Mans (Hypercar, LMP2, LMGT3)
│   └── index.ts                  # Point d'entrée principal
├── tests/
│   ├── lmu-rest-provider.test.ts
│   ├── telemetry-hub.test.ts
│   └── ws-server.test.ts
└── ui/
    ├── index.html                # Canvas overlay complet (widgets déplaçables)
    ├── widgets/
    │   └── leaderboard.html      # Widget Leaderboard autonome (OBS / Gamescope / navigateur)
    ├── js/
    │   ├── ws-client.js          # Client WebSocket avec reconnexion automatique
    │   ├── widget-manager.js     # Gestionnaire de positionnement & persistance localStorage
    │   └── widgets/
    │       └── leaderboard.js    # Widget Leaderboard multi-classe
    └── styles/
        ├── theme.css             # Thème sombre translucide haute lisibilité
        └── leaderboard.css       # Styles du classement
```

### Séparation des couches
1. **Couche Acquisition (`src/providers/`)** : Chaque simulateur ou source de télémétrie implémente `TelemetryProvider` et émet des données brutes converties vers le modèle canonique (`TelemetryFrame`).
2. **Couche Core (`src/core/`)** : `TelemetryHub` calcule les positions par classe, les meilleurs tours (global / classe) et cadence la diffusion (`broadcastHz`) vers `OverlayServer` (HTTP + WebSocket sans dépendances externes).
3. **Couche Présentation (`ui/` & `overlay/`)** : Des widgets HTML5/CSS3/JS légers connectés en WebSocket, utilisables au choix dans un navigateur, dans OBS (`Browser Source`), sous Gamescope, ou via le shell Electron transparent click-through.

---

## Prérequis & Démarrage rapide sous Linux

- **Node.js >= 22.18** (testé sur Node.js 24 — exécution native des fichiers `.ts` sans étape de compilation ni `npm install` requis pour le cœur).

### 1. Tester immédiatement avec le simulateur WEC (mode Mock)
```bash
npm run start:mock
```
Puis ouvrez dans votre navigateur :
- Overlay complet : `http://127.0.0.1:7777/?preview=1`
- Widget Leaderboard seul : `http://127.0.0.1:7777/widgets/leaderboard.html?preview=1`

### 2. Lancer avec Le Mans Ultimate (via Proton / Steam Linux)
L'approche recommandée sous Linux est le provider **`lmu-rest`** : l'API REST intégrée de Le Mans Ultimate (`http://127.0.0.1:6397`) traverse la frontière Wine/Proton directement via `localhost` sans configuration de mémoire partagée.

```bash
npm run start:lmu
```
*(Si votre instance LMU écoute sur un autre port ou une autre machine, utilisez `LMU_REST_URL=http://127.0.0.1:6397 npm run start:lmu`.)*

### 3. Lancer l'application d'overlay desktop multi-fenêtres (Electron Linux)
BestLap dispose d'un shell desktop modulaire (`overlay/`) inspiré de RaceLab : chaque widget (**Leaderboard**, **Relative**, **Input Telemetry**) s'ouvre dans sa propre fenêtre transparente *always-on-top*.

```bash
cd overlay && npm install && cd ..

# Lancer avec LMU (démarre automatiquement le backend si non lancé)
npm run overlay

# Ou tester directement avec le simulateur WEC :
cd overlay && npm run start:mock
```

- **Mode Click-Through par défaut** : Les fenêtres ignorent les clics souris (`setIgnoreMouseEvents(true, { forward: true })`) pour ne jamais bloquer les entrées dans LMU.
- **Mode Édition (`Alt + Shift + L` ou via l'icône Tray)** :
  - Rend les widgets interactifs et affiche le **Control Dock** flottant.
  - Permet de déplacer les fenêtres avec **aimantation magnétique** (bords d'écran et autres widgets) et de les redimensionner.
  - Sauvegarde automatiquement `(x, y, width, height, enabled)` dans `~/.config/bestlap/config.json`.
- **Compatibilité X11 & Wayland** : `overlay/main.cjs` active `--enable-transparent-visuals` et `--ozone-platform-hint=auto`. Lancez Le Mans Ultimate en mode **Borderless Windowed**.

### Packaging Linux (AppImage / .deb)
```bash
cd overlay
npm install
npm run pack:linux
```
Les paquets générés se trouvent dans `overlay/dist/`.

### 4. Exécuter les tests
```bash
npm test
```

---

## Compatibilité Mémoire Partagée Linux (`/dev/shm`)
Un provider expérimental `npm run start:shm` est inclus pour lire `$rFactor2SMMP_Scoring$` dans `/dev/shm` lorsqu'un pont Wine/Proton expose les buffers `rFactor2SharedMemoryMapPlugin64` sous Linux. Pour la majorité des utilisateurs Linux, **`lmu-rest`** reste la méthode la plus fiable et la plus simple.

---

## Roadmap

### Phase 1 — Fondations & LMU (Actuelle)
- [x] Architecture modulaire Core / Providers / UI WebSocket
- [x] Provider `lmu-rest` (compatible Proton/Wine) + `mock` WEC + base `lmu-shm`
- [x] Widget **Leaderboard** multi-classe (Hypercar / LMP2 / LMGT3), écarts `INT`/`LDR`, pit status, focus joueur
- [x] Shell Electron transparent click-through pour Linux X11 / Wayland

### Phase 2 — Widgets Sim-Racing Essentiels
- [ ] **Relative / Radar de proximité** (voitures devant/derrière en temps réel + drapeaux bleus)
- [ ] **Fuel & Strategy Calculator** (consommation par tour, tours restants, estimation ravitaillement)
- [ ] **Telemetry Inputs & Deltas** (jauges pédales, volant, delta live par rapport au meilleur tour)
- [ ] **Track Map** (position des voitures sur le circuit en temps réel)

### Phase 3 — Multi-Simulateurs & Portage Multi-Plateforme
- [ ] Providers additionnels : **Assetto Corsa Competizione** (UDP/SHM), **rFactor 2**, **iRacing**, **Automobilista 2**
- [ ] Abstraction OS complète (`src/platform/`) pour **Windows** (Named Shared Memory native) et **macOS**
- [ ] Remplacement optionnel d'Electron par **Tauri** (WebKitGTK / WebView2) pour réduire encore l'empreinte RAM (< 40 Mo)
- [ ] Éditeur visuel de profils et partage de layouts JSON
