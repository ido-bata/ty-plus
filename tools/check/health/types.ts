/**
 * Health checker types — severity-ranked continuous structural pressure.
 * See docs/plans/architecture-recovery/90-checker-redesign.md
 */

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
	sensor: string;
	severity: Severity;
	file: string;
	line?: number;
	message: string;
	weight: number;
	ruleRef: string;
}

export interface SensorStats {
	count: number;
	weight: number;
}

export interface HealthReport {
	score: number;
	bySensor: Record<string, SensorStats>;
	findings: Finding[];
	trendDelta: number;
}

export interface TrendEntry {
	timestamp: string;
	score: number;
	bySensor: Record<string, SensorStats>;
}
