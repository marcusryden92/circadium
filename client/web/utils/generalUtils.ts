// Type-safe deep equality comparison
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(
  obj1: unknown,
  obj2: unknown,
  ignoreProps: string[] = []
): boolean {
  // Handle primitive types and null/undefined
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;

  // Handle arrays
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) =>
      deepEqual(item, obj2[index], ignoreProps)
    );
  }

  // Handle objects
  if (isObject(obj1) && isObject(obj2)) {
    const keys1 = Object.keys(obj1).filter((key) => !ignoreProps.includes(key));
    const keys2 = Object.keys(obj2).filter((key) => !ignoreProps.includes(key));

    if (keys1.length !== keys2.length) return false;

    return keys1.every((key) => {
      if (!keys2.includes(key)) return false;
      return deepEqual(obj1[key], obj2[key], ignoreProps);
    });
  }

  // For primitives
  return obj1 === obj2;
}

// Your improved objectsAreEqual function - type safe version
export function objectsAreEqual<T extends Record<string, unknown>>(
  obj1: T,
  obj2: T,
  ignoreProps: (keyof T)[] = []
): boolean {
  const keys1 = (Object.keys(obj1) as (keyof T)[]).filter(
    (key) => !ignoreProps.includes(key)
  );
  const keys2 = (Object.keys(obj2) as (keyof T)[]).filter(
    (key) => !ignoreProps.includes(key)
  );

  if (keys1.length !== keys2.length) return false;

  return keys1.every((key) => {
    const val1 = obj1[key];
    const val2 = obj2[key];

    // Handle nested objects/arrays with proper typing
    if (isObject(val1) && isObject(val2)) {
      return objectsAreEqual(val1, val2, ignoreProps as string[]);
    }

    if (Array.isArray(val1) && Array.isArray(val2)) {
      if (val1.length !== val2.length) return false;
      return val1.every((item, i) => {
        if (isObject(item) && isObject(val2[i])) {
          return objectsAreEqual(item, val2[i], ignoreProps as string[]);
        }
        return deepEqual(item, val2[i], ignoreProps as string[]);
      });
    }

    return val1 === val2;
  });
}
