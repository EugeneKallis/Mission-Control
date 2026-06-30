/**
 * Side-effect-only module that registers happy-dom's global document/window.
 *
 * Now that the bunfig.toml preload also calls GlobalRegistrator.register(),
 * this is a no-op on first run (the preload ran first). We keep the
 * idempotent import here for any code path that imports this file
 * before the preload has loaded.
 */
declare global {
  // eslint-disable-next-line no-var
  var __happyDomRegistered: boolean | undefined;
}

import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.__happyDomRegistered) {
  GlobalRegistrator.register();
  globalThis.__happyDomRegistered = true;
}
