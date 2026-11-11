/**
 * CEP Modeless HTML entry shim only.
 * Dialog routing, surface resolution, and boot live in `management/dialog/modeless/`.
 */
import "@/management/panel/appearance-boot";

import { bootTyPlusModelessDialog } from "@/management/dialog/modeless/boot";

void bootTyPlusModelessDialog();
