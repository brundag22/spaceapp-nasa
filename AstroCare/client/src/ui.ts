export const MODE_LABELS = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  EVA_STRAIN: 'EVA STRAIN',
} as const;
export const MODE_COPY = {
  NORMAL: 'Baseline stream',
  WARNING: 'Early review indicators',
  CRITICAL: 'Multiple rule flags',
  EVA_STRAIN: 'Suit-pressure event',
} as const;
