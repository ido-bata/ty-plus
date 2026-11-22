/**
 * Pure mirror of the AE host's loop replication.
 *
 * The ExtendScript implementation lives in
 * `src/management/ae/jsx/host-bundle.ext.ts` (buildLoopReplicatedPoints).
 * This module exists so the host rule can be unit tested and compared with
 * the widget's canonical model (`shared/cyclic-wave.ts`).
 */

export type LoopWaveParams = {
	cycles?: number;
	amplitude?: number;
	damping?: number;
	bias?: number;
	mode?: string;
};
