import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GENERATOR_NAME = "ty-plus-typescript-protocol";
const GENERATOR_VERSION = "1.0.0";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = resolve(
	repoRoot,
	"rust/crates/protocol/generated/wire.schema.json",
);
const generatedDirectory = resolve(repoRoot, "src/management/ipc/generated");
const wireTypesPath = resolve(generatedDirectory, "wire.ts");
const indexPath = resolve(generatedDirectory, "index.ts");

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface ProtocolCatalog extends JsonObject {
	catalogFormat: string;
	canonicalMethods: JsonValue[];
	canonicalOperationPolicies: { [name: string]: JsonValue };
	documents: { [name: string]: JsonValue };
	generator: {
		formatVersion: number;
		name: string;
		protocolCrateVersion: string;
		schemarsVersion: string;
	};
	limits: { [name: string]: number };
	protocolVersion: { major: number; minor: number };
}

interface Declaration {
	name: string;
	schema: JsonValue;
}

const isObject = (value: JsonValue | undefined): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const expectObject = (
	value: JsonValue | undefined,
	location: string,
): JsonObject => {
	if (!isObject(value)) {
		throw new Error(`${location} must be an object`);
	}
	return value;
};

const expectString = (
	value: JsonValue | undefined,
	location: string,
): string => {
	if (typeof value !== "string") {
		throw new Error(`${location} must be a string`);
	}
	return value;
};

const expectNumber = (
	value: JsonValue | undefined,
	location: string,
): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${location} must be a finite number`);
	}
	return value;
};

const parseCatalog = (): ProtocolCatalog => {
	const parsed: JsonValue = JSON.parse(readFileSync(schemaPath, "utf8"));
	const catalog = expectObject(parsed, "protocol schema catalog");
	const sourceGenerator = expectObject(catalog.generator, "catalog.generator");
	const protocolVersion = expectObject(
		catalog.protocolVersion,
		"catalog.protocolVersion",
	);
	const limits = expectObject(catalog.limits, "catalog.limits");
	const documents = expectObject(catalog.documents, "catalog.documents");
	const canonicalMethods = catalog.canonicalMethods;
	const canonicalOperationPolicies = expectObject(
		catalog.canonicalOperationPolicies,
		"catalog.canonicalOperationPolicies",
	);

	expectString(catalog.catalogFormat, "catalog.catalogFormat");
	expectNumber(
		sourceGenerator.formatVersion,
		"catalog.generator.formatVersion",
	);
	expectString(sourceGenerator.name, "catalog.generator.name");
	expectString(
		sourceGenerator.protocolCrateVersion,
		"catalog.generator.protocolCrateVersion",
	);
	expectString(
		sourceGenerator.schemarsVersion,
		"catalog.generator.schemarsVersion",
	);
	expectNumber(protocolVersion.major, "catalog.protocolVersion.major");
	expectNumber(protocolVersion.minor, "catalog.protocolVersion.minor");
	for (const [name, value] of Object.entries(limits)) {
		expectNumber(value, `catalog.limits.${name}`);
	}
	if (!Array.isArray(canonicalMethods) || canonicalMethods.length === 0) {
		throw new Error("catalog.canonicalMethods must be a non-empty array");
	}
	for (const [index, method] of canonicalMethods.entries()) {
		expectIdentifier(
			expectString(method, `catalog.canonicalMethods[${index}]`),
			`catalog.canonicalMethods[${index}]`,
		);
	}
	if (
		Object.keys(canonicalOperationPolicies).length !== canonicalMethods.length
	) {
		throw new Error(
			"catalog.canonicalOperationPolicies must contain exactly one entry per canonical method",
		);
	}

	return catalog as ProtocolCatalog;
};

const expectIdentifier = (value: string, location: string): string => {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
		throw new Error(`${location} is not a TypeScript identifier: ${value}`);
	}
	return value;
};

const compareText = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
};

const typeNameForDocument = (name: string, schema: JsonObject): string => {
	if (typeof schema.title === "string") {
		return expectIdentifier(schema.title, `documents.${name}.title`);
	}
	const converted = name
		.split(/[^A-Za-z0-9_$]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join("");
	return expectIdentifier(converted, `documents.${name}`);
};

const literalType = (value: JsonValue, location: string): string => {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return JSON.stringify(value);
	}
	throw new Error(`${location} contains a non-primitive literal`);
};

const indent = (value: string, level = 1): string => {
	const prefix = "\t".repeat(level);
	return value
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
};

const renderPropertyName = (name: string): string =>
	/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);

const renderAtomicType = (
	type: string,
	schema: JsonObject,
	location: string,
): string => {
	switch (type) {
		case "array": {
			if (schema.items === undefined) {
				throw new Error(`${location}.items is required for an array`);
			}
			return `ReadonlyArray<${renderSchema(schema.items, `${location}.items`)}>`;
		}
		case "boolean":
			return "boolean";
		case "integer":
		case "number":
			return "number";
		case "null":
			return "null";
		case "object":
			return renderObject(schema, location);
		case "string":
			return "string";
		default:
			throw new Error(`${location}.type is unsupported: ${type}`);
	}
};

const renderObject = (schema: JsonObject, location: string): string => {
	const properties = schema.properties;
	const requiredValue = schema.required;
	if (requiredValue !== undefined && !Array.isArray(requiredValue)) {
		throw new Error(`${location}.required must be an array`);
	}
	const required = new Set(
		(requiredValue ?? []).map((value, index) =>
			expectString(value, `${location}.required[${index}]`),
		),
	);

	if (properties === undefined) {
		if (schema.additionalProperties === false) {
			return "Record<string, never>";
		}
		if (
			schema.additionalProperties === undefined ||
			schema.additionalProperties === true
		) {
			return "Record<string, unknown>";
		}
		return `Record<string, ${renderSchema(
			schema.additionalProperties,
			`${location}.additionalProperties`,
		)}>`;
	}

	const propertyMap = expectObject(properties, `${location}.properties`);
	const entries = Object.entries(propertyMap).sort(([left], [right]) =>
		compareText(left, right),
	);
	for (const name of required) {
		if (!(name in propertyMap)) {
			throw new Error(
				`${location}.required references missing property ${name}`,
			);
		}
	}

	const fields = entries.map(([name, propertySchema]) => {
		const optional = required.has(name) ? "" : "?";
		const rendered = renderSchema(
			propertySchema,
			`${location}.properties.${name}`,
		);
		return `${renderPropertyName(name)}${optional}: ${rendered};`;
	});
	if (
		schema.additionalProperties !== undefined &&
		schema.additionalProperties !== false
	) {
		throw new Error(
			`${location}.additionalProperties must be false when properties are declared`,
		);
	}
	return `{\n${indent(fields.join("\n"))}\n}`;
};

const canonicalData = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) {
		return value.map(canonicalData);
	}
	if (!isObject(value)) {
		return value;
	}

	const entries = Object.entries(value).sort(([left], [right]) =>
		compareText(left, right),
	);
	return Object.fromEntries(
		entries.map(([key, entry]) => [key, canonicalData(entry)]),
	) as JsonObject;
};

const canonicalSchemaMap = (value: JsonObject): JsonObject =>
	Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => compareText(left, right))
			.map(([key, entry]) => [key, canonicalSchema(entry)]),
	) as JsonObject;

const schemaObjectKeywords = new Set([
	"additionalProperties",
	"contains",
	"else",
	"if",
	"items",
	"not",
	"propertyNames",
	"then",
	"unevaluatedItems",
	"unevaluatedProperties",
]);

const schemaArrayKeywords = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);

const canonicalSchema = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) {
		return value.map(canonicalSchema);
	}
	if (!isObject(value)) {
		return value;
	}

	const entries = Object.entries(value)
		.filter(([key]) => key !== "$schema" && key !== "title")
		.sort(([left], [right]) => compareText(left, right));
	return Object.fromEntries(
		entries.map(([key, entry]) => {
			if (
				(key === "$defs" ||
					key === "dependentSchemas" ||
					key === "patternProperties" ||
					key === "properties") &&
				isObject(entry)
			) {
				return [key, canonicalSchemaMap(entry)];
			}
			if (schemaObjectKeywords.has(key) && isObject(entry)) {
				return [key, canonicalSchema(entry)];
			}
			if (schemaArrayKeywords.has(key) && Array.isArray(entry)) {
				return [key, entry.map(canonicalSchema)];
			}
			return [key, canonicalData(entry)];
		}),
	) as JsonObject;
};

const schemasMatch = (left: JsonValue, right: JsonValue): boolean =>
	JSON.stringify(canonicalSchema(left)) ===
	JSON.stringify(canonicalSchema(right));

const renderSchema = (schemaValue: JsonValue, location: string): string => {
	if (schemaValue === true) {
		return "unknown";
	}
	if (schemaValue === false) {
		return "never";
	}
	const schema = expectObject(schemaValue, location);

	if (schema.$ref !== undefined) {
		const reference = expectString(schema.$ref, `${location}.$ref`);
		const match = /^#\/\$defs\/([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(reference);
		if (!match?.[1]) {
			throw new Error(`${location} has unsupported reference ${reference}`);
		}
		return match[1];
	}
	if (schema.const !== undefined) {
		return literalType(schema.const, `${location}.const`);
	}
	if (schema.enum !== undefined) {
		if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
			throw new Error(`${location}.enum must be a non-empty array`);
		}
		return schema.enum
			.map((value, index) => literalType(value, `${location}.enum[${index}]`))
			.join(" | ");
	}
	for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
		const branches = schema[keyword];
		if (branches !== undefined) {
			if (!Array.isArray(branches) || branches.length === 0) {
				throw new Error(`${location}.${keyword} must be a non-empty array`);
			}
			const separator = keyword === "allOf" ? " & " : " | ";
			return branches
				.map(
					(branch, index) =>
						`(${renderSchema(branch, `${location}.${keyword}[${index}]`)})`,
				)
				.join(separator);
		}
	}

	const type = schema.type;
	if (Array.isArray(type)) {
		if (type.length === 0) {
			throw new Error(`${location}.type must not be empty`);
		}
		return type
			.map((entry, index) =>
				renderAtomicType(
					expectString(entry, `${location}.type[${index}]`),
					schema,
					location,
				),
			)
			.join(" | ");
	}
	if (typeof type === "string") {
		return renderAtomicType(type, schema, location);
	}
	if (schema.properties !== undefined) {
		return renderObject(schema, location);
	}
	throw new Error(`${location} has no supported type constraint`);
};

interface TopLevelCombination {
	members: string[];
	operator: "&" | "|";
}

const topLevelCombination = (
	schemaValue: JsonValue,
	location: string,
): TopLevelCombination | null => {
	if (!isObject(schemaValue)) {
		return null;
	}
	if (schemaValue.enum !== undefined) {
		if (!Array.isArray(schemaValue.enum) || schemaValue.enum.length === 0) {
			throw new Error(`${location}.enum must be a non-empty array`);
		}
		return {
			members: schemaValue.enum.map((value, index) =>
				literalType(value, `${location}.enum[${index}]`),
			),
			operator: "|",
		};
	}
	for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
		const branches = schemaValue[keyword];
		if (branches === undefined) {
			continue;
		}
		if (!Array.isArray(branches) || branches.length === 0) {
			throw new Error(`${location}.${keyword} must be a non-empty array`);
		}
		return {
			members: branches.map((branch, index) =>
				renderSchema(branch, `${location}.${keyword}[${index}]`),
			),
			operator: keyword === "allOf" ? "&" : "|",
		};
	}
	if (Array.isArray(schemaValue.type)) {
		if (schemaValue.type.length === 0) {
			throw new Error(`${location}.type must not be empty`);
		}
		return {
			members: schemaValue.type.map((entry, index) =>
				renderAtomicType(
					expectString(entry, `${location}.type[${index}]`),
					schemaValue,
					location,
				),
			),
			operator: "|",
		};
	}
	return null;
};

const renderCombinationMember = (
	member: string,
	operator: "&" | "|",
): string[] => {
	const lines = member.split("\n");
	if (lines.length === 1) {
		return [`\t${operator} ${member}`];
	}
	return [
		`\t${operator} ${lines[0]}`,
		...lines.slice(1, -1).map((line) => `\t\t${line}`),
		`\t  ${lines.at(-1)}`,
	];
};

const renderDeclaration = ({ name, schema }: Declaration): string => {
	const location = `declaration.${name}`;
	const combination = topLevelCombination(schema, location);
	if (combination === null) {
		return `export type ${name} = ${renderSchema(schema, location)};`;
	}
	const inline = `export type ${name} = ${combination.members.join(
		` ${combination.operator} `,
	)};`;
	if (
		!combination.members.some((member) => member.includes("\n")) &&
		inline.length <= 80
	) {
		return inline;
	}
	const lines = combination.members.flatMap((member) =>
		renderCombinationMember(member, combination.operator),
	);
	lines[lines.length - 1] = `${lines.at(-1)};`;
	return `export type ${name} =\n${lines.join("\n")}`;
};

const renderConstObject = (
	entries: ReadonlyArray<readonly [string, number]>,
): string =>
	`{\n${indent(
		entries
			.map(([name, value]) => `${renderPropertyName(name)}: ${value},`)
			.join("\n"),
	)}\n}`;

const renderCanonicalPolicies = (catalog: ProtocolCatalog): string => {
	const methods = catalog.canonicalMethods.map((value, index) =>
		expectIdentifier(
			expectString(value, `catalog.canonicalMethods[${index}]`),
			`catalog.canonicalMethods[${index}]`,
		),
	);
	const policies = expectObject(
		catalog.canonicalOperationPolicies,
		"catalog.canonicalOperationPolicies",
	);
	const entries = methods.map((method) => {
		const policy = expectObject(
			policies[method],
			`catalog.canonicalOperationPolicies.${method}`,
		);
		const idempotencyKey = expectString(
			policy.idempotencyKey,
			`catalog.canonicalOperationPolicies.${method}.idempotencyKey`,
		);
		const retryClass = expectString(
			policy.retryClass,
			`catalog.canonicalOperationPolicies.${method}.retryClass`,
		);
		const wireName = expectString(
			policy.wireName,
			`catalog.canonicalOperationPolicies.${method}.wireName`,
		);
		if (
			typeof policy.cancellable !== "boolean" ||
			typeof policy.retryCrashBeforeAccept !== "boolean"
		) {
			throw new Error(
				`catalog.canonicalOperationPolicies.${method} has invalid booleans`,
			);
		}
		return `\t${renderPropertyName(method)}: Object.freeze({\n\t\tidempotencyKey: ${JSON.stringify(idempotencyKey)},\n\t\tretryClass: ${JSON.stringify(retryClass)},\n\t\tcancellable: ${policy.cancellable},\n\t\tretryCrashBeforeAccept: ${policy.retryCrashBeforeAccept},\n\t\twireName: ${JSON.stringify(wireName)},\n\t}),`;
	});
	return `export const canonicalMethods = [\n${methods
		.map((method) => `\t${JSON.stringify(method)},`)
		.join(
			"\n",
		)}\n] as const;\n\nexport type CanonicalMethod = (typeof canonicalMethods)[number];\n\nexport type CanonicalOperationPolicy = {\n\treadonly idempotencyKey: "forbidden" | "optional" | "required";\n\treadonly retryClass: "idempotent" | "non-idempotent";\n\treadonly cancellable: boolean;\n\treadonly retryCrashBeforeAccept: boolean;\n};\n\nexport const canonicalOperationPolicies: Readonly<\n\tRecord<CanonicalMethod, CanonicalOperationPolicy>\n> = Object.freeze({\n${entries.join("\n")}\n});`;
};

export const collectDeclarations = (
	catalog: ProtocolCatalog,
): Declaration[] => {
	const declarations = new Map<string, JsonValue>();
	const register = (
		name: string,
		schema: JsonValue,
		location: string,
	): void => {
		expectIdentifier(name, location);
		const existing = declarations.get(name);
		if (existing !== undefined && !schemasMatch(existing, schema)) {
			throw new Error(
				`${location} conflicts with existing declaration ${name}`,
			);
		}
		declarations.set(name, schema);
	};

	for (const [documentName, documentValue] of Object.entries(
		catalog.documents,
	).sort(([left], [right]) => compareText(left, right))) {
		const document = expectObject(documentValue, `documents.${documentName}`);
		register(
			typeNameForDocument(documentName, document),
			document,
			`documents.${documentName}`,
		);
		if (document.$defs !== undefined) {
			const definitions = expectObject(
				document.$defs,
				`documents.${documentName}.$defs`,
			);
			for (const [definitionName, definition] of Object.entries(
				definitions,
			).sort(([left], [right]) => compareText(left, right))) {
				register(
					definitionName,
					definition,
					`documents.${documentName}.$defs.${definitionName}`,
				);
			}
		}
	}

	return [...declarations.entries()]
		.map(([name, schema]) => ({ name, schema }))
		.sort((left, right) => compareText(left.name, right.name));
};

const generatedHeader = (catalog: ProtocolCatalog): string =>
	[
		"// This file is generated. Do not edit it by hand.",
		`// Generator: ${GENERATOR_NAME}@${GENERATOR_VERSION}`,
		`// Source: rust/crates/protocol/generated/wire.schema.json (${catalog.generator.name}@${catalog.generator.protocolCrateVersion}, catalog format ${catalog.generator.formatVersion})`,
		"",
	].join("\n");

const generateWireValidator = (catalog: ProtocolCatalog): string => {
	const wireMessageSchema = expectObject(
		catalog.documents.wireMessage,
		"documents.wireMessage",
	);
	const renderedSchema = `'${JSON.stringify(canonicalData(wireMessageSchema))
		.replaceAll("\\", "\\\\")
		.replaceAll("'", "\\'")}'`;
	return `type RuntimeSchema = boolean | Readonly<Record<string, unknown>>;

const wireMessageSchema = JSON.parse(
	${renderedSchema},
) as RuntimeSchema;

const isRuntimeRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isRuntimeSchema = (value: unknown): value is RuntimeSchema =>
	typeof value === "boolean" || isRuntimeRecord(value);

const hasOwnRuntimeProperty = (
	value: Readonly<Record<string, unknown>>,
	key: string,
): boolean => Object.getOwnPropertyDescriptor(value, key) !== undefined;

const resolveRuntimeReference = (
	reference: string,
	root: Readonly<Record<string, unknown>>,
): RuntimeSchema | undefined => {
	const prefix = "#/$defs/";
	if (!reference.startsWith(prefix) || !isRuntimeRecord(root.$defs)) {
		return undefined;
	}
	const name = reference.slice(prefix.length);
	if (!hasOwnRuntimeProperty(root.$defs, name)) return undefined;
	const candidate = root.$defs[name];
	return isRuntimeSchema(candidate) ? candidate : undefined;
};

const matchesRuntimeType = (type: string, value: unknown): boolean => {
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
			return isRuntimeRecord(value);
		case "string":
			return typeof value === "string";
		default:
			return false;
	}
};

const validateRuntimeSchema = (
	schema: RuntimeSchema,
	value: unknown,
	root: Readonly<Record<string, unknown>>,
): boolean => {
	if (typeof schema === "boolean") return schema;

	if (typeof schema.$ref === "string") {
		const resolved = resolveRuntimeReference(schema.$ref, root);
		return (
			resolved !== undefined && validateRuntimeSchema(resolved, value, root)
		);
	}
	if (Array.isArray(schema.oneOf)) {
		return (
			schema.oneOf.filter(
				(candidate) =>
					isRuntimeSchema(candidate) &&
					validateRuntimeSchema(candidate, value, root),
			).length === 1
		);
	}
	if (Array.isArray(schema.anyOf)) {
		return schema.anyOf.some(
			(candidate) =>
				isRuntimeSchema(candidate) &&
				validateRuntimeSchema(candidate, value, root),
		);
	}
	if (Array.isArray(schema.allOf)) {
		return schema.allOf.every(
			(candidate) =>
				isRuntimeSchema(candidate) &&
				validateRuntimeSchema(candidate, value, root),
		);
	}

	if (
		"const" in schema &&
		JSON.stringify(schema.const) !== JSON.stringify(value)
	) {
		return false;
	}
	if (
		Array.isArray(schema.enum) &&
		!schema.enum.some(
			(candidate) => JSON.stringify(candidate) === JSON.stringify(value),
		)
	) {
		return false;
	}

	const declaredTypes = Array.isArray(schema.type)
		? schema.type
		: typeof schema.type === "string"
			? [schema.type]
			: [];
	if (
		declaredTypes.length > 0 &&
		!declaredTypes.some(
			(type) => typeof type === "string" && matchesRuntimeType(type, value),
		)
	) {
		return false;
	}

	if (typeof value === "number") {
		if (typeof schema.minimum === "number" && value < schema.minimum) {
			return false;
		}
		if (typeof schema.maximum === "number" && value > schema.maximum) {
			return false;
		}
		if (
			schema.format === "uint64" &&
			(!Number.isSafeInteger(value) || value < 0)
		) {
			return false;
		}
		if (
			schema.format === "uint16" &&
			(!Number.isInteger(value) || value < 0 || value > 65_535)
		) {
			return false;
		}
	}

	if (Array.isArray(value) && isRuntimeSchema(schema.items)) {
		if (
			!value.every((item) =>
				validateRuntimeSchema(schema.items as RuntimeSchema, item, root),
			)
		) {
			return false;
		}
	}

	if (isRuntimeRecord(value)) {
		const properties = isRuntimeRecord(schema.properties)
			? schema.properties
			: {};
		if (
			Array.isArray(schema.required) &&
			schema.required.some(
				(required) =>
					typeof required === "string" &&
					!hasOwnRuntimeProperty(value, required),
			)
		) {
			return false;
		}
		for (const [key, item] of Object.entries(value)) {
			const propertySchema = hasOwnRuntimeProperty(properties, key)
				? properties[key]
				: undefined;
			if (isRuntimeSchema(propertySchema)) {
				if (!validateRuntimeSchema(propertySchema, item, root)) return false;
			} else if (schema.additionalProperties === false) {
				return false;
			}
		}
	}

	return true;
};

export const isWireMessage = (value: unknown): value is WireMessage =>
	isRuntimeRecord(wireMessageSchema) &&
	validateRuntimeSchema(wireMessageSchema, value, wireMessageSchema);
`;
};

const generateWireTypes = (catalog: ProtocolCatalog): string => {
	const declarations = collectDeclarations(catalog);
	const renderedDeclarations = declarations.map(renderDeclaration);
	const protocolVersion = renderConstObject([
		["major", catalog.protocolVersion.major],
		["minor", catalog.protocolVersion.minor],
	]);
	const protocolLimits = renderConstObject(
		Object.entries(catalog.limits).sort(([left], [right]) =>
			compareText(left, right),
		),
	);
	const canonicalPolicies = renderCanonicalPolicies(catalog).replace(
		"\treadonly retryCrashBeforeAccept: boolean;",
		"\treadonly retryCrashBeforeAccept: boolean;\n\treadonly wireName: string;",
	);
	return `${generatedHeader(catalog)}export const protocolVersion = ${protocolVersion} as const;\n\nexport const protocolLimits = ${protocolLimits} as const;\n\n${canonicalPolicies}\n\n${renderedDeclarations.join("\n\n")}\n\n${generateWireValidator(catalog)}`;
};

const generateIndex = (catalog: ProtocolCatalog): string =>
	`${generatedHeader(catalog)}export * from "./wire";\n`;

const outputFiles = (
	catalog: ProtocolCatalog,
): ReadonlyArray<readonly [string, string]> => [
	[wireTypesPath, generateWireTypes(catalog)],
	[indexPath, generateIndex(catalog)],
];

const run = (): number => {
	const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
	if (process.argv.length !== (checkOnly ? 3 : 2)) {
		console.error(
			"Usage: bun scripts/generate/generate-typescript-protocol.ts [--check]",
		);
		return 2;
	}

	const catalog = parseCatalog();
	const outputs = outputFiles(catalog);
	if (checkOnly) {
		let stale = false;
		for (const [path, output] of outputs) {
			if (!existsSync(path) || readFileSync(path, "utf8") !== output) {
				console.error(
					`[typescript-protocol] stale ${path}; run this command without --check`,
				);
				stale = true;
			}
		}
		if (stale) {
			return 1;
		}
		console.log(`[typescript-protocol] current ${generatedDirectory}`);
		return 0;
	}

	mkdirSync(generatedDirectory, { recursive: true });
	for (const [path, output] of outputs) {
		writeFileSync(path, output, "utf8");
		console.log(`[typescript-protocol] wrote ${path}`);
	}
	return 0;
};

if (import.meta.main) {
	try {
		process.exitCode = run();
	} catch (error) {
		console.error("[typescript-protocol] failed:", error);
		process.exitCode = 2;
	}
}
