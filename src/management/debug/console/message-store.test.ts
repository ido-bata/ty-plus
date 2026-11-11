import { describe, expect, it } from "vitest";

import type { LogMessage } from "./interceptor";
import {
	mergeLogMessages,
	mergeMessageEntries,
	toMessageEntry,
} from "./message-store";

const makeLog = (id: string, timestamp: string, text: string): LogMessage => ({
	id,
	level: "log",
	text,
	args: [text],
	timestamp: new Date(timestamp),
});

describe("debug console message store", () => {
	it("merges remote CEP payload messages directly by id", () => {
		const local = toMessageEntry(
			makeLog("local", "2026-04-30T00:00:02.000Z", "local"),
		);
		const remote = makeLog(
			"remote",
			"2026-04-30T00:00:01.000Z",
			"from another panel",
		);

		expect(mergeMessageEntries([local], [remote])).toEqual([
			{
				id: "remote",
				level: "log",
				text: "from another panel",
				timestamp: new Date("2026-04-30T00:00:01.000Z"),
				source: undefined,
			},
			local,
		]);
	});

	it("replaces duplicate ids instead of rendering duplicates", () => {
		const first = toMessageEntry(
			makeLog("same", "2026-04-30T00:00:01.000Z", "old"),
		);
		const replacement = makeLog("same", "2026-04-30T00:00:02.000Z", "new");

		expect(mergeMessageEntries([first], [replacement])).toEqual([
			{
				id: "same",
				level: "log",
				text: "new",
				timestamp: new Date("2026-04-30T00:00:02.000Z"),
				source: undefined,
			},
		]);
	});

	it("merges log message sources without dropping open params when shared storage is empty", () => {
		const openParamLog = makeLog(
			"open-param",
			"2026-04-30T00:00:01.000Z",
			"startup log",
		);

		expect(mergeLogMessages([openParamLog], [])).toEqual([openParamLog]);
	});
});
