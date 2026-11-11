type EvalFn = (script: string, cb?: (r: string) => void) => void;

const getCepEvalScript = (win: Window): EvalFn | null => {
	const w = win as unknown as {
		__adobe_cep__?: { evalScript?: EvalFn };
		CSInterface?: new () => { evalScript?: EvalFn };
	};
	if (typeof w.__adobe_cep__?.evalScript === "function")
		return w.__adobe_cep__.evalScript.bind(w.__adobe_cep__);
	try {
		if (w.CSInterface) {
			const cs = new w.CSInterface();
			if (typeof cs.evalScript === "function") return cs.evalScript.bind(cs);
		}
	} catch {
		/* noop */
	}
	return null;
};

export const evalScript = (win: Window, script: string): Promise<string> =>
	new Promise((resolve) => {
		const ev = getCepEvalScript(win);
		if (!ev) {
			resolve("");
			return;
		}
		try {
			ev(script, (r) => resolve(r ?? ""));
		} catch {
			resolve("");
		}
	});

export const showExtendScriptAlert = (
	win: Window,
	message: string,
): Promise<string> =>
	evalScript(
		win,
		`alert(JSON.parse(${JSON.stringify(JSON.stringify(message))}))`,
	);
