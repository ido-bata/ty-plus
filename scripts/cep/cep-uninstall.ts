/** bolt-cep unlink: %s: remove unit */
import { rm } from "node:fs/promises";
import path from "node:path";

import { resolveCepExtensionsRoot } from "../lib/cep-paths";

const EXTENSION_ID = "app.ty-plus";

const dst = path.join(resolveCepExtensionsRoot("user"), EXTENSION_ID);
await rm(dst, { recursive: true, force: true });
console.log(`Removed ${dst}`);
