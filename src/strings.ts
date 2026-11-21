/** The six open strings in standard tuning, thickest (lowest) first. */
export interface OpenString {
  /** 0 = low E2 ... 5 = high E4 */
  index: number;
  /** Scientific pitch notation, shown in tune mode. */
  name: string;
  frequency: number;
  color: string;
  /** Original emoji figurine shown to the child. */
  figurine: string;
}

export const OPEN_STRINGS: OpenString[] = [
  { index: 0, name: 'E2', frequency: 82.41, color: '#e5484d', figurine: '🦀' },
  { index: 1, name: 'A2', frequency: 110.0, color: '#f76b15', figurine: '🦊' },
  { index: 2, name: 'D3', frequency: 146.83, color: '#ffc53d', figurine: '🐝' },
  { index: 3, name: 'G3', frequency: 196.0, color: '#46a758', figurine: '🐸' },
  { index: 4, name: 'B3', frequency: 246.94, color: '#3e63dd', figurine: '🐳' },
  { index: 5, name: 'E4', frequency: 329.63, color: '#8e4ec6', figurine: '🦄' },
];
