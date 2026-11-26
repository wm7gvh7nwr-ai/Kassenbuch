/**
 * Eigene Zifferntastatur: hält die Eingabe immer in einem gültigen Zustand.
 * Höchstens 5 Stellen vor und 2 nach dem Punkt, ein einziger Punkt.
 */
export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

export function pressKey(current: string, key: Key): string {
  if (key === 'back') return current.slice(0, -1);
  const [int = '', dec] = current.split('.');
  if (key === '.') {
    if (dec !== undefined) return current;
    return (int === '' ? '0' : int) + '.';
  }
  if (dec !== undefined) {
    if (dec.length >= 2) return current;
    return current + key;
  }
  if (int === '0') return key; // keine führenden Nullen
  if (int.length >= 5) return current;
  return int + key;
}

/** Anzeige im Blatt: «12.5» → «12.5», leer → «0» */
export function keypadDisplay(current: string): string {
  return current === '' ? '0' : current;
}
