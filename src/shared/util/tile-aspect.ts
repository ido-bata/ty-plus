import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

type TileAspect = "square" | "wide";

export type TileAspectOptions = {
	storageKey: string;
	storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

export type TileAspectApi = {
	aspect: TileAspect;
	setAspect: Dispatch<SetStateAction<TileAspect>>;
};

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

function readAspect(
	storage: Pick<Storage, "getItem" | "setItem"> | null,
	key: string,
): TileAspect {
	if (!storage) {
		return "square";
	}
	try {
		return storage.getItem(key) === "wide" ? "wide" : "square";
	} catch {
		return "square";
	}
}

export function useTileAspect(opts: TileAspectOptions): TileAspectApi {
	const { storageKey, storage: storageOpt } = opts;
	const [aspect, setAspect] = useState<TileAspect>(() =>
		readAspect(resolveStorage(storageOpt), storageKey),
	);

	useEffect(() => {
		try {
			resolveStorage(storageOpt)?.setItem(storageKey, aspect);
		} catch {
			/* ignore */
		}
	}, [storageOpt, storageKey, aspect]);

	return { aspect, setAspect };
}
