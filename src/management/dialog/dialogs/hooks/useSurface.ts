export type SurfaceInfo = {
	surfaceId: string;
	extensionId: string;
	isCep: boolean;
	hostCode: string;
};

export function useSurface(explicitSurfaceId?: string): SurfaceInfo {
	return {
		surfaceId: explicitSurfaceId ?? "",
		extensionId: "",
		isCep: false,
		hostCode: "",
	};
}
