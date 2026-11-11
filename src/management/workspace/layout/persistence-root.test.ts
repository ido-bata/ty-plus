import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTyPlusManagedRootForPersistence } from "../../setting/persistence/ty-plus-managed-root";
import { resolveWorkspacePersistenceManagedRoot } from "./persistence-root";

vi.mock("../../setting/persistence/ty-plus-managed-root", () => ({
	resolveTyPlusManagedRootForPersistence: vi.fn(),
}));

describe("resolveWorkspacePersistenceManagedRoot", () => {
	const win = {} as Window;

	beforeEach(() => {
		vi.mocked(resolveTyPlusManagedRootForPersistence).mockReset();
	});

	it("normalizes explicit onboarding / bridge support root to managed ty-plus", async () => {
		await expect(
			resolveWorkspacePersistenceManagedRoot(win, "D:/proj/data"),
		).resolves.toBe("D:/proj/data/ty-plus");
	});

	it("canonicalizes a stale explicit root through ty-plus-init.json", async () => {
		const readFile = vi.fn(async (path: string) => {
			expect(path).toBe("D:/ae/Support Files/ty-plus-init.json");
			return JSON.stringify({
				version: 1,
				supportRoot: "C:/Users/rebui/Desktop/a",
				updatedAt: "2026-05-27T00:00:00.000Z",
			});
		});
		const winWithFs = {
			cep_node: {
				require: () => ({
					promises: { readFile },
				}),
			},
		} as unknown as Window;

		await expect(
			resolveWorkspacePersistenceManagedRoot(
				winWithFs,
				"D:/ae/Support Files/ty-plus",
			),
		).resolves.toBe("C:/Users/rebui/Desktop/a/ty-plus");
	});

	it("prefers settings-backed managed root when present", async () => {
		vi.mocked(resolveTyPlusManagedRootForPersistence).mockResolvedValue(
			"/u/ty-plus",
		);
		await expect(resolveWorkspacePersistenceManagedRoot(win)).resolves.toBe(
			"/u/ty-plus",
		);
	});

	it("refuses to infer a managed root from host support before onboarding/settings", async () => {
		vi.mocked(resolveTyPlusManagedRootForPersistence).mockResolvedValue(null);
		await expect(
			resolveWorkspacePersistenceManagedRoot(win),
		).resolves.toBeNull();
	});
});
