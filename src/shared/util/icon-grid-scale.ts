import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

export type IconGridScaleOptions = {
	storageKey: string;
	min?: number;
	max?: number;
	zoomOutFactor?: number;
	enabled?: boolean;
	storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

export type IconGridScaleApi = {
	scale: number;
	setScale: Dispatch<SetStateAction<number>>;
	hostRef: RefObject<HTMLDivElement | null>;
};

const DEFAULT_MIN = 0.65;
const DEFAULT_MAX = 1.75;
const DEFAULT_ZOOM_OUT_FACTOR = 0.94;

function resolveStorage(
	storage?: Pick<Storage, "getItem" | "setItem"> | null,
): Pick<Storage, "getItem" | "setItem"> | null {
	if (storage !== undefined) {
		return storage;
	}
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function readScale(
	storage: Pick<Storage, "getItem" | "setItem"> | null,
	key: string,
	min: number,
	max: number,
): number {
	if (!storage) {
		return 1;
	}
	try {
		const raw = storage.getItem(key);
		if (!raw) {
			return 1;
		}
		const n = Number.parseFloat(raw);
		if (!Number.isFinite(n)) {
			return 1;
		}
		return Math.min(max, Math.max(min, n));
	} catch {
		return 1;
	}
}

export function useIconGridScale(opts: IconGridScaleOptions): IconGridScaleApi {
	const {
		storageKey,
		min = DEFAULT_MIN,
		max = DEFAULT_MAX,
		zoomOutFactor = DEFAULT_ZOOM_OUT_FACTOR,
		enabled = true,
		storage: storageOpt,
	} = opts;
	const hostRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(() =>
		readScale(resolveStorage(storageOpt), storageKey, min, max),
	);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		const el = hostRef.current;
		if (!el) {
			return;
		}
		const onWheel = (e: WheelEvent): void => {
			if (!e.ctrlKey) {
				return;
			}
			e.preventDefault();
			const factor = e.deltaY > 0 ? zoomOutFactor : 1 / zoomOutFactor;
			setScale(
				(prev: number) =>
					Math.round(Math.min(max, Math.max(min, prev * factor)) * 100) / 100,
			);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [enabled, min, max, zoomOutFactor]);

	useEffect(() => {
		try {
			resolveStorage(storageOpt)?.setItem(storageKey, String(scale));
		} catch {
			/* ignore */
		}
	}, [storageOpt, storageKey, scale]);

	return { scale, setScale, hostRef };
}
