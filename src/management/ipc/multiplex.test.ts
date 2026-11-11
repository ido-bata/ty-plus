import { describe, expect, it, vi } from "vitest";
import { type SurfaceId, SurfaceMultiplex } from "./multiplex";

describe("SurfaceMultiplex", () => {
	const mockTransport = {
		request: vi.fn().mockResolvedValue({ result: "ok" }),
	};

	it("creates a surface connection", () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId: SurfaceId = { type: "panel", id: "panel-1" };

		const connection = multiplex.createSurface(surfaceId);
		expect(connection.surfaceId).toEqual(surfaceId);
		expect(connection.isConnected).toBe(true);
	});

	it("routes requests through transport", async () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId: SurfaceId = { type: "panel", id: "panel-1" };
		const connection = multiplex.createSurface(surfaceId);

		const result = await connection.request("test.method", { data: "test" });
		expect(mockTransport.request).toHaveBeenCalledWith("test.method", {
			data: "test",
		});
		expect(result).toEqual({ result: "ok" });
	});

	it("rejects request when surface is disconnected", async () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId: SurfaceId = { type: "panel", id: "panel-1" };
		const connection = multiplex.createSurface(surfaceId);

		await connection.disconnect();
		await expect(connection.request("test.method", {})).rejects.toThrow(
			"surface panel-1 is disconnected",
		);
	});

	it("removes surface on disconnect", async () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId: SurfaceId = { type: "panel", id: "panel-1" };
		const connection = multiplex.createSurface(surfaceId);

		await connection.disconnect();
		expect(multiplex.getSurface(surfaceId)).toBeUndefined();
	});

	it("returns active surfaces", () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId1: SurfaceId = { type: "panel", id: "panel-1" };
		const surfaceId2: SurfaceId = { type: "modeless", id: "modeless-1" };

		multiplex.createSurface(surfaceId1);
		multiplex.createSurface(surfaceId2);

		const active = multiplex.getActiveSurfaces();
		expect(active).toHaveLength(2);
	});

	it("disconnects all surfaces", async () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const surfaceId1: SurfaceId = { type: "panel", id: "panel-1" };
		const surfaceId2: SurfaceId = { type: "modeless", id: "modeless-1" };

		multiplex.createSurface(surfaceId1);
		multiplex.createSurface(surfaceId2);

		await multiplex.disconnectAll();
		expect(multiplex.getActiveSurfaces()).toHaveLength(0);
	});

	it("supports multiple surface types", () => {
		const multiplex = new SurfaceMultiplex(mockTransport);
		const panelId: SurfaceId = { type: "panel", id: "panel-1" };
		const modelessId: SurfaceId = { type: "modeless", id: "modeless-1" };
		const workspaceId: SurfaceId = { type: "workspace", id: "workspace-1" };

		multiplex.createSurface(panelId);
		multiplex.createSurface(modelessId);
		multiplex.createSurface(workspaceId);

		expect(multiplex.getActiveSurfaces()).toHaveLength(3);
	});
});
