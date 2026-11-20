export type ClassValue =
	| string
	| null
	| undefined
	| false
	| Record<string, boolean | null | undefined>;

export function cx(...values: ClassValue[]): string {
	const out: string[] = [];
	for (const v of values) {
		if (!v) continue;
		if (typeof v === "string") {
			if (v.trim()) out.push(v);
			continue;
		}
		for (const [k, ok] of Object.entries(v)) {
			if (ok) out.push(k);
		}
	}
	return out.join(" ");
}
