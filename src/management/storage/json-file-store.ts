/**
 * @deprecated Compatibility barrel only.
 * Use `management/storage/read/json-file` for read/codec helpers and
 * `management/storage/write/json-file` for mutations.
 */

export {
	parseJsonObject,
	readJsonFileText,
	stringifyJson,
} from "@/management/storage/read/json-file";
export { writeJsonFileText } from "@/management/storage/write/json-file";
