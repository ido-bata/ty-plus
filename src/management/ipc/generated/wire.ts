// This file is generated. Do not edit it by hand.
// Generator: ty-plus-typescript-protocol@1.0.0
// Source: rust/crates/protocol/generated/wire.schema.json (ty-plus-protocol-schema@0.1.0, catalog format 1)
export const protocolVersion = {
	major: 1,
	minor: 0,
} as const;

export const protocolLimits = {
	maxCapabilities: 128,
	maxCapabilityNameBytes: 128,
	maxDeadlineHorizonMs: 86400000,
	maxFrameBytes: 1048576,
	maxIdempotencyKeyBytes: 256,
	maxIdentifierBytes: 128,
	maxJsonDepth: 32,
	maxMethodNameBytes: 128,
	maxPendingRequests: 128,
	maxStringBytes: 16384,
	maxUnknownMethodsPerSession: 8,
	maxWarnings: 32,
} as const;

export const canonicalMethods = [
	"online_catalog_search",
	"online_connectivity_check",
	"online_download",
	"online_catalog_cache_read",
	"online_catalog_cache_write",
	"online_catalog_cache_delete",
	"online_catalog_cache_clear",
	"host_plugin_effect_scan",
	"host_thumbnail_lookup",
	"host_thumbnail_generate",
	"host_thumbnail_lookup_or_generate",
	"host_thumbnail_batch",
] as const;

export type CanonicalMethod = (typeof canonicalMethods)[number];

export type CanonicalOperationPolicy = {
	readonly idempotencyKey: "forbidden" | "optional" | "required";
	readonly retryClass: "idempotent" | "non-idempotent";
	readonly cancellable: boolean;
	readonly retryCrashBeforeAccept: boolean;
	readonly wireName: string;
};

export const canonicalOperationPolicies: Readonly<
	Record<CanonicalMethod, CanonicalOperationPolicy>
> = Object.freeze({
	online_catalog_search: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.catalog.search",
	}),
	online_connectivity_check: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.connectivity.check",
	}),
	online_download: Object.freeze({
		idempotencyKey: "forbidden",
		retryClass: "non-idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.download",
	}),
	online_catalog_cache_read: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.catalog.cache.read",
	}),
	online_catalog_cache_write: Object.freeze({
		idempotencyKey: "forbidden",
		retryClass: "non-idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.catalog.cache.write",
	}),
	online_catalog_cache_delete: Object.freeze({
		idempotencyKey: "forbidden",
		retryClass: "non-idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.catalog.cache.delete",
	}),
	online_catalog_cache_clear: Object.freeze({
		idempotencyKey: "forbidden",
		retryClass: "non-idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "online.catalog.cache.clear",
	}),
	host_plugin_effect_scan: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "host.plugin.effect.scan",
	}),
	host_thumbnail_lookup: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "host.thumbnail.lookup",
	}),
	host_thumbnail_generate: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "host.thumbnail.generate",
	}),
	host_thumbnail_lookup_or_generate: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "host.thumbnail.lookup_or_generate",
	}),
	host_thumbnail_batch: Object.freeze({
		idempotencyKey: "optional",
		retryClass: "idempotent",
		cancellable: true,
		retryCrashBeforeAccept: false,
		wireName: "host.thumbnail.batch",
	}),
});

export type AcceptedEvent = {
	request_id: string;
	session_id: string;
};

export type CancelRequest = {
	target_request_id: string;
};

export type CancellationAcknowledgement = {
	decision: CancellationDecision;
	target_request_id: string;
};

export type CancellationDecision =
	| "accepted"
	| "rejected_not_cancellable"
	| "rejected_commit_in_progress"
	| "already_finished";

export type CapabilitySet = ReadonlyArray<string>;

export type ConnectivityStatusDto = {
	checked_at: string;
	error_message?: string | null;
	label: string;
	state: string;
};

export type EventEnvelope = {
	payload: EventPayload;
	protocol_version: ProtocolVersion;
	request_id: string;
	session_id: string;
};

export type EventPayload =
	| {
			data: AcceptedEvent;
			event: "accepted";
	  }
	| {
			data: ProgressEvent;
			event: "progress";
	  }
	| {
			data: CancellationAcknowledgement;
			event: "cancellation_acknowledged";
	  };

export type GenerateThumbnailRequest = {
	file_type: string;
	mtime_ms: number;
	size_bytes: number;
	source_path: string;
};

export type GenerateThumbnailResponse = {
	animated_source_path?: string | null;
	cache_path: string;
};

export type HostContext = {
	app_root: string;
	session_id: string;
	support_root: string;
};

export type InvocationContext = {
	host_context: HostContext;
	managed_root: ManagedRootContext;
};

export type LookupThumbnailRequest = {
	file_type: string;
	mtime_ms: number;
	size_bytes: number;
	source_path: string;
};

export type LookupThumbnailResponse = {
	animated_source_path?: string | null;
	cache_path?: string | null;
};

export type ManagedRootContext =
	| "session_default"
	| {
			explicit_shared: {
				root: string;
			};
	  };

export type PluginEffectScanRequest = {
	roots: ReadonlyArray<string>;
};

export type ProgressEvent = {
	completed_units?: number | null;
	sequence: number;
	stage: ProgressStage;
	total_units?: number | null;
	user_safe_detail?: string | null;
};

export type ProgressStage =
	| "preparing"
	| "discovering"
	| "downloading"
	| "reading"
	| "writing"
	| "verifying"
	| "committing"
	| "finished";

export type ProtocolError = {
	code: StableErrorCode;
	diagnostic_id: string;
	retryable: boolean;
	user_safe_detail: string;
};

export type ProtocolVersion = {
	major: number;
	minor: number;
};

export type RequestEnvelope = {
	context: InvocationContext;
	metadata: RequestMetadata;
	method: string;
	payload: unknown;
	protocol_version: ProtocolVersion;
};

export type RequestMetadata = {
	cancellable: boolean;
	deadline_unix_ms: number;
	idempotency_key?: string | null;
	request_id: string;
	session_id: string;
};

export type ResponseEnvelope = {
	outcome: ResponseOutcome;
	protocol_version: ProtocolVersion;
	request_id: string;
	session_id: string;
};

export type ResponseOutcome =
	| {
			payload: unknown;
			status: "success";
			warnings?: ReadonlyArray<Warning>;
	  }
	| {
			error: ProtocolError;
			status: "failure";
	  };

export type StableErrorCode =
	| "invalid_request"
	| "incompatible_protocol"
	| "protocol_violation"
	| "worker_crashed"
	| "worker_forced_termination"
	| "host_context_missing"
	| "host_context_stale"
	| "not_found"
	| "already_exists"
	| "permission_denied"
	| "elevation_declined"
	| "path_outside_allowed_scope"
	| "network_unavailable"
	| "timeout"
	| "remote_rejected"
	| "integrity_mismatch"
	| "storage_corrupt"
	| "migration_required"
	| "busy"
	| "conflict"
	| "cancelled"
	| "internal_error";

export type Warning = {
	code: string;
	user_safe_detail: string;
};

export type WireMessage =
	| {
			kind: "request";
			message: RequestEnvelope;
	  }
	| {
			kind: "cancel";
			message: CancelRequest;
	  }
	| {
			kind: "response";
			message: ResponseEnvelope;
	  }
	| {
			kind: "event";
			message: EventEnvelope;
	  };

type RuntimeSchema = boolean | Readonly<Record<string, unknown>>;

const wireMessageSchema = JSON.parse(
	'{"$defs":{"AcceptedEvent":{"additionalProperties":false,"properties":{"request_id":{"type":"string"},"session_id":{"type":"string"}},"required":["request_id","session_id"],"type":"object"},"CancelRequest":{"additionalProperties":false,"properties":{"target_request_id":{"type":"string"}},"required":["target_request_id"],"type":"object"},"CancellationAcknowledgement":{"additionalProperties":false,"properties":{"decision":{"$ref":"#/$defs/CancellationDecision"},"target_request_id":{"type":"string"}},"required":["target_request_id","decision"],"type":"object"},"CancellationDecision":{"enum":["accepted","rejected_not_cancellable","rejected_commit_in_progress","already_finished"],"type":"string"},"EventEnvelope":{"additionalProperties":false,"properties":{"payload":{"$ref":"#/$defs/EventPayload"},"protocol_version":{"$ref":"#/$defs/ProtocolVersion"},"request_id":{"type":"string"},"session_id":{"type":"string"}},"required":["protocol_version","session_id","request_id","payload"],"type":"object"},"EventPayload":{"oneOf":[{"additionalProperties":false,"properties":{"data":{"$ref":"#/$defs/AcceptedEvent"},"event":{"const":"accepted","type":"string"}},"required":["event","data"],"type":"object"},{"additionalProperties":false,"properties":{"data":{"$ref":"#/$defs/ProgressEvent"},"event":{"const":"progress","type":"string"}},"required":["event","data"],"type":"object"},{"additionalProperties":false,"properties":{"data":{"$ref":"#/$defs/CancellationAcknowledgement"},"event":{"const":"cancellation_acknowledged","type":"string"}},"required":["event","data"],"type":"object"}]},"HostContext":{"additionalProperties":false,"description":"Host context payload from After Effects ExtendScript.\\n\\nThis payload is sent from the host to the runtime during session registration.\\nIt contains the application root and support root paths derived from\\nExtendScript\'s `app.path`.","properties":{"app_root":{"description":"Application root path from ExtendScript\'s `app.path`.","type":"string"},"session_id":{"description":"Session identifier for this AE instance.","type":"string"},"support_root":{"description":"Application support root path.","type":"string"}},"required":["app_root","support_root","session_id"],"type":"object"},"InvocationContext":{"additionalProperties":false,"properties":{"host_context":{"$ref":"#/$defs/HostContext"},"managed_root":{"$ref":"#/$defs/ManagedRootContext"}},"required":["host_context","managed_root"],"type":"object"},"ManagedRootContext":{"oneOf":[{"enum":["session_default"],"type":"string"},{"additionalProperties":false,"properties":{"explicit_shared":{"additionalProperties":false,"properties":{"root":{"type":"string"}},"required":["root"],"type":"object"}},"required":["explicit_shared"],"type":"object"}]},"ProgressEvent":{"additionalProperties":false,"properties":{"completed_units":{"format":"uint64","minimum":0,"type":["integer","null"]},"sequence":{"format":"uint64","minimum":0,"type":"integer"},"stage":{"$ref":"#/$defs/ProgressStage"},"total_units":{"format":"uint64","minimum":0,"type":["integer","null"]},"user_safe_detail":{"type":["string","null"]}},"required":["sequence","stage"],"type":"object"},"ProgressStage":{"enum":["preparing","discovering","downloading","reading","writing","verifying","committing","finished"],"type":"string"},"ProtocolError":{"additionalProperties":false,"properties":{"code":{"$ref":"#/$defs/StableErrorCode"},"diagnostic_id":{"type":"string"},"retryable":{"type":"boolean"},"user_safe_detail":{"type":"string"}},"required":["code","retryable","user_safe_detail","diagnostic_id"],"type":"object"},"ProtocolVersion":{"additionalProperties":false,"properties":{"major":{"format":"uint16","maximum":65535,"minimum":0,"type":"integer"},"minor":{"format":"uint16","maximum":65535,"minimum":0,"type":"integer"}},"required":["major","minor"],"type":"object"},"RequestEnvelope":{"additionalProperties":false,"properties":{"context":{"$ref":"#/$defs/InvocationContext"},"metadata":{"$ref":"#/$defs/RequestMetadata"},"method":{"type":"string"},"payload":true,"protocol_version":{"$ref":"#/$defs/ProtocolVersion"}},"required":["protocol_version","metadata","context","method","payload"],"type":"object"},"RequestMetadata":{"additionalProperties":false,"properties":{"cancellable":{"type":"boolean"},"deadline_unix_ms":{"format":"uint64","minimum":0,"type":"integer"},"idempotency_key":{"type":["string","null"]},"request_id":{"type":"string"},"session_id":{"type":"string"}},"required":["request_id","session_id","deadline_unix_ms","cancellable"],"type":"object"},"ResponseEnvelope":{"additionalProperties":false,"properties":{"outcome":{"$ref":"#/$defs/ResponseOutcome"},"protocol_version":{"$ref":"#/$defs/ProtocolVersion"},"request_id":{"type":"string"},"session_id":{"type":"string"}},"required":["protocol_version","request_id","session_id","outcome"],"type":"object"},"ResponseOutcome":{"oneOf":[{"additionalProperties":false,"properties":{"payload":true,"status":{"const":"success","type":"string"},"warnings":{"items":{"$ref":"#/$defs/Warning"},"type":"array"}},"required":["status","payload"],"type":"object"},{"additionalProperties":false,"properties":{"error":{"$ref":"#/$defs/ProtocolError"},"status":{"const":"failure","type":"string"}},"required":["status","error"],"type":"object"}]},"StableErrorCode":{"enum":["invalid_request","incompatible_protocol","protocol_violation","worker_crashed","worker_forced_termination","host_context_missing","host_context_stale","not_found","already_exists","permission_denied","elevation_declined","path_outside_allowed_scope","network_unavailable","timeout","remote_rejected","integrity_mismatch","storage_corrupt","migration_required","busy","conflict","cancelled","internal_error"],"type":"string"},"Warning":{"additionalProperties":false,"properties":{"code":{"type":"string"},"user_safe_detail":{"type":"string"}},"required":["code","user_safe_detail"],"type":"object"}},"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"request","type":"string"},"message":{"$ref":"#/$defs/RequestEnvelope"}},"required":["kind","message"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"cancel","type":"string"},"message":{"$ref":"#/$defs/CancelRequest"}},"required":["kind","message"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"response","type":"string"},"message":{"$ref":"#/$defs/ResponseEnvelope"}},"required":["kind","message"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"event","type":"string"},"message":{"$ref":"#/$defs/EventEnvelope"}},"required":["kind","message"],"type":"object"}],"title":"WireMessage"}',
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
