import type { WidgetDescriptor } from "./define";

const descriptors: WidgetDescriptor[] = [];

/** Register a descriptor (idempotent by `type`: last registration wins). */
export const register = (descriptor: WidgetDescriptor): void => {
	const existing = descriptors.findIndex((d) => d.type === descriptor.type);
	if (existing >= 0) {
		descriptors[existing] = descriptor;
		return;
	}
	descriptors.push(descriptor);
};

/** All registered descriptors (read-only view). */
const allWidgetDescriptors = (): readonly WidgetDescriptor[] => descriptors;

/** Lookup a descriptor by its `type` string. */
export const getWidgetDescriptor = (
	type: string,
): WidgetDescriptor | undefined => descriptors.find((d) => d.type === type);
