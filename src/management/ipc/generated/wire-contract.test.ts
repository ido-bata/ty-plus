import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { collectDeclarations } from "../../../../scripts/generate/generate-typescript-protocol";
import {
	type CanonicalOperationPolicy,
	canonicalMethods,
	canonicalOperationPolicies,
	isWireMessage,
	type ProgressEvent,
	type WireMessage,
} from "./wire";

type GeneratedPolicyFieldsAreReadonly = CanonicalOperationPolicy extends {
	readonly cancellable: boolean;
}
	? true
	: false;
const generatedPolicyFieldsAreReadonly: GeneratedPolicyFieldsAreReadonly = true;

type IfEquals<Left, Right> =
	(<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right
		? 1
		: 2
		? true
		: false;
type ExpectedReadonlyPolicy = Readonly<{
	idempotencyKey: "forbidden" | "optional" | "required";
	retryClass: "idempotent" | "non-idempotent";
	cancellable: boolean;
	retryCrashBeforeAccept: boolean;
	wireName: string;
}>;
const generatedPolicyModifiersAreReadonly: IfEquals<
	CanonicalOperationPolicy,
	ExpectedReadonlyPolicy
> = true;

type JsonObject = Record<string, unknown>;
type SchemaNode = boolean | JsonObject;

const schemaCatalog = parseJson(
	new URL(
		"../../../../rust/crates/protocol/generated/wire.schema.json",
		import.meta.url,
	),
);
const wireSchema = objectProperty(
	objectProperty(schemaCatalog, "documents"),
	"wireMessage",
) as SchemaNode;

function parseJson(url: URL): unknown {
	return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function fixture(name: string): unknown {
	return parseJson(
		new URL(
			`../../../../rust/crates/protocol/tests/fixtures/${name}`,
			import.meta.url,
		),
	);
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectProperty(value: unknown, key: string): unknown {
	if (!isObject(value) || !(key in value)) {
		throw new Error(`schema is missing ${key}`);
	}
	return value[key];
}

function schemaObject(value: unknown, location: string): JsonObject {
	if (!isObject(value)) {
		throw new Error(`invalid schema node at ${location}`);
	}
	return value;
}

function resolveReference(reference: string, root: JsonObject): SchemaNode {
	const prefix = "#/$defs/";
	if (!reference.startsWith(prefix)) {
		throw new Error(`unsupported schema reference: ${reference}`);
	}
	const name = reference.slice(prefix.length);
	return objectProperty(objectProperty(root, "$defs"), name) as SchemaNode;
}

function matchesType(type: string, value: unknown): boolean {
	switch (type) {
		case "array":
			return Array.isArray(value);
		case "boolean":
			return typeof value === "boolean";
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "null":
			return value === null;
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "object":
			return isObject(value);
		case "string":
			return typeof value === "string";
		default:
			throw new Error(`unsupported schema type: ${type}`);
	}
}

function validateSchema(
	schema: SchemaNode,
	value: unknown,
	root: JsonObject,
	path = "$",
): string[] {
	if (schema === true) return [];
	if (schema === false) return [`${path}: schema rejects every value`];

	if (typeof schema.$ref === "string") {
		return validateSchema(
			resolveReference(schema.$ref, root),
			value,
			root,
			path,
		);
	}

	if (Array.isArray(schema.oneOf)) {
		const branchErrors = schema.oneOf.map((candidate) =>
			validateSchema(candidate as SchemaNode, value, root, path),
		);
		const successes = branchErrors.filter((errors) => errors.length === 0);
		return successes.length === 1
			? []
			: [
					`${path}: expected exactly one matching oneOf branch`,
					...branchErrors.flat(),
				];
	}
	if (schema.oneOf !== undefined) {
		throw new Error(`${path}: oneOf must be an array`);
	}
	if (Array.isArray(schema.anyOf)) {
		const branchErrors = schema.anyOf.map((candidate) =>
			validateSchema(candidate as SchemaNode, value, root, path),
		);
		return branchErrors.some((errors) => errors.length === 0)
			? []
			: [`${path}: expected a matching anyOf branch`, ...branchErrors.flat()];
	}
	if (schema.anyOf !== undefined) {
		throw new Error(`${path}: anyOf must be an array`);
	}
	if (Array.isArray(schema.allOf)) {
		return schema.allOf.flatMap((candidate) =>
			validateSchema(candidate as SchemaNode, value, root, path),
		);
	}
	if (schema.allOf !== undefined) {
		throw new Error(`${path}: allOf must be an array`);
	}

	const errors: string[] = [];
	const declaredTypes = Array.isArray(schema.type)
		? schema.type
		: schema.type === undefined
			? []
			: [schema.type];
	if (
		declaredTypes.length > 0 &&
		!declaredTypes.some(
			(type) => typeof type === "string" && matchesType(type, value),
		)
	) {
		return [`${path}: value does not match declared type`];
	}

	if ("const" in schema && !Object.is(schema.const, value)) {
		errors.push(`${path}: value does not match const`);
	}
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		errors.push(`${path}: value is not in enum`);
	}

	if (typeof value === "number") {
		if (typeof schema.minimum === "number" && value < schema.minimum) {
			errors.push(`${path}: value is below minimum`);
		}
		if (typeof schema.maximum === "number" && value > schema.maximum) {
			errors.push(`${path}: value is above maximum`);
		}
		if (
			schema.format === "uint64" &&
			(!Number.isSafeInteger(value) || value < 0)
		) {
			errors.push(`${path}: uint64 is outside JavaScript's safe integer range`);
		}
	}

	if (Array.isArray(value)) {
		if (
			schema.uniqueItems === true &&
			new Set(value.map((item) => JSON.stringify(item))).size !== value.length
		) {
			errors.push(`${path}: array items are not unique`);
		}
		if (schema.items !== undefined) {
			value.forEach((item, index) => {
				errors.push(
					...validateSchema(
						schema.items as SchemaNode,
						item,
						root,
						`${path}[${index}]`,
					),
				);
			});
		}
	}

	if (isObject(value)) {
		const properties =
			schema.properties === undefined
				? {}
				: schemaObject(schema.properties, `${path}.properties`);
		if (Array.isArray(schema.required)) {
			for (const required of schema.required) {
				if (typeof required === "string" && !(required in value)) {
					errors.push(`${path}.${required}: required property is missing`);
				}
			}
		}
		for (const [key, item] of Object.entries(value)) {
			const propertySchema = properties[key];
			if (propertySchema !== undefined) {
				errors.push(
					...validateSchema(
						propertySchema as SchemaNode,
						item,
						root,
						`${path}.${key}`,
					),
				);
			} else if (schema.additionalProperties === false) {
				errors.push(`${path}.${key}: unknown property`);
			}
		}
	}

	return errors;
}

function assertWireFixture(value: unknown): asserts value is WireMessage {
	const root = schemaObject(wireSchema, "wireMessage");
	const errors = validateSchema(wireSchema, value, root);
	if (errors.length > 0) {
		throw new Error(errors.join("\n"));
	}
}

describe("Rust and TypeScript wire fixtures", () => {
	it.each(["request.json", "response.json", "event.json"])(
		"accepts the Rust golden fixture %s through the generated contract",
		(name) => {
			const value = fixture(name);
			assertWireFixture(value);
			expectTypeOf(value).toEqualTypeOf<WireMessage>();
		},
	);

	it("accepts accepted events and invocation root selection from the generated schema", () => {
		const accepted: WireMessage = {
			kind: "event",
			message: {
				protocol_version: { major: 1, minor: 0 },
				session_id: "session-1",
				request_id: "request-1",
				payload: {
					event: "accepted",
					data: { request_id: "request-1", session_id: "session-1" },
				},
			},
		};
		assertWireFixture(accepted);
		expect(accepted.message.payload.event).toBe("accepted");
	});

	it("rejects same-name schemas whose title property has different semantics", () => {
		const schema = (type: "string" | "number") => ({
			additionalProperties: false,
			properties: { title: { type } },
			required: ["title"],
			title: "Duplicate",
			type: "object",
		});
		const catalog = {
			documents: {
				first: schema("string"),
				second: schema("number"),
			},
		} as unknown as Parameters<typeof collectDeclarations>[0];

		expect(() => collectDeclarations(catalog)).toThrow(
			"documents.second conflicts with existing declaration Duplicate",
		);
	});

	it("preserves optional versus nullable progress fields at the safe integer boundary", () => {
		const value = fixture("optional-null-event.json");
		assertWireFixture(value);
		expect(value.kind).toBe("event");
		if (value.kind !== "event" || value.message.payload.event !== "progress") {
			throw new Error("fixture must contain a progress event");
		}

		const progress = value.message.payload.data;
		expectTypeOf(progress).toEqualTypeOf<ProgressEvent>();
		expect(progress.sequence).toBe(Number.MAX_SAFE_INTEGER);
		expect("completed_units" in progress).toBe(false);
		expect(progress.total_units).toBeNull();
		expect(progress.user_safe_detail).toBeNull();
	});

	it("rejects an unknown field at runtime from the Rust schema", () => {
		const value = fixture("unknown-field-request.json");
		expect(() => assertWireFixture(value)).toThrow("unknown property");
	});

	it("rejects a Rust-valid uint64 that JavaScript cannot represent exactly", () => {
		const value = fixture("unsafe-integer-event.json");
		expect(() => assertWireFixture(value)).toThrow(
			"outside JavaScript's safe integer range",
		);
	});

	it.each(["request.json", "response.json", "event.json"])(
		"accepts %s through the generated runtime validator",
		(name) => {
			expect(isWireMessage(fixture(name))).toBe(true);
		},
	);

	it.each([
		{ kind: "request", message: {} },
		{ kind: "cancel", message: {} },
		{ kind: "response", message: {} },
		{ kind: "event", message: {} },
		fixture("unknown-field-request.json"),
		fixture("unsafe-integer-event.json"),
	])(
		"rejects malformed messages through the generated runtime validator",
		(value) => {
			expect(isWireMessage(value)).toBe(false);
		},
	);

	it("validates on the CEP target without Object.hasOwn", () => {
		const descriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn");
		Object.defineProperty(Object, "hasOwn", {
			configurable: true,
			value: undefined,
		});
		try {
			expect(isWireMessage(fixture("request.json"))).toBe(true);
		} finally {
			if (descriptor === undefined) {
				Reflect.deleteProperty(Object, "hasOwn");
			} else {
				Object.defineProperty(Object, "hasOwn", descriptor);
			}
		}
	});

	it("rejects prototype-named fields as unknown own properties", () => {
		const value = JSON.parse(
			'{"kind":"cancel","message":{"target_request_id":"request-1","__proto__":{"type":"string"}}}',
		) as unknown;
		expect(isWireMessage(value)).toBe(false);
	});
});

describe("generated canonical operation policy", () => {
	it("contains exactly one Rust-owned policy for every canonical method", () => {
		// Production break caught: generated clients must not maintain a partial or
		// duplicate retry/cancellation policy table.
		expect(canonicalOperationPolicies).toEqual({
			online_catalog_search: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.search",
			},
			online_connectivity_check: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.connectivity.check",
			},
			online_download: {
				cancellable: true,
				idempotencyKey: "forbidden",
				retryClass: "non-idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.download",
			},
			online_catalog_cache_read: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.cache.read",
			},
			online_catalog_cache_write: {
				cancellable: true,
				idempotencyKey: "forbidden",
				retryClass: "non-idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.cache.write",
			},
			online_catalog_cache_delete: {
				cancellable: true,
				idempotencyKey: "forbidden",
				retryClass: "non-idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.cache.delete",
			},
			online_catalog_cache_clear: {
				cancellable: true,
				idempotencyKey: "forbidden",
				retryClass: "non-idempotent",
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.cache.clear",
			},
			host_plugin_effect_scan: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "host.plugin.effect.scan",
			},
			host_thumbnail_lookup: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "host.thumbnail.lookup",
			},
			host_thumbnail_generate: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "host.thumbnail.generate",
			},
			host_thumbnail_lookup_or_generate: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "host.thumbnail.lookup_or_generate",
			},
			host_thumbnail_batch: {
				cancellable: true,
				idempotencyKey: "optional",
				retryClass: "idempotent",
				retryCrashBeforeAccept: false,
				wireName: "host.thumbnail.batch",
			},
		});
		expect(Object.keys(canonicalOperationPolicies).sort()).toEqual(
			[...canonicalMethods].sort(),
		);
	});

	it("freezes the complete policy table and each policy object", () => {
		// Production break caught: generated policy metadata must be immutable at
		// runtime so callers cannot alter retry or cancellation authority.
		expect(Object.isFrozen(canonicalOperationPolicies)).toBe(true);
		for (const method of canonicalMethods) {
			expect(Object.isFrozen(canonicalOperationPolicies[method])).toBe(true);
		}
	});

	it("publishes readonly policy fields to TypeScript callers", () => {
		// Production break caught: a mutable generated type would let callers
		// compile a policy override even if runtime freezing later rejected it.
		const policy: CanonicalOperationPolicy =
			canonicalOperationPolicies.host_plugin_effect_scan;
		expect(generatedPolicyFieldsAreReadonly).toBe(true);
		expect(generatedPolicyModifiersAreReadonly).toBe(true);
		expect(policy.cancellable).toBe(true);
	});
});
