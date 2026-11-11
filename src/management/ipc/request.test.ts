import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
	type RuntimeMethod,
	type RuntimeRequestDispatcher,
	scopeRuntimeRequests,
} from "./request";

declare const storageScopeToken: unique symbol;
type StorageScope = { readonly [storageScopeToken]: never };

declare const onlineScopeToken: unique symbol;
type OnlineScope = { readonly [onlineScopeToken]: never };

describe("scopeRuntimeRequests", () => {
	it("preserves typed request dispatch without interpreting the operation", async () => {
		const send = vi.fn(async (_method: string, _request: unknown) => ({
			found: true,
		}));
		const dispatcher: RuntimeRequestDispatcher = {
			request: async <Scope, Request, Response>(
				method: RuntimeMethod<Scope, Request, Response>,
				request: Request,
			) => send(method.name, request) as Promise<Response>,
		};
		const storage = scopeRuntimeRequests<StorageScope>(dispatcher);
		const method: RuntimeMethod<
			StorageScope,
			{ workspaceId: string },
			{ found: boolean }
		> = { name: "fixture.storage.lookup" };

		const result = await storage.request(method, {
			workspaceId: "workspace-1",
		});

		expect(result).toEqual({ found: true });
		expect(send).toHaveBeenCalledWith("fixture.storage.lookup", {
			workspaceId: "workspace-1",
		});
		expectTypeOf(result).toEqualTypeOf<{ found: boolean }>();
	});

	it("keeps methods from different responsibility scopes distinct", () => {
		const dispatcher = {} as RuntimeRequestDispatcher;
		const storage = scopeRuntimeRequests<StorageScope>(dispatcher);
		const onlineMethod = {} as RuntimeMethod<
			OnlineScope,
			{ query: string },
			{ count: number }
		>;

		if (false) {
			// @ts-expect-error An online method cannot be sent through the storage port.
			void storage.request(onlineMethod, { query: "preset" });
		}

		expectTypeOf(storage).toHaveProperty("request");
	});
});
