import type { JSX } from "react";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { EasingEditor } from "./EasingEditor";

export function EasingWidget({ layout }: { layout: Layout }): JSX.Element {
	return <EasingEditor layout={layout} />;
}
