/**
 * Surface types that can communicate with the runtime.
 */
type SurfaceType = "panel" | "modeless" | "workspace";

/**
 * Unique identifier for a surface instance.
 */
export interface SurfaceId {
	readonly type: SurfaceType;
	readonly id: string;
}

/**
 * A multiplexed surface connection to the runtime.
 *
 * Each surface (panel, modeless dialog, workspace) maintains its own
 * connection state and request routing while sharing the underlying
 * transport.
 */
export interface SurfaceConnection {
	/** Unique identifier for this surface. */
	readonly surfaceId: SurfaceId;
	/** Whether this surface is currently connected. */
	isConnected: boolean;
	/** Send a request from this surface. */
	request<Request, Response>(
		method: string,
		request: Request,
	): Promise<Response>;
	/** Disconnect this surface. */
	disconnect(): Promise<void>;
}

/**
 * Multiplex manager for multiple surfaces sharing a single transport.
 *
 * Routes responses by request ID to the correct surface handler.
 */
export class SurfaceMultiplex {
	private readonly surfaces = new Map<string, SurfaceConnection>();
	private readonly transport: {
		request<Request, Response>(
			method: string,
			request: Request,
		): Promise<Response>;
	};

	constructor(transport: {
		request: <R, S>(method: string, req: R) => Promise<S>;
	}) {
		this.transport = transport;
	}

	/**
	 * Creates a new surface connection.
	 */
	createSurface(surfaceId: SurfaceId): SurfaceConnection {
		const connection: SurfaceConnection = {
			surfaceId,
			isConnected: true,
			request: async <Request, Response>(
				method: string,
				request: Request,
			): Promise<Response> => {
				if (!connection.isConnected) {
					throw new Error(`surface ${surfaceId.id} is disconnected`);
				}
				return this.transport.request(method, request);
			},
			disconnect: async () => {
				connection.isConnected = false;
				this.surfaces.delete(surfaceId.id);
			},
		};

		this.surfaces.set(surfaceId.id, connection);
		return connection;
	}

	/**
	 * Returns all active surfaces.
	 */
	getActiveSurfaces(): SurfaceConnection[] {
		return Array.from(this.surfaces.values()).filter((s) => s.isConnected);
	}

	/**
	 * Returns a specific surface by ID.
	 */
	getSurface(surfaceId: SurfaceId): SurfaceConnection | undefined {
		return this.surfaces.get(surfaceId.id);
	}

	/**
	 * Disconnects all surfaces.
	 */
	async disconnectAll(): Promise<void> {
		for (const surface of this.surfaces.values()) {
			surface.isConnected = false;
		}
		this.surfaces.clear();
	}
}
