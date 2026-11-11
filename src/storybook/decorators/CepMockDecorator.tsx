/**
 * Side-effect-only decorator — importing this module installs the
 * `__adobe_cep__` shim on `window` before any story renders. This must
 * be the first decorator in the chain so that subsequent imports of
 * `@/management/ae/cep/runtime` see a non-empty host.
 */
import "./cep-shim";

import type { Decorator } from "@storybook/react";

export const CepMockDecorator: Decorator = (Story) => Story();
