import type { MarkerCatalogEntry } from './dataset';

export const MarkerStateCode = {
  AVAILABLE: 0,
  COLLECTED: 1,
  LOCKED: 2,
  UNKNOWN: 3,
} as const;

export type MarkerStateCode = typeof MarkerStateCode[keyof typeof MarkerStateCode];

export interface MarkerStateCounts {
  available: number;
  collected: number;
  locked: number;
  unknown: number;
  trackable: number;
}

export interface DerivedMarkerStates {
  states: Uint8Array;
  counts: MarkerStateCounts;
}

export function deriveMarkerStates(
  markers: Pick<MarkerCatalogEntry, 'collectionFlags' | 'displayFlag' | 'geomSlot' | 'trackable'>[],
  readFlag: (flagId: number) => boolean | undefined,
): DerivedMarkerStates {
  const states = new Uint8Array(markers.length);
  const counts: MarkerStateCounts = { available: 0, collected: 0, locked: 0, unknown: 0, trackable: 0 };

  markers.forEach((marker, index) => {
    const collectionEvidence = marker.collectionFlags.map(readFlag);
    let state: MarkerStateCode;
    if (collectionEvidence.some((value) => value === true)) {
      state = MarkerStateCode.COLLECTED;
    } else {
      const displayState = marker.displayFlag > 0 ? readFlag(marker.displayFlag) : true;
      if (displayState === false) {
        state = MarkerStateCode.LOCKED;
      } else if (marker.collectionFlags.length > 0 && collectionEvidence.some((value) => value !== undefined)) {
        state = MarkerStateCode.AVAILABLE;
      } else {
        // 只有 GEOF/GEOM 证据或永久世界设施时，当前阶段不能安全猜测为“未收集”。
        state = MarkerStateCode.UNKNOWN;
      }
    }

    states[index] = state;
    if (marker.trackable) counts.trackable += 1;
    if (state === MarkerStateCode.AVAILABLE) counts.available += 1;
    else if (state === MarkerStateCode.COLLECTED) counts.collected += 1;
    else if (state === MarkerStateCode.LOCKED) counts.locked += 1;
    else counts.unknown += 1;
  });

  return { states, counts };
}
