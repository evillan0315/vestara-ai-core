export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Timestamp = string;

export type Version = string;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonRecord = Record<string, JsonValue>;

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type AtLeastOne<T> = [T, ...T[]];

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type Range<Min extends number, Max extends number> = number & {
  readonly __range: `${Min}-${Max}`;
};
