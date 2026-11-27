# MedigestPro – version desktop (Tauri v2)

Le dossier `src-tauri/` emballe l'application React/Vite existante dans une fenêtre native.
Aucune réécriture : le front reste identique et parle toujours à `https://api.medigestpro.net`.

## 0. Versions

Le projet est aligné sur la même base qu'ExcelPro : **React 18.3 + Vite 5 + TypeScript**.
Le lockfile a été retiré (il était figé sur React 19 / Vite 8) : lancer `npm install` puis commiter le nouveau `package-lock.json`
(le workflow GitHub utilise `cache: npm`, qui exige ce fichier).

## 1. Prérequis (une seule fois)

- Node 20+ 
- Rust : https://rustup.rs
- **Windows** : « Microsoft C++ Build Tools » (charge de travail *Desktop development with C++*). WebView2 est déjà présent sur Windows 10/11.
- **macOS** : `xcode-select --install`
- **Linux** : `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`

## 2. Commandes

```bash
npm install
npm run desktop:dev      # fenêtre desktop en mode développement
npm run desktop:build    # installateur dans src-tauri/target/release/bundle/
```

Sortie : Windows → `.msi` et `.exe` (NSIS) · macOS → `.dmg` · Linux → `.deb`, `.rpm`, `.AppImage`.
On ne peut construire que pour l'OS sur lequel on est. Pour produire les trois d'un coup, pousser un tag
`v1.0.0` : le workflow `.github/workflows/desktop-release.yml` construit et dépose un brouillon de release GitHub.

## 3. ⚠️ À faire côté serveur : CORS

L'app desktop n'est plus servie depuis votre domaine. Les requêtes partent d'une origine propre à Tauri.
Ajoutez ces origines à la liste CORS autorisée de l'API :

```
http://tauri.localhost     # Windows
tauri://localhost          # macOS / Linux
https://tauri.localhost    # si vous passez useHttpsScheme à true
```

Sans cela, la connexion échouera avec une erreur réseau/CORS.

## 4. Ce qui a été adapté dans le code

- `src/lib/desktop.ts` (actif uniquement dans Tauri, appelé depuis `main.tsx`) :
  - `fetch('/api/...')` préfixé par l'URL du serveur (pas de proxy en desktop) ;
  - `window.open('')` (impression des factures/ventes) remplacé par un iframe d'impression caché ;
  - `window.open('https://…')` ouvre le navigateur système ;
  - tous les téléchargements (Excel, PDF, file-saver) passent par la boîte « Enregistrer sous » native.
- `vite.config.ts` : `strictPort`, pas de sourcemaps dans l'installateur.
- `tauri.conf.json` : fenêtre 1280×800, CSP, glisser-déposer HTML conservé, installateur NSIS en français.
- `Info.plist` : autorisation caméra (scanner de codes-barres) sur macOS.
- Corrigé : marqueurs de conflit git (`<<<<<<< HEAD`) restés dans `SaleDetailPage.tsx`, qui cassaient le build.

## 5. Icône

L'icône actuelle est un placeholder (croix blanche sur fond bleu). Pour utiliser votre logo (PNG carré 1024×1024) :

```bash
npx tauri icon chemin/vers/logo.png
```

## 6. Limites connues

- Les identifiants sont dans `localStorage` (comme en web) : conservés par la webview entre les lancements.
- Pas de signature de code : Windows SmartScreen / macOS Gatekeeper afficheront un avertissement tant qu'un certificat n'est pas configuré.
- Pas de mise à jour automatique (peut s'ajouter avec `tauri-plugin-updater`).
- Linux : l'accès caméra dans WebKitGTK peut être limité.
