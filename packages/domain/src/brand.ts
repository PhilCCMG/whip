declare const brand: unique symbol;

/**
 * Nominal ("branded") type: `Brand<string, 'PoliticianId'>` is a string that cannot be confused
 * with any other branded string at compile time. Zero runtime cost.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Cast helper for constructing branded values once they have been validated. */
export function asBrand<T, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}
