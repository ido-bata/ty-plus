// Dialog probe bridge - manages dialog request/result communication across surfaces

export type ProbeRequestPayload = {
	title?: string;
	message?: string;
};

type ProbeResultPayload = {
	accepted: boolean;
	dialogId: string;
};

const createBridgeKeys = (dialogId: string) => ({
	requestKey: `dialog-request:${dialogId}`,
	resultKey: `dialog-result:${dialogId}`,
});

const requestStore = new Map<string, ProbeRequestPayload>();
const resultStore = new Map<string, ProbeResultPayload>();

export const storeRequest = async (
	win: Window,
	dialogId: string,
	payload: ProbeRequestPayload,
) => {
	void win;
	const { requestKey } = createBridgeKeys(dialogId);
	requestStore.set(requestKey, payload);
};

const _readRequest = async (win: Window, dialogId: string) => {
	void win;
	const { requestKey } = createBridgeKeys(dialogId);
	return requestStore.get(requestKey) ?? null;
};

const _storeResult = async (
	win: Window,
	dialogId: string,
	payload: ProbeResultPayload,
) => {
	void win;
	const { resultKey } = createBridgeKeys(dialogId);
	resultStore.set(resultKey, payload);
};

const _clearBridge = async (win: Window, dialogId: string) => {
	void win;
	const { requestKey, resultKey } = createBridgeKeys(dialogId);
	requestStore.delete(requestKey);
	resultStore.delete(resultKey);
};
