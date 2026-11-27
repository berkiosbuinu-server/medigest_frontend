/**
 * Adaptations pour la version desktop (Tauri).
 *
 * Dans le navigateur, tout ceci est inactif (isTauri() === false).
 * Dans Tauri (WebView2 / WKWebView / WebKitGTK), on corrige ce qui ne marche pas
 * comme dans un vrai navigateur :
 *   1. fetch('/api/...')            -> préfixé par l'URL du serveur (il n'y a pas de proxy)
 *   2. window.open('', ...)         -> impression via un iframe caché (pas de popup)
 *   3. window.open('https://...')   -> ouvre le navigateur système
 *   4. <a download href="blob:..."> -> boîte « Enregistrer sous » native
 *      (couvre file-saver, XLSX.writeFile, jsPDF.save)
 */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function apiOrigin(): string {
  const env = import.meta.env;
  const base = (env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (base) return base.replace(/\/+$/, '');
  try {
    return new URL((env.VITE_API_URL as string | undefined) ?? '').origin;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* 1. fetch relatif                                                    */
/* ------------------------------------------------------------------ */
function patchFetch(): void {
  const origin = apiOrigin();
  if (!origin) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      input = origin + input;
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}

/* ------------------------------------------------------------------ */
/* 2 & 3. window.open                                                  */
/* ------------------------------------------------------------------ */
let printFrame: HTMLIFrameElement | null = null;

/** Renvoie une « fenêtre » (celle d'un iframe caché) utilisable comme window.open('') pour imprimer. */
function openPrintFrame(): Window | null {
  printFrame?.remove();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '800px',
    height: '600px',
    border: '0',
  });
  document.body.appendChild(iframe);
  printFrame = iframe;

  const win = iframe.contentWindow;
  if (!win) return null;

  const nativePrint = win.print.bind(win);
  // Laisse le temps au contenu (images, QR code) de se charger avant d'ouvrir l'impression.
  Object.defineProperty(win, 'print', {
    value: () => setTimeout(nativePrint, 300),
    configurable: true,
  });
  // window.close() n'a pas de sens ici : on garde l'iframe jusqu'à la prochaine impression.
  Object.defineProperty(win, 'close', { value: () => undefined, configurable: true });
  return win;
}

function patchWindowOpen(): void {
  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const u = url?.toString() ?? '';
    if (u === '' || u === 'about:blank') return openPrintFrame();

    const external = /^https?:\/\//i.test(u) ? u : u.startsWith('/') ? apiOrigin() + u : null;
    if (external) {
      void import('@tauri-apps/plugin-opener')
        .then(({ openUrl }) => openUrl(external))
        .catch((e) => console.error('Impossible d’ouvrir le lien', e));
      return null;
    }
    return nativeOpen(url, target, features);
  }) as typeof window.open;
}

/* ------------------------------------------------------------------ */
/* 4. Téléchargements                                                  */
/* ------------------------------------------------------------------ */
async function saveFromUrl(href: string, filename: string): Promise<void> {
  // On lance la lecture tout de suite : certaines libs révoquent le blob: très vite.
  const dataPromise = fetch(href).then((r) => r.arrayBuffer());
  try {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const ext = filename.includes('.') ? filename.split('.').pop()! : '';
    const path = await save({
      defaultPath: filename,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
    });
    if (!path) return; // annulé par l'utilisateur
    await writeFile(path, new Uint8Array(await dataPromise));
  } catch (e) {
    console.error('Échec de l’enregistrement du fichier', e);
    window.alert('Impossible d’enregistrer le fichier.');
  }
}

function isDownloadAnchor(a: HTMLAnchorElement): boolean {
  return a.hasAttribute('download') && /^(blob:|data:)/.test(a.href);
}

function patchDownloads(): void {
  const proto = HTMLAnchorElement.prototype;
  const nativeClick = proto.click;
  const nativeDispatch = proto.dispatchEvent;

  proto.click = function (this: HTMLAnchorElement) {
    if (isDownloadAnchor(this)) {
      void saveFromUrl(this.href, this.download || 'fichier');
      return;
    }
    nativeClick.call(this);
  };

  proto.dispatchEvent = function (this: HTMLAnchorElement, event: Event) {
    if (event.type === 'click' && isDownloadAnchor(this)) {
      void saveFromUrl(this.href, this.download || 'fichier');
      return true;
    }
    return nativeDispatch.call(this, event);
  };
}

/* ------------------------------------------------------------------ */
export function installDesktopShims(): void {
  if (!isTauri()) return;
  patchFetch();
  patchWindowOpen();
  patchDownloads();
}
