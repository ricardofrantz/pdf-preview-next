// Polyfills for runtime methods PDF.js 5.6.x relies on but the V8
// shipped in current VS Code Electron builds does not yet expose.
//
// Map.prototype.getOrInsertComputed and WeakMap.prototype.getOrInsertComputed
// come from the TC39 "Upsert" proposal (Stage 3 at time of writing).
// PDF.js's bundled viewer uses them in download, annotation, and rendering
// paths; without these, opening a PDF throws
// "this[#fr].getOrInsertComputed is not a function".
//
// This file must be imported before any PDF.js module so the prototypes are
// patched before the viewer evaluates.

function getOrInsertComputed(key, callbackFn) {
  if (typeof callbackFn !== 'function') {
    throw new TypeError('callbackFn must be a function');
  }
  if (this.has(key)) {
    return this.get(key);
  }
  const value = callbackFn(key);
  this.set(key, value);
  return value;
}

if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value: getOrInsertComputed,
    configurable: true,
    writable: true,
    enumerable: false,
  });
}

if (typeof WeakMap.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(WeakMap.prototype, 'getOrInsertComputed', {
    value: getOrInsertComputed,
    configurable: true,
    writable: true,
    enumerable: false,
  });
}
