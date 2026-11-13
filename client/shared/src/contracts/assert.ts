// Type-level equality assertion used by the Zod self-checks here and by the
// Prisma conformance asserts in client/web. `Equal` is the standard
// function-identity trick; `Expect<T extends true>` only compiles when T is
// exactly `true`.

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export type Expect<T extends true> = T;

// Mutual assignability. Robust to representation differences (an `Omit<Raw, K>
// & { ... }` intersection vs a flat interface) that the stricter `Equal` trick
// reports as unequal even when the resolved shapes match. Still fails on real
// drift: an added/removed required column, a changed type, or a changed
// nullability breaks one direction. The `[A] extends [B]` wrappers stop a
// union (e.g. SyncResponse) from distributing.
export type Conforms<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
