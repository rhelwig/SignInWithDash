export interface PlatformKeySummary {
  id: number | null; purpose: string; securityLevel: string; keyType: string;
  disabled: boolean | null; contractBounds: unknown; publicKeyHex: string | null;
}
export function normalizePlatformKey(key: Record<string, unknown>): PlatformKeySummary;
export function eligiblePlatformKey(key: unknown): key is PlatformKeySummary & {id: number; disabled: false; publicKeyHex: string; contractBounds: null};
