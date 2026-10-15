// @bun
// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Pipeable.js
var pipeArguments = (self, args) => {
  switch (args.length) {
    case 0:
      return self;
    case 1:
      return args[0](self);
    case 2:
      return args[1](args[0](self));
    case 3:
      return args[2](args[1](args[0](self)));
    case 4:
      return args[3](args[2](args[1](args[0](self))));
    case 5:
      return args[4](args[3](args[2](args[1](args[0](self)))));
    case 6:
      return args[5](args[4](args[3](args[2](args[1](args[0](self))))));
    case 7:
      return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))));
    case 8:
      return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))));
    case 9:
      return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))));
    default: {
      let ret = self;
      for (let i = 0, len = args.length;i < len; i++) {
        ret = args[i](ret);
      }
      return ret;
    }
  }
};
var Prototype = {
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Class = /* @__PURE__ */ function() {
  function PipeableBase() {}
  PipeableBase.prototype = Prototype;
  return PipeableBase;
}();

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Function.js
var dual = function(arity, body) {
  if (typeof arity === "function") {
    return function() {
      return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
    };
  }
  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`);
    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function(self) {
          return body(self, a);
        };
      };
    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function(self) {
          return body(self, a, b);
        };
      };
    default:
      return function() {
        if (arguments.length >= arity) {
          return body.apply(this, arguments);
        }
        const args = arguments;
        return function(self) {
          return body(self, ...args);
        };
      };
  }
};
var identity = (a) => a;
var constant = (value) => () => value;
var constTrue = /* @__PURE__ */ constant(true);
var constFalse = /* @__PURE__ */ constant(false);
var constUndefined = /* @__PURE__ */ constant(undefined);
var constVoid = constUndefined;
function memoize(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    return result;
  };
}
function memoizeIdempotent(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    if (result !== a) {
      cache.set(result, result);
    }
    return result;
  };
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/equal.js
var getAllObjectKeys = (obj) => {
  const keys = new Set(Reflect.ownKeys(obj));
  if (obj.constructor === Object)
    return keys;
  if (obj instanceof Error) {
    keys.delete("stack");
  }
  const proto = Object.getPrototypeOf(obj);
  let current = proto;
  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current);
    for (let i = 0;i < ownKeys.length; i++) {
      keys.add(ownKeys[i]);
    }
    current = Object.getPrototypeOf(current);
  }
  if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys.delete("constructor");
  }
  return keys;
};
var byReferenceInstances = /* @__PURE__ */ new WeakSet;
var viewBytes = (view) => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/hash.js
var backEdges = 0;
var addBackEdge = () => {
  backEdges++;
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Predicate.js
function isString(input) {
  return typeof input === "string";
}
function isNumber(input) {
  return typeof input === "number";
}
function isBoolean(input) {
  return typeof input === "boolean";
}
function isSymbol(input) {
  return typeof input === "symbol";
}
function isPropertyKey(u) {
  return isString(u) || isNumber(u) || isSymbol(u);
}
function isFunction(input) {
  return typeof input === "function";
}
function isNotUndefined(input) {
  return input !== undefined;
}
function isNotNullish(input) {
  return input != null;
}
function isUnknown(_) {
  return true;
}
function isObjectKeyword(input) {
  return typeof input === "object" && input !== null || isFunction(input);
}
var hasProperty = /* @__PURE__ */ dual(2, (self, property) => isObjectKeyword(self) && (property in self));
var isTagged = /* @__PURE__ */ dual(2, (self, tag) => hasProperty(self, "_tag") && self["_tag"] === tag);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Hash.js
var symbol = "~effect/Hash";
var hash = (self) => {
  switch (typeof self) {
    case "number":
      return number(self);
    case "bigint":
      return string(self.toString(10));
    case "string":
      return string(self);
    case "function":
    case "object": {
      if (self === null) {
        break;
      } else if (self instanceof Date) {
        if (Number.isNaN(self.getTime())) {
          return string("Invalid Date");
        }
        return string(self.toISOString());
      } else if (self instanceof RegExp) {
        return string(self.toString());
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self);
        }
        const cached = hashCache.get(self);
        if (cached !== undefined) {
          return cached;
        }
        if (visitedObjects.has(self)) {
          addBackEdge();
          return string("[Circular]");
        }
        visitedObjects.add(self);
        const seen = backEdges;
        let h;
        try {
          if (symbol in self) {
            h = self[symbol]();
          } else if (typeof self === "function") {
            h = random(self);
          } else if (self instanceof DataView) {
            h = array(viewBytes(self));
          } else if (Array.isArray(self) || ArrayBuffer.isView(self)) {
            h = array(self);
          } else if (self instanceof Map) {
            h = hashMap(self);
          } else if (self instanceof Set) {
            h = hashSet(self);
          } else {
            h = structure(self);
          }
        } finally {
          visitedObjects.delete(self);
        }
        if (seen === backEdges) {
          hashCache.set(self, h);
        }
        return h;
      }
    }
  }
  return optimize(mix(string(String(self))));
};
var random = (self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, optimize(Math.random() * 4294967296 | 0));
  }
  return randomHashCache.get(self);
};
var mix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return h ^ h >>> 16;
};
var combine = /* @__PURE__ */ dual(2, (self, b) => mix(Math.imul(self, 2654435761) + Math.imul(b, 2246822507)));
var optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
var float64 = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
var number = (n) => {
  const h = n | 0;
  if (h === n) {
    return optimize(h);
  }
  float64.setFloat64(0, n !== n ? NaN : n);
  return optimize(combine(float64.getInt32(0), float64.getInt32(4)));
};
var string = (str) => {
  let h = 5381, i = str.length;
  while (i) {
    h = h * 33 ^ str.charCodeAt(--i);
  }
  return optimize(h);
};
var structureKeys = (o, keys) => {
  let h = 12289;
  for (const key of keys) {
    h ^= combine(hash(key), hash(o[key]));
  }
  return optimize(h);
};
var structure = (o) => structureKeys(o, getAllObjectKeys(o));
var unordered = (seed, f) => (iter) => {
  let h = seed;
  for (const element of iter) {
    h ^= f(element);
  }
  return optimize(h);
};
var array = (arr) => {
  let h = 6151;
  for (const element of arr) {
    h = combine(h, hash(element));
  }
  return optimize(h);
};
var hashMap = /* @__PURE__ */ unordered(/* @__PURE__ */ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
var setSeed = /* @__PURE__ */ string("Set");
var hashSet = /* @__PURE__ */ unordered(setSeed, (element) => combine(setSeed, hash(element)));
var randomHashCache = /* @__PURE__ */ new WeakMap;
var hashCache = /* @__PURE__ */ new WeakMap;
var visitedObjects = /* @__PURE__ */ new WeakSet;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Equal.js
var symbol2 = "~effect/Equal";
function equals() {
  if (arguments.length === 1) {
    return (self) => compareBoth(self, arguments[0]);
  }
  return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
  if (self === that)
    return true;
  if (self == null || that == null)
    return false;
  const selfType = typeof self;
  if (selfType !== typeof that) {
    return false;
  }
  if (selfType === "number" && self !== self && that !== that) {
    return true;
  }
  if (selfType !== "object" && selfType !== "function") {
    return false;
  }
  if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) {
    return false;
  }
  return compareObjects(self, that);
}
function compareObjects(self, that) {
  const depth = pathLeft.length;
  for (let i = depth;i-- > 0; ) {
    if (pathLeft[i] === self && pathRight[i] === that)
      return true;
  }
  if (depth)
    return compareOnPath(self, that);
  let known = results.get(self);
  if (!known)
    results.set(self, known = new WeakMap);
  let result = known.get(that);
  if (result === undefined)
    known.set(that, result = compareOnPath(self, that));
  return result;
}
function compareOnPath(self, that) {
  pathLeft.push(self);
  pathRight.push(that);
  try {
    return compareStructure(self, that);
  } finally {
    pathLeft.pop();
    pathRight.pop();
  }
}
var pathLeft = [];
var pathRight = [];
var results = /* @__PURE__ */ new WeakMap;
function compareStructure(self, that) {
  if (hash(self) !== hash(that)) {
    return false;
  } else if (self instanceof Date) {
    if (!(that instanceof Date))
      return false;
    const selfTime = self.getTime();
    const thatTime = that.getTime();
    return selfTime === thatTime || Number.isNaN(selfTime) && Number.isNaN(thatTime);
  } else if (self instanceof RegExp) {
    return that instanceof RegExp && self.toString() === that.toString();
  }
  const bothEquals = isEqual(self);
  if (bothEquals !== isEqual(that) || typeof self === "function" && !bothEquals) {
    return false;
  } else if (bothEquals) {
    return self[symbol2](that);
  } else if (Array.isArray(self)) {
    if (!Array.isArray(that) || self.length !== that.length) {
      return false;
    }
    return compareArrays(self, that);
  } else if (ArrayBuffer.isView(self)) {
    const selfIsDataView = self instanceof DataView;
    if (!ArrayBuffer.isView(that) || self.byteLength !== that.byteLength || selfIsDataView !== that instanceof DataView) {
      return false;
    }
    if (selfIsDataView) {
      return compareTypedArrays(viewBytes(self), viewBytes(that));
    }
    return compareTypedArrays(self, that);
  } else if (self instanceof Map) {
    if (!(that instanceof Map) || self.size !== that.size) {
      return false;
    }
    return compareHashed(self, that, entryHash, equalEntries);
  } else if (self instanceof Set) {
    if (!(that instanceof Set) || self.size !== that.size) {
      return false;
    }
    return compareHashed(self, that, hash, compareBoth);
  }
  return compareRecords(self, that);
}
function compareArrays(self, that) {
  for (let i = 0;i < self.length; i++) {
    if (!compareBoth(self[i], that[i])) {
      return false;
    }
  }
  return true;
}
function compareTypedArrays(self, that) {
  if (self.length !== that.length) {
    return false;
  }
  for (let i = 0;i < self.length; i++) {
    if (self[i] !== that[i]) {
      return false;
    }
  }
  return true;
}
function compareRecords(self, that) {
  const selfKeys = getAllObjectKeys(self);
  const thatKeys = getAllObjectKeys(that);
  if (selfKeys.size !== thatKeys.size) {
    return false;
  }
  for (const key of selfKeys) {
    if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) {
      return false;
    }
  }
  return true;
}
function compareHashed(self, that, hashOf, equivalent) {
  const groups = new Map;
  let remaining = 0;
  for (const item of that) {
    const h = hashOf(item);
    const group = groups.get(h);
    if (group)
      group.push(item);
    else
      groups.set(h, [item]);
    remaining++;
  }
  outer:
    for (const item of self) {
      const group = groups.get(hashOf(item));
      if (group) {
        for (let i = 0;i < group.length; i++) {
          if (equivalent(item, group[i])) {
            group[i] = group[group.length - 1];
            group.pop();
            remaining--;
            continue outer;
          }
        }
      }
      return false;
    }
  return remaining === 0;
}
var entryHash = (entry) => hash(entry[0]);
var equalEntries = (self, that) => compareBoth(self[0], that[0]) && compareBoth(self[1], that[1]);
var isEqual = (u) => hasProperty(u, symbol2);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Redactable.js
var symbolRedactable = /* @__PURE__ */ Symbol.for("~effect/Redactable");
var isRedactable = (u) => hasProperty(u, symbolRedactable);
function redact(u) {
  if (isRedactable(u))
    return getRedacted(u);
  return u;
}
function getRedacted(redactable) {
  return redactable[symbolRedactable](globalThis[currentFiberTypeId]?.context ?? emptyContext);
}
var currentFiberTypeId = "~effect/Fiber/currentFiber";
var emptyMap = /* @__PURE__ */ new Map;
var emptyContext = {
  "~effect/Context": {},
  base: emptyMap,
  depth: 0,
  mapUnsafe: emptyMap,
  pipe() {
    return pipeArguments(this, arguments);
  }
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Formatter.js
function format(input, options) {
  const space = options?.space ?? 0;
  const ancestors = new WeakSet;
  const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
  const ind = (d) => gap.repeat(d);
  const wrap = (v, body) => {
    const ctor = v?.constructor;
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
  };
  const ownKeys = (o) => {
    try {
      return Reflect.ownKeys(o);
    } catch {
      return ["[ownKeys threw]"];
    }
  };
  function recur(v, d = 0) {
    try {
      return recurUnsafe(v, d);
    } catch {
      if (typeof v === "object" && v !== null || typeof v === "function")
        ancestors.delete(v);
      return "[inspection threw]";
    }
  }
  function recurUnsafe(v, d = 0) {
    if (typeof v === "string")
      return JSON.stringify(v);
    if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol")
      return String(v);
    if (typeof v === "bigint")
      return String(v) + "n";
    if (typeof v === "object" || typeof v === "function") {
      if (ancestors.has(v))
        return CIRCULAR;
      ancestors.add(v);
      let output;
      if (symbolRedactable in v) {
        output = recur(getRedacted(v), d);
      } else if (Array.isArray(v)) {
        output = !gap || v.length <= 1 ? `[${v.map((x) => recur(x, d)).join(",")}]` : `[
${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(`,
` + ind(d + 1))}
${ind(d)}]`;
      } else if (v instanceof Date) {
        output = formatDate(v);
      } else if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
        const s = safeToString(v);
        output = v instanceof Error && v.cause !== undefined ? `${s} (cause: ${recur(v.cause, d)})` : s;
      } else if (Symbol.iterator in v) {
        output = `${v.constructor.name}(${recur(Array.from(v), d)})`;
      } else {
        const keys = ownKeys(v);
        if (!gap || keys.length <= 1) {
          const body = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(safeGet(v, k), d)}`).join(",")}}`;
          output = wrap(v, body);
        } else {
          const body = `{
${keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(safeGet(v, k), d + 1)}`).join(`,
`)}
${ind(d)}}`;
          output = wrap(v, body);
        }
      }
      ancestors.delete(v);
      return output;
    }
    return String(v);
  }
  return recur(input, 0);
}
var CIRCULAR = "[Circular]";
function formatPropertyKey(name) {
  return typeof name === "string" ? JSON.stringify(name) : String(name);
}
function formatPath(path) {
  return path.map((key) => `[${formatPropertyKey(key)}]`).join("");
}
function formatDate(date) {
  try {
    return date.toISOString();
  } catch {
    return "Invalid Date";
  }
}
function safeToString(input) {
  try {
    const s = input.toString();
    return typeof s === "string" ? s : String(s);
  } catch {
    return "[toString threw]";
  }
}
function safeGet(input, key) {
  try {
    return input[key];
  } catch {
    return "[property access threw]";
  }
}
function formatJson(input, options) {
  const ancestors = [];
  return JSON.stringify(input, function(key, value) {
    const original = Object.getOwnPropertyDescriptor(this, key)?.value;
    const redacted = hasProperty(original, symbolRedactable) ? redact(original) : redact(value);
    if (typeof redacted === "bigint") {
      return format(redacted);
    }
    if (typeof redacted !== "object" || redacted === null) {
      return redacted;
    }
    const current = redacted instanceof Error && !hasProperty(redacted, "toJSON") ? {
      ...redacted,
      name: redacted.name,
      message: redacted.message
    } : redacted;
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(redacted)) {
      return;
    }
    ancestors.push(redacted);
    if (current !== redacted) {
      ancestors.push(current);
    }
    if (!hasGetter(current) || isJsonPrimitiveWrapper(current)) {
      return current;
    }
    const serialized = new Proxy(current, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        return Object.getOwnPropertyDescriptor(target, key)?.get !== undefined ? redact(value) : value;
      }
    });
    ancestors.push(serialized);
    return serialized;
  }, options?.space) ?? "null";
}
function hasGetter(object) {
  for (const key of Object.getOwnPropertyNames(object)) {
    if (Object.getOwnPropertyDescriptor(object, key)?.get !== undefined) {
      return true;
    }
  }
  return false;
}
function isJsonPrimitiveWrapper(object) {
  for (const valueOf of [Number.prototype.valueOf, Boolean.prototype.valueOf, String.prototype.valueOf]) {
    try {
      Reflect.apply(valueOf, object, []);
      return true;
    } catch {}
  }
  return false;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Inspectable.js
var NodeInspectSymbol = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var toJson = (input) => {
  try {
    input = redact(input);
    if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) {
      return input.toJSON();
    } else if (Array.isArray(input)) {
      return input.map(toJson);
    }
    return input;
  } catch {
    return "[toJSON threw]";
  }
};
var toStringUnknown = (u, whitespace = 2) => {
  if (typeof u === "string") {
    return u;
  }
  try {
    return typeof u === "object" ? formatJson(u, {
      space: whitespace
    }) : format(u, {
      space: whitespace
    });
  } catch {
    return String(u);
  }
};
var BaseProto = {
  toJSON() {
    return toJson(this);
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  toString() {
    return format(this.toJSON());
  }
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/stackTraceLimit.js
var isStackTraceLimitWritable = () => {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === undefined) {
    return Object.isExtensible(Error);
  }
  return Object.hasOwn(desc, "writable") ? desc.writable === true : desc.set !== undefined;
};
var canWriteStackTraceLimit = /* @__PURE__ */ isStackTraceLimitWritable();
var getStackTraceLimit = () => Error.stackTraceLimit;
var setStackTraceLimit = (value) => {
  if (canWriteStackTraceLimit) {
    Error.stackTraceLimit = value;
  }
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Utils.js
class SingleShotGen {
  constructor(self) {
    this.value = self;
    this.done = false;
  }
  next(a) {
    if (this.done) {
      this.value = a;
      return this;
    }
    this.done = true;
    return {
      value: this.value,
      done: false
    };
  }
}
var pickInternalCall = () => {
  const InternalTypeId = "~effect/Utils/internal";
  const standard = {
    [InternalTypeId]: (body) => {
      return body();
    }
  };
  const forced = {
    [InternalTypeId]: (body) => {
      try {
        return body();
      } finally {}
    }
  };
  const limit = getStackTraceLimit();
  if (limit === 0)
    return forced[InternalTypeId];
  setStackTraceLimit(2);
  const error = standard[InternalTypeId](() => new Error);
  setStackTraceLimit(limit);
  return error.stack?.includes(InternalTypeId) === true ? standard[InternalTypeId] : forced[InternalTypeId];
};
var internalCall = /* @__PURE__ */ pickInternalCall();

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/record.js
function assignProperty(self, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(self, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    self[key] = value;
  }
}
function assignProperties(self, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) {
      assignProperty(self, key, source[key]);
    }
  }
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/core.js
var EffectTypeId = `~effect/Effect`;
var ExitTypeId = `~effect/Exit`;
var effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
};
var identifier = `${EffectTypeId}/identifier`;
var args = `${EffectTypeId}/args`;
var evaluate = `${EffectTypeId}/evaluate`;
var contA = `${EffectTypeId}/successCont`;
var contE = `${EffectTypeId}/failureCont`;
var contAll = `${EffectTypeId}/ensureCont`;
var Yield = /* @__PURE__ */ Symbol.for("effect/Effect/Yield");
var PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments);
  },
  toJSON() {
    return {
      ...this
    };
  },
  toString() {
    return format(this.toJSON(), {
      ignoreToString: true,
      space: 2
    });
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var StructuralProto = {
  [symbol]() {
    return structureKeys(this, Object.keys(this));
  },
  [symbol2](that) {
    const selfKeys = Object.keys(this);
    const thatKeys = Object.keys(that);
    if (selfKeys.length !== thatKeys.length)
      return false;
    for (let i = 0;i < selfKeys.length; i++) {
      if (selfKeys[i] !== thatKeys[i] || !equals(this[selfKeys[i]], that[selfKeys[i]])) {
        return false;
      }
    }
    return true;
  }
};
var EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  },
  toJSON() {
    return {
      _id: "Effect",
      op: this[identifier],
      ...args in this ? {
        args: this[args]
      } : undefined
    };
  }
};
var isEffect = (u) => hasProperty(u, EffectTypeId);
var isExit = (u) => hasProperty(u, ExitTypeId);
var CauseTypeId = "~effect/Cause";
var CauseReasonTypeId = "~effect/Cause/Reason";
var isCause = (self) => hasProperty(self, CauseTypeId);
class CauseImpl {
  constructor(failures) {
    this[CauseTypeId] = CauseTypeId;
    this.reasons = failures;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toJSON() {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    };
  }
  toString() {
    return `Cause(${format(this.reasons)})`;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  [symbol2](that) {
    return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals(e, that.reasons[i]));
  }
  [symbol]() {
    return array(this.reasons);
  }
}
var annotationsMap = /* @__PURE__ */ new WeakMap;

class ReasonBase {
  [CauseReasonTypeId];
  annotations;
  _tag;
  constructor(_tag, annotations, originalError) {
    this[CauseReasonTypeId] = CauseReasonTypeId;
    this._tag = _tag;
    if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
      const prevAnnotations = annotationsMap.get(originalError);
      if (prevAnnotations) {
        annotations = new Map([...prevAnnotations, ...annotations]);
      }
      annotationsMap.set(originalError, annotations);
    }
    this.annotations = annotations;
  }
  annotate(annotations, options) {
    if (annotations.mapUnsafe.size === 0)
      return this;
    const newAnnotations = new Map(this.annotations);
    annotations.mapUnsafe.forEach((value, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key))
        return;
      newAnnotations.set(key, value);
    });
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    self.annotations = newAnnotations;
    return self;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toString() {
    return format(this);
  }
  [NodeInspectSymbol]() {
    return this.toString();
  }
}
var constEmptyAnnotations = /* @__PURE__ */ new Map;

class Fail extends ReasonBase {
  constructor(error, annotations = constEmptyAnnotations) {
    super("Fail", annotations, error);
    this.error = error;
  }
  toString() {
    return `Fail(${format(this.error)})`;
  }
  toJSON() {
    return {
      _tag: "Fail",
      error: this.error
    };
  }
  [symbol2](that) {
    return isFailReason(that) && equals(this.error, that.error) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
  }
}
var causeFromReasons = (reasons) => new CauseImpl(reasons);
var dedupeReasons = (self, that) => {
  const buckets = new Map;
  const out = [];
  for (const reason of self.concat(that)) {
    const hash2 = hash(reason);
    const bucket = buckets.get(hash2);
    if (bucket === undefined) {
      buckets.set(hash2, [reason]);
    } else if (bucket.some((previous) => equals(previous, reason))) {
      continue;
    } else {
      bucket.push(reason);
    }
    out.push(reason);
  }
  return out;
};
var causeCombine = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.reasons.length === 0) {
    return that;
  } else if (that.reasons.length === 0) {
    return self;
  }
  const newCause = new CauseImpl(dedupeReasons(self.reasons, that.reasons));
  return equals(self, newCause) ? self : newCause;
});
var causeEmpty = /* @__PURE__ */ new CauseImpl([]);
var causeFail = (error) => new CauseImpl([new Fail(error)]);

class Die extends ReasonBase {
  constructor(defect, annotations = constEmptyAnnotations) {
    super("Die", annotations, defect);
    this.defect = defect;
  }
  toString() {
    return `Die(${format(this.defect)})`;
  }
  toJSON() {
    return {
      _tag: "Die",
      defect: this.defect
    };
  }
  [symbol2](that) {
    return isDieReason(that) && equals(this.defect, that.defect) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
  }
}
var causeDie = (defect) => new CauseImpl([new Die(defect)]);
var causeAnnotate = /* @__PURE__ */ dual((args) => isCause(args[0]), (self, annotations, options) => {
  if (annotations.mapUnsafe.size === 0)
    return self;
  return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
var isFailReason = (self) => self._tag === "Fail";
var isDieReason = (self) => self._tag === "Die";
var isInterruptReason = (self) => self._tag === "Interrupt";
function defaultEvaluate(_fiber) {
  return exitDie(`Effect.evaluate: Not implemented`);
}
var makePrimitiveProto = (options) => ({
  ...EffectProto,
  [identifier]: options.op,
  [evaluate]: options[evaluate] ?? defaultEvaluate,
  [contA]: options[contA],
  [contE]: options[contE],
  [contAll]: options[contAll]
});
var makePrimitive = (options) => {
  const Proto = makePrimitiveProto(options);
  const PrimitiveImpl = function(value) {
    this[args] = value;
  };
  PrimitiveImpl.prototype = Proto;
  return function(value) {
    return new PrimitiveImpl(value);
  };
};
var makeExit = (options) => {
  const Proto = {
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop]() {
      return this[args];
    },
    ...makePrimitiveProto(options),
    toString() {
      return `${options.op}(${format(this[args])})`;
    },
    toJSON() {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      };
    },
    [symbol2](that) {
      return isExit(that) && that._tag === this._tag && equals(this[args], that[args]);
    },
    [symbol]() {
      return combine(string(options.op), hash(this[args]));
    }
  };
  const ExitPrimitive = function(value) {
    this[args] = value;
  };
  ExitPrimitive.prototype = Proto;
  return function(value) {
    return new ExitPrimitive(value);
  };
};
var exitSucceed = /* @__PURE__ */ makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
  }
});
var StackTraceKey = {
  key: "effect/Cause/StackTrace"
};
var InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace"
};
var exitFailCause = /* @__PURE__ */ makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args];
    let annotated = false;
    if (fiber.cache.stackFrame) {
      cause = causeAnnotate(cause, {
        mapUnsafe: new Map([[StackTraceKey.key, fiber.cache.stackFrame]])
      });
      annotated = true;
    }
    let cont = fiber.getCont(contE);
    const interruptedCause = fiber._interruptedCause;
    if (interruptedCause && fiber.interruptible) {
      let skippedHandler = false;
      while (cont && fiber.interruptible) {
        skippedHandler ||= identifier in cont;
        cont = fiber.getCont(contE);
      }
      if (skippedHandler) {
        cause = causeFromReasons(cause.reasons.filter((reason) => reason._tag !== "Fail"));
      }
      cause = causeCombine(cause, interruptedCause);
      annotated = true;
    }
    return cont ? cont[contE](cause, fiber, annotated ? undefined : this) : fiber.yieldWith(annotated ? exitFailCause(cause) : this);
  }
});
var exitFail = (e) => exitFailCause(causeFail(e));
var exitDie = (defect) => exitFailCause(causeDie(defect));
var withFiber = /* @__PURE__ */ makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber);
  }
});
var withFiberSucceed = /* @__PURE__ */ makePrimitive({
  op: "WithFiberSucceed",
  [evaluate](fiber) {
    const value = this[args](fiber);
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
  }
});
var YieldableError = /* @__PURE__ */ function() {

  class YieldableError extends globalThis.Error {
  }
  const proto = /* @__PURE__ */ makePrimitiveProto({
    op: "YieldableError",
    [evaluate]() {
      return exitFail(this);
    }
  });
  delete proto.toString;
  Object.assign(YieldableError.prototype, proto);
  return YieldableError;
}();
var Error2 = /* @__PURE__ */ function() {
  const plainArgsSymbol = /* @__PURE__ */ Symbol.for("effect/Data/Error/plainArgs");
  return class Base extends YieldableError {
    constructor(args) {
      super(args?.message, args?.cause ? {
        cause: args.cause
      } : undefined);
      if (args) {
        assignProperties(this, args);
        Object.defineProperty(this, plainArgsSymbol, {
          value: args,
          enumerable: false
        });
      }
    }
    toJSON() {
      return {
        ...this[plainArgsSymbol],
        ...this
      };
    }
  };
}();
var TaggedError = (tag) => {

  class Base extends Error2 {
    _tag = tag;
  }
  Base.prototype.name = tag;
  return Base;
};
var NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError";
class NoSuchElementError extends (/* @__PURE__ */ TaggedError("NoSuchElementError")) {
  [NoSuchElementErrorTypeId] = NoSuchElementErrorTypeId;
  constructor(message) {
    super({
      message
    });
  }
}
var DoneTypeId = "~effect/Cause/Done";
var isDone = (u) => hasProperty(u, DoneTypeId);
var DoneVoid = {
  [DoneTypeId]: DoneTypeId,
  _tag: "Done",
  value: undefined
};
var Done = (value) => {
  if (value === undefined)
    return DoneVoid;
  return {
    [DoneTypeId]: DoneTypeId,
    _tag: "Done",
    value
  };
};
var doneVoid = /* @__PURE__ */ exitFail(DoneVoid);
var done = (value) => {
  if (value === undefined)
    return doneVoid;
  return exitFail(Done(value));
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Effectable.js
var Prototype2 = (options) => makePrimitiveProto({
  op: options.label,
  [evaluate]: options.evaluate
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/option.js
var TypeId = "~effect/Option";
var CommonProto = {
  [TypeId]: {
    _A: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SomeProto = /* @__PURE__ */ Object.defineProperty(/* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Some",
  _op: "Some",
  [symbol2](that) {
    return isOption(that) && isSome(that) && equals(this.value, that.value);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.value));
  },
  toString() {
    return `some(${format(this.value)})`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag,
      value: toJson(this.value)
    };
  }
}), "valueOrUndefined", {
  get() {
    return this.value;
  }
});
var NoneHash = /* @__PURE__ */ hash("None");
var NoneProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "None",
  _op: "None",
  valueOrUndefined: undefined,
  [symbol2](that) {
    return isOption(that) && isNone(that);
  },
  [symbol]() {
    return NoneHash;
  },
  toString() {
    return `none()`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag
    };
  }
});
var isOption = (input) => hasProperty(input, TypeId);
var isNone = (fa) => fa._tag === "None";
var isSome = (fa) => fa._tag === "Some";
var none = /* @__PURE__ */ Object.create(NoneProto);
var SomeImpl = function(value) {
  this.value = value;
};
SomeImpl.prototype = SomeProto;
var some = (value) => new SomeImpl(value);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/result.js
var TypeId2 = "~effect/Result";
var CommonProto2 = {
  [TypeId2]: {
    _A: (_) => _,
    _E: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SuccessProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Success",
  _op: "Success",
  [symbol2](that) {
    return isResult(that) && isSuccess(that) && equals(this.success, that.success);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.success));
  },
  toString() {
    return `success(${format(this.success)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    };
  }
});
var FailureProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Failure",
  _op: "Failure",
  [symbol2](that) {
    return isResult(that) && isFailure(that) && equals(this.failure, that.failure);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.failure));
  },
  toString() {
    return `failure(${format(this.failure)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    };
  }
});
var isResult = (input) => hasProperty(input, TypeId2);
var isFailure = (result) => result._tag === "Failure";
var isSuccess = (result) => result._tag === "Success";
var FailureImpl = function(failure) {
  this.failure = failure;
};
FailureImpl.prototype = FailureProto;
var fail = (failure) => new FailureImpl(failure);
var SuccessImpl = function(success) {
  this.success = success;
};
SuccessImpl.prototype = SuccessProto;
var succeed = (success) => new SuccessImpl(success);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Order.js
function make(compare) {
  return (self, that) => self === that ? 0 : compare(self, that);
}
var Number2 = /* @__PURE__ */ make((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that))
    return 0;
  if (globalThis.Number.isNaN(self))
    return -1;
  if (globalThis.Number.isNaN(that))
    return 1;
  return self < that ? -1 : 1;
});
var mapInput = /* @__PURE__ */ dual(2, (self, f) => make((b1, b2) => self(f(b1), f(b2))));
var isGreaterThan = (O) => dual(2, (self, that) => O(self, that) === 1);
var isGreaterThanOrEqualTo = (O) => dual(2, (self, that) => O(self, that) !== -1);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Option.js
var none2 = () => none;
var some2 = some;
var isNone2 = isNone;
var isSome2 = isSome;
var getOrElse = /* @__PURE__ */ dual(2, (self, onNone) => isNone2(self) ? onNone() : self.value);
var getOrUndefined = /* @__PURE__ */ getOrElse(constUndefined);
var filter = /* @__PURE__ */ dual(2, (self, predicate) => isNone2(self) ? none2() : predicate(self.value) ? some2(self.value) : none2());

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Context.js
var ServiceTypeId = "~effect/Context/Service";
var Service = function() {
  function KeyClass() {}
  const self = KeyClass;
  Object.setPrototypeOf(self, ServiceProto);
  const init = (key, options) => {
    self.key = key;
    if (options?.defaultValue) {
      self[ReferenceTypeId] = ReferenceTypeId;
      self.defaultValue = options.defaultValue;
    }
    if (options?.make) {
      self.make = options.make;
    }
    if (options?.fiberCached) {
      cacheKeys.add(key);
    }
    return self;
  };
  return arguments.length > 0 ? init(arguments[0], arguments[1]) : init;
};
var ServiceProto = {
  [ServiceTypeId]: ServiceTypeId,
  .../* @__PURE__ */ Prototype2({
    label: "Service",
    evaluate(fiber) {
      return exitSucceed(get(fiber.context, this));
    }
  }),
  toJSON() {
    return {
      _id: "Service",
      key: this.key
    };
  },
  of(self) {
    return self;
  },
  context(self) {
    return make2(this, self);
  },
  use(f) {
    return withFiber((fiber) => f(get(fiber.context, this)));
  },
  useSync(f) {
    return withFiber((fiber) => exitSucceed(f(get(fiber.context, this))));
  }
};
var cacheKeys = /* @__PURE__ */ new Set;
var ReferenceTypeId = "~effect/Context/Reference";
var TypeId3 = "~effect/Context";
var MaxDepth = 8;
var FlattenAfterBaseHits = 8;
var makeImpl = (cacheRoot, base, overlay, depth) => {
  const self = Object.create(Proto);
  self.cacheRoot = cacheRoot ?? self;
  self.base = base;
  self.overlay = overlay;
  self.depth = depth;
  self._flat = undefined;
  self.baseHits = 0;
  return self;
};
var applyOverlays = (map, overlay) => {
  if (!overlay)
    return;
  applyOverlays(map, overlay.parent);
  map.set(overlay.key, overlay.value);
};
var flatten = (self) => {
  if (self._flat)
    return self._flat;
  if (!self.overlay)
    return self._flat = self.base;
  const map = new Map(self.base);
  applyOverlays(map, self.overlay);
  return self._flat = map;
};
var notFound = /* @__PURE__ */ Symbol();
var lookup = (self, key) => {
  const impl = self;
  for (let overlay = impl.overlay;overlay; overlay = overlay.parent) {
    if (overlay.key === key)
      return overlay.value;
  }
  const value = impl.base.get(key);
  if (value === undefined && !impl.base.has(key))
    return notFound;
  if (impl.overlay && ++impl.baseHits >= impl.base.size && impl.baseHits >= FlattenAfterBaseHits) {
    impl.base = flatten(impl);
    impl.overlay = undefined;
    impl.depth = 0;
  }
  return value;
};
var makeUnsafe = (mapUnsafe) => makeImpl(undefined, mapUnsafe, undefined, 0);
var Proto = {
  get mapUnsafe() {
    return flatten(this);
  },
  ...PipeInspectableProto,
  [TypeId3]: {
    _Services: (_) => _
  },
  toJSON() {
    return {
      _id: "Context",
      services: Array.from(this.mapUnsafe).map(([key, value]) => ({
        key,
        value
      }))
    };
  },
  [symbol2](that) {
    if (!isContext(that))
      return false;
    const self = this.mapUnsafe;
    const other = that.mapUnsafe;
    if (self.size !== other.size)
      return false;
    for (const [key, value] of self) {
      if (!other.has(key) || !equals(value, other.get(key)))
        return false;
    }
    return true;
  },
  [symbol]() {
    return number(this.mapUnsafe.size);
  }
};
var hasSameCache = (self, that) => self.cacheRoot === that.cacheRoot;
var isContext = (u) => hasProperty(u, TypeId3);
var isReference = (u) => !!u[ReferenceTypeId];
var empty = () => emptyContext2;
var emptyContext2 = /* @__PURE__ */ makeUnsafe(/* @__PURE__ */ new Map);
var make2 = (key, service) => makeUnsafe(new Map([[key.key, service]]));
var add = /* @__PURE__ */ dual(3, (self, key, service) => addUnsafe(self, key.key, service));
var addUnsafe = (self, key, service) => {
  const impl = self;
  const cacheRoot = cacheKeys.has(key) ? undefined : impl.cacheRoot;
  if (impl.depth >= MaxDepth) {
    const map = new Map(impl._flat ?? impl.base);
    if (!impl._flat)
      applyOverlays(map, impl.overlay);
    map.set(key, service);
    return makeImpl(cacheRoot, map, undefined, 0);
  }
  return makeImpl(cacheRoot, impl.base, {
    key,
    value: service,
    parent: impl.overlay
  }, impl.depth + 1);
};
var getOrUndefinedUnsafe = (self, key) => {
  const value = lookup(self, key);
  return value === notFound ? undefined : value;
};
var getUnsafe = /* @__PURE__ */ dual(2, (self, service) => {
  const value = lookup(self, service.key);
  if (value === notFound) {
    if (isReference(service))
      return getDefaultValue(service);
    throw serviceNotFoundError(service);
  }
  return value;
});
var get = getUnsafe;
var defaultValueCacheKey = "~effect/Context/defaultValue";
var getDefaultValue = (ref) => {
  if (defaultValueCacheKey in ref) {
    return ref[defaultValueCacheKey];
  }
  return ref[defaultValueCacheKey] = ref.defaultValue();
};
var serviceNotFoundError = (service) => {
  const error = new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
  if (error.stack) {
    const lines = error.stack.split(`
`);
    lines.splice(1, 3);
    error.stack = lines.join(`
`);
  }
  return error;
};
var Reference = Service;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/array.js
var isArrayNonEmpty = (self) => self.length > 0;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Result.js
var succeed2 = succeed;
var fail2 = fail;
var isFailure2 = isFailure;
var match = /* @__PURE__ */ dual(2, (self, {
  onFailure,
  onSuccess
}) => isFailure2(self) ? onFailure(self.failure) : onSuccess(self.success));

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Array.js
var Array2 = globalThis.Array;
var fromIterable = (collection) => Array2.isArray(collection) ? collection : Array2.from(collection);
var append = /* @__PURE__ */ dual(2, (self, last) => [...self, last]);
var isArray = Array2.isArray;
var isArrayNonEmpty2 = isArrayNonEmpty;
var isReadonlyArrayNonEmpty = isArrayNonEmpty;
var empty2 = () => [];
var of = (a) => [a];
var map = /* @__PURE__ */ dual(2, (self, f) => self.map(f));

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Duration.js
var TypeId4 = "~effect/Duration";
var bigint0 = /* @__PURE__ */ BigInt(0);
var bigint1 = /* @__PURE__ */ BigInt(1);
var bigint2 = /* @__PURE__ */ BigInt(2);
var bigint10 = /* @__PURE__ */ BigInt(10);
var bigint24 = /* @__PURE__ */ BigInt(24);
var bigint60 = /* @__PURE__ */ BigInt(60);
var bigint1e3 = /* @__PURE__ */ BigInt(1000);
var bigint1e6 = /* @__PURE__ */ BigInt(1e6);
var roundTiesAwayFromZero = (input) => BigInt(Math.sign(input) * Math.round(Math.abs(input)));
var roundMillisToNanos = (millis) => roundTiesAwayFromZero(millis * 1e6);
var fromNanosNumber = (nanos) => make3(Number.isFinite(nanos) ? roundTiesAwayFromZero(nanos) : nanos);
var parseNanos = (input, scale) => {
  const decimalIndex = input.indexOf(".");
  if (decimalIndex === -1)
    return BigInt(input) * scale;
  const isNegative = input[0] === "-";
  const fractional = input.slice(decimalIndex + 1);
  const fractionalScale = bigint10 ** BigInt(fractional.length);
  const scaled = (BigInt(input.slice(isNegative ? 1 : 0, decimalIndex)) * fractionalScale + BigInt(fractional)) * scale;
  return divideTiesAwayFromZero(isNegative ? -scaled : scaled, fractionalScale);
};
var divideTiesAwayFromZero = (numerator, denominator) => {
  const absolute = numerator < bigint0 ? -numerator : numerator;
  const rounded = absolute / denominator + (absolute % denominator * bigint2 >= denominator ? bigint1 : bigint0);
  return numerator < bigint0 ? -rounded : rounded;
};
var DURATION_REGEXP = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;
var fromInputUnsafe = (input) => {
  switch (typeof input) {
    case "number":
      return millis(input);
    case "bigint":
      return nanos(input);
    case "string": {
      if (input === "Infinity") {
        return infinity;
      }
      if (input === "-Infinity") {
        return negativeInfinity;
      }
      const match = DURATION_REGEXP.exec(input);
      if (!match)
        break;
      const [_, valueStr, unit] = match;
      if (unit === "nano" || unit === "nanos") {
        return nanos(parseNanos(valueStr, bigint1));
      }
      if (unit === "micro" || unit === "micros") {
        return nanos(parseNanos(valueStr, bigint1e3));
      }
      const value = Number(valueStr);
      switch (unit) {
        case "milli":
        case "millis":
          return millis(value);
        case "second":
        case "seconds":
          return seconds(value);
        case "minute":
        case "minutes":
          return minutes(value);
        case "hour":
        case "hours":
          return hours(value);
        case "day":
        case "days":
          return days(value);
        case "week":
        case "weeks":
          return weeks(value);
      }
      break;
    }
    case "object": {
      if (input === null)
        break;
      if (TypeId4 in input)
        return input;
      if (Array.isArray(input)) {
        if (input.length !== 2 || !input.every(isNumber)) {
          return invalid(input);
        }
        if (Number.isNaN(input[0]) || Number.isNaN(input[1])) {
          return zero;
        }
        if (input[0] === -Infinity || input[1] === -Infinity) {
          return negativeInfinity;
        }
        if (input[0] === Infinity || input[1] === Infinity) {
          return infinity;
        }
        return fromNanosNumber(input[0] * 1e9 + input[1]);
      }
      const obj = input;
      let millis = 0;
      if (obj.weeks)
        millis += obj.weeks * 604800000;
      if (obj.days)
        millis += obj.days * 86400000;
      if (obj.hours)
        millis += obj.hours * 3600000;
      if (obj.minutes)
        millis += obj.minutes * 60000;
      if (obj.seconds)
        millis += obj.seconds * 1000;
      if (obj.milliseconds)
        millis += obj.milliseconds;
      if (!obj.microseconds && !obj.nanoseconds)
        return make3(millis);
      return fromNanosNumber(millis * 1e6 + (obj.microseconds ?? 0) * 1000 + (obj.nanoseconds ?? 0));
    }
  }
  return invalid(input);
};
var invalid = (input) => {
  throw new Error(`Invalid Input: ${input}`);
};
var zeroDurationValue = {
  _tag: "Millis",
  millis: 0
};
var infinityDurationValue = {
  _tag: "Infinity"
};
var negativeInfinityDurationValue = {
  _tag: "NegativeInfinity"
};
var DurationProto = {
  [TypeId4]: TypeId4,
  [symbol]() {
    switch (this.value._tag) {
      case "Millis": {
        const nanos = this.value.millis * 1e6;
        return Number.isFinite(nanos) ? hash(roundTiesAwayFromZero(nanos)) : number(this.value.millis);
      }
      case "Nanos":
        return hash(this.value.nanos);
      default:
        return structure(this.value);
    }
  },
  [symbol2](that) {
    return isDuration(that) && equals2(this, that);
  },
  toString() {
    switch (this.value._tag) {
      case "Infinity":
        return "Infinity";
      case "NegativeInfinity":
        return "-Infinity";
      case "Nanos":
        return `${this.value.nanos} nanos`;
      case "Millis":
        return `${this.value.millis} millis`;
    }
  },
  toJSON() {
    switch (this.value._tag) {
      case "Millis":
        return {
          _id: "Duration",
          _tag: "Millis",
          millis: this.value.millis
        };
      case "Nanos":
        return {
          _id: "Duration",
          _tag: "Nanos",
          nanos: String(this.value.nanos)
        };
      case "Infinity":
        return {
          _id: "Duration",
          _tag: "Infinity"
        };
      case "NegativeInfinity":
        return {
          _id: "Duration",
          _tag: "NegativeInfinity"
        };
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var make3 = (input) => {
  const duration = Object.create(DurationProto);
  if (typeof input === "number") {
    if (isNaN(input) || input === 0 || Object.is(input, -0)) {
      duration.value = zeroDurationValue;
    } else if (!Number.isFinite(input)) {
      duration.value = input > 0 ? infinityDurationValue : negativeInfinityDurationValue;
    } else if (!Number.isInteger(input)) {
      duration.value = {
        _tag: "Nanos",
        nanos: roundMillisToNanos(input)
      };
    } else {
      duration.value = {
        _tag: "Millis",
        millis: input
      };
    }
  } else if (input === bigint0) {
    duration.value = zeroDurationValue;
  } else {
    duration.value = {
      _tag: "Nanos",
      nanos: input
    };
  }
  return duration;
};
var isDuration = (u) => hasProperty(u, TypeId4);
var isZero = (self) => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis === 0;
    case "Nanos":
      return self.value.nanos === bigint0;
    case "Infinity":
    case "NegativeInfinity":
      return false;
  }
};
var isNegative = (self) => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis < 0;
    case "Nanos":
      return self.value.nanos < bigint0;
    case "NegativeInfinity":
      return true;
    case "Infinity":
      return false;
  }
};
var abs = (self) => {
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      return infinity;
    case "Millis":
      return self.value.millis < 0 ? make3(-self.value.millis) : self;
    case "Nanos":
      return self.value.nanos < bigint0 ? make3(-self.value.nanos) : self;
  }
};
var zero = /* @__PURE__ */ make3(0);
var infinity = /* @__PURE__ */ make3(Infinity);
var negativeInfinity = /* @__PURE__ */ make3(-Infinity);
var nanos = (nanos) => make3(nanos);
var millis = (millis) => make3(millis);
var seconds = (seconds) => make3(seconds * 1000);
var minutes = (minutes) => make3(minutes * 60000);
var hours = (hours) => make3(hours * 3600000);
var days = (days) => make3(days * 86400000);
var weeks = (weeks) => make3(weeks * 604800000);
var toMillis = (self) => match2(fromInputUnsafe(self), {
  onMillis: identity,
  onNanos: (nanos) => Number(nanos) / 1e6,
  onInfinity: () => Infinity,
  onNegativeInfinity: () => -Infinity
});
var toNanosUnsafe = (input) => {
  const self = fromInputUnsafe(input);
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      throw new Error("Cannot convert infinite duration to nanos");
    case "Nanos":
      return self.value.nanos;
    case "Millis":
      return roundMillisToNanos(self.value.millis);
  }
};
var match2 = /* @__PURE__ */ dual(2, (self, options) => {
  switch (self.value._tag) {
    case "Millis":
      return options.onMillis(self.value.millis);
    case "Nanos":
      return options.onNanos(self.value.nanos);
    case "Infinity":
      return options.onInfinity();
    case "NegativeInfinity":
      return (options.onNegativeInfinity ?? options.onInfinity)();
  }
});
var matchPair = /* @__PURE__ */ dual(3, (self, that, options) => {
  if (self.value._tag === "Infinity" || self.value._tag === "NegativeInfinity" || that.value._tag === "Infinity" || that.value._tag === "NegativeInfinity")
    return options.onInfinity(self, that);
  if (self.value._tag === "Millis") {
    return that.value._tag === "Millis" ? options.onMillis(self.value.millis, that.value.millis) : options.onNanos(toNanosUnsafe(self), that.value.nanos);
  } else {
    return options.onNanos(self.value.nanos, toNanosUnsafe(that));
  }
});
var Equivalence = (self, that) => matchPair(self, that, {
  onMillis: (self, that) => self === that,
  onNanos: (self, that) => self === that,
  onInfinity: (self, that) => self.value._tag === that.value._tag
});
var equals2 = /* @__PURE__ */ dual(2, (self, that) => Equivalence(self, that));
var parts = (self) => {
  if (self.value._tag === "Infinity") {
    return {
      days: Infinity,
      hours: Infinity,
      minutes: Infinity,
      seconds: Infinity,
      millis: Infinity,
      nanos: Infinity
    };
  }
  if (self.value._tag === "NegativeInfinity") {
    return {
      days: -Infinity,
      hours: -Infinity,
      minutes: -Infinity,
      seconds: -Infinity,
      millis: -Infinity,
      nanos: -Infinity
    };
  }
  const n = toNanosUnsafe(self);
  const neg = n < bigint0;
  const a = neg ? -n : n;
  const ms = a / bigint1e6;
  const sec = ms / bigint1e3;
  const min = sec / bigint60;
  const hr = min / bigint60;
  const d = hr / bigint24;
  const sign = neg ? -1 : 1;
  return {
    days: sign * Number(d),
    hours: sign * Number(hr % bigint24),
    minutes: sign * Number(min % bigint60),
    seconds: sign * Number(sec % bigint60),
    millis: sign * Number(ms % bigint1e3),
    nanos: sign * Number(a % bigint1e6)
  };
};
var format2 = (self) => {
  if (self.value._tag === "Infinity") {
    return "Infinity";
  }
  if (self.value._tag === "NegativeInfinity") {
    return "-Infinity";
  }
  if (isZero(self)) {
    return "0";
  }
  if (isNegative(self)) {
    return "-" + format2(abs(self));
  }
  const fragments = parts(self);
  const pieces = [];
  if (fragments.days !== 0) {
    pieces.push(`${fragments.days}d`);
  }
  if (fragments.hours !== 0) {
    pieces.push(`${fragments.hours}h`);
  }
  if (fragments.minutes !== 0) {
    pieces.push(`${fragments.minutes}m`);
  }
  if (fragments.seconds !== 0) {
    pieces.push(`${fragments.seconds}s`);
  }
  if (fragments.millis !== 0) {
    pieces.push(`${fragments.millis}ms`);
  }
  if (fragments.nanos !== 0) {
    pieces.push(`${fragments.nanos}ns`);
  }
  return pieces.join(" ");
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Scheduler.js
var Scheduler = /* @__PURE__ */ Reference("effect/Scheduler", {
  fiberCached: true,
  defaultValue: () => new MixedScheduler
});
var setMicrotask = (f) => {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled)
      f();
  });
  return () => {
    cancelled = true;
  };
};
var setTimer = "setImmediate" in globalThis ? (f) => {
  const timer = globalThis.setImmediate(f);
  return () => globalThis.clearImmediate(timer);
} : (f) => {
  const timer = setTimeout(f, 0);
  return () => clearTimeout(timer);
};
var setImmediate = (f) => {
  try {
    return setTimer(f);
  } catch {
    return setMicrotask(f);
  }
};

class PriorityBuckets {
  buckets = [];
  scheduleTask(task, priority) {
    const buckets = this.buckets;
    const len = buckets.length;
    let bucket;
    let index = 0;
    for (;index < len; index++) {
      if (buckets[index][0] > priority)
        break;
      bucket = buckets[index];
    }
    if (bucket && bucket[0] === priority) {
      bucket[1].push(task);
    } else if (index === len) {
      buckets.push([priority, [task]]);
    } else {
      buckets.splice(index, 0, [priority, [task]]);
    }
  }
  drain() {
    const buckets = this.buckets;
    this.buckets = [];
    return buckets;
  }
}

class MixedScheduler {
  executionMode;
  setImmediate;
  constructor(executionMode = "async", setImmediateFn) {
    this.executionMode = executionMode;
    this.setImmediate = setImmediateFn ?? (executionMode === "sync" ? setMicrotask : setImmediate);
  }
  shouldYield(fiber) {
    return fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield;
  }
  makeDispatcher() {
    return new MixedSchedulerDispatcher(this.setImmediate);
  }
}

class MixedSchedulerDispatcher {
  tasks = /* @__PURE__ */ new PriorityBuckets;
  running = undefined;
  setImmediate;
  constructor(setImmediateFn = setImmediate) {
    this.setImmediate = setImmediateFn;
  }
  scheduleTask(task, priority) {
    this.tasks.scheduleTask(task, priority);
    if (this.running === undefined) {
      this.running = this.setImmediate(this.afterScheduled);
    }
  }
  afterScheduled = () => {
    this.running = undefined;
    this.runTasks();
  };
  runTasks() {
    const buckets = this.tasks.drain();
    for (let i = 0;i < buckets.length; i++) {
      const toRun = buckets[i][1];
      for (let j = 0;j < toRun.length; j++) {
        toRun[j]();
      }
    }
  }
  flush() {
    while (this.tasks.buckets.length > 0) {
      if (this.running !== undefined) {
        this.running();
        this.running = undefined;
      }
      this.runTasks();
    }
  }
}
var MaxOpsBeforeYield = /* @__PURE__ */ Reference("effect/Scheduler/MaxOpsBeforeYield", {
  fiberCached: true,
  defaultValue: () => 2048
});
var PreventSchedulerYield = /* @__PURE__ */ Reference("effect/Scheduler/PreventSchedulerYield", {
  fiberCached: true,
  defaultValue: () => false
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Data.js
var TaggedError2 = TaggedError;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/encoding/EncodingError.js
var EncodingErrorTypeId = "~effect/encoding/EncodingError";

class EncodingError extends (/* @__PURE__ */ TaggedError2("EncodingError")) {
  [EncodingErrorTypeId] = EncodingErrorTypeId;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Tracer.js
var ParentSpanKey = "effect/Tracer/ParentSpan";
var TracerKey = "effect/Tracer";

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/metric.js
var FiberRuntimeMetricsKey = "effect/Metric/FiberRuntimeMetrics";

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/references.js
var CurrentStackFrame = /* @__PURE__ */ Reference("effect/References/CurrentStackFrame", {
  fiberCached: true,
  defaultValue: constUndefined
});
var TracerEnabled = /* @__PURE__ */ Reference("effect/References/TracerEnabled", {
  fiberCached: true,
  defaultValue: constTrue
});
var CurrentLogAnnotations = /* @__PURE__ */ Reference("effect/References/CurrentLogAnnotations", {
  defaultValue: () => ({})
});
var CurrentLogLevel = /* @__PURE__ */ Reference("effect/References/CurrentLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});
var MinimumLogLevel = /* @__PURE__ */ Reference("effect/References/MinimumLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});
var CurrentLogSpans = /* @__PURE__ */ Reference("effect/References/CurrentLogSpans", {
  defaultValue: () => []
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/effect.js
class Interrupt extends ReasonBase {
  constructor(fiberId, annotations = constEmptyAnnotations) {
    super("Interrupt", annotations, "Interrupted");
    this.fiberId = fiberId;
  }
  toString() {
    return `Interrupt(${this.fiberId})`;
  }
  toJSON() {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    };
  }
  [symbol2](that) {
    return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
  }
  [symbol]() {
    return combine(string(`${this._tag}:${this.fiberId}`))(random(this.annotations));
  }
}
var causeInterrupt = (fiberId) => new CauseImpl([new Interrupt(fiberId)]);
var findFail = (self) => {
  const reason = self.reasons.find(isFailReason);
  return reason ? succeed2(reason) : fail2(self);
};
var findError = (self) => {
  for (let i = 0;i < self.reasons.length; i++) {
    const reason = self.reasons[i];
    if (reason._tag === "Fail") {
      return succeed2(reason.error);
    }
  }
  return fail2(self);
};
var hasInterrupts = (self) => self.reasons.some(isInterruptReason);
var causeMap = /* @__PURE__ */ dual(2, (self, f) => {
  let hasFail = false;
  const failures = self.reasons.map((failure) => {
    if (isFailReason(failure)) {
      hasFail = true;
      return new Fail(f(failure.error), failure.annotations);
    }
    return failure;
  });
  return hasFail ? causeFromReasons(failures) : self;
});
var causeSquash = (self) => {
  let die;
  for (const reason of self.reasons) {
    if (reason._tag === "Fail")
      return reason.error;
    if (reason._tag === "Die")
      die ??= reason;
  }
  if (die !== undefined)
    return die.defect;
  if (self.reasons.length > 0)
    return new globalThis.Error("All fibers interrupted without error");
  return new globalThis.Error("Empty cause");
};
var causePrettyErrors = (self, options) => {
  const errors = [];
  const interrupts = [];
  if (self.reasons.length === 0)
    return errors;
  const prevStackLimit = getStackTraceLimit();
  if (prevStackLimit !== 0)
    setStackTraceLimit(1);
  try {
    for (const failure of self.reasons) {
      if (failure._tag === "Interrupt") {
        interrupts.push(failure);
        continue;
      }
      errors.push(causePrettyError(failure._tag === "Die" ? failure.defect : failure.error, failure.annotations, options));
    }
    if (errors.length === 0) {
      const cause = new Error("The fiber was interrupted by:");
      cause.name = "InterruptCause";
      cause.stack = interruptCauseStack(cause, interrupts);
      const error = new globalThis.Error("All fibers interrupted without error", {
        cause
      });
      error.name = "InterruptError";
      error.stack = `${error.name}: ${error.message}`;
      errors.push(causePrettyError(error, interrupts[0].annotations, options));
    }
  } finally {
    if (prevStackLimit !== 0)
      setStackTraceLimit(prevStackLimit);
  }
  return errors;
};
var causePrettyError = (original, annotations, options) => {
  const kind = typeof original;
  let error;
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause) : undefined
    });
    if (typeof original.name === "string") {
      error.name = original.name;
    }
    if (typeof original.stack === "string") {
      error.stack = cleanErrorStack(original.stack, error, annotations);
    } else {
      const stack = `${error.name}: ${error.message}`;
      error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
    }
    if (options?.includeCauseInStack) {
      error.stack = renderPrettyError(error);
    }
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        error[key] = original[key];
      }
    }
  } else {
    error = new globalThis.Error(!original ? `Unknown error: ${original}` : kind === "string" ? original : formatJson(original));
    const stack = `${error.name}: ${error.message}`;
    error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
  }
  return error;
};
var causePrettyMessage = (u) => {
  if (typeof u.message === "string") {
    return u.message;
  } else if (typeof u.toString === "function" && u.toString !== Object.prototype.toString && u.toString !== Array.prototype.toString) {
    try {
      return u.toString();
    } catch {}
  }
  return formatJson(u);
};
var locationRegExp = /\((.*)\)/g;
var cleanErrorStack = (stack, error, annotations) => {
  const message = `${error.name}: ${error.message}`;
  const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split(`
`);
  const out = [message];
  for (let i = 1;i < lines.length; i++) {
    if (/Generator\.next|~effect\/(?:Effect|Utils)/.test(lines[i])) {
      break;
    }
    out.push(lines[i]);
  }
  return annotations ? addStackAnnotations(out.join(`
`), annotations) : out.join(`
`);
};
var addStackAnnotations = (stack, annotations) => {
  const frame = annotations?.get(StackTraceKey.key);
  if (frame) {
    stack = `${stack}
${currentStackTrace(frame)}`;
  }
  return stack;
};
var interruptCauseStack = (error, interrupts) => {
  const out = [`${error.name}: ${error.message}`];
  for (const current of interrupts) {
    const fiberId = current.fiberId !== undefined ? `#${current.fiberId}` : "unknown";
    const frame = current.annotations.get(InterruptorStackTrace.key);
    out.push(`    at fiber (${fiberId})`);
    if (frame)
      out.push(currentStackTrace(frame));
  }
  return out.join(`
`);
};
var currentStackTrace = (frame) => {
  const out = [];
  let current = frame;
  let i = 0;
  while (current && i < 10) {
    const stack = current.stack();
    if (stack) {
      const locationMatchAll = stack.matchAll(locationRegExp);
      let match = false;
      for (const [, location] of locationMatchAll) {
        match = true;
        out.push(`    at ${current.name} (${location})`);
      }
      if (!match) {
        out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
      }
    } else {
      out.push(`    at ${current.name}`);
    }
    current = current.parent;
    i++;
  }
  return out.join(`
`);
};
var causePretty = (cause) => causePrettyErrors(cause).map(renderPrettyError).join(`
`);
var renderPrettyError = (e) => e.cause ? `${e.stack} {
${renderErrorCause(e.cause, "  ")}
}` : e.stack;
var renderErrorCause = (cause, prefix) => {
  const lines = cause.stack.split(`
`);
  let stack = `${prefix}[cause]: ${lines[0]}`;
  for (let i = 1, len = lines.length;i < len; i++) {
    stack += `
${prefix}${lines[i]}`;
  }
  if (cause.cause) {
    stack += ` {
${renderErrorCause(cause.cause, `${prefix}  `)}
${prefix}}`;
  }
  return stack;
};
var FiberTypeId = "~effect/Fiber";
var fiberVariance = {
  _A: identity,
  _E: identity
};
var fiberIdStore = {
  id: 0
};
var AsyncResource = /* @__PURE__ */ (() => {
  try {
    return globalThis.process?.getBuiltinModule?.("node:async_hooks")?.AsyncResource;
  } catch {
    return;
  }
})();
var captureAsyncContext = () => AsyncResource === undefined ? undefined : new AsyncResource("effect/Fiber");
var getCurrentFiber = () => globalThis[currentFiberTypeId];

class FiberImpl {
  constructor(context, interruptible = true) {
    this.setContext(context);
    this.id = ++fiberIdStore.id;
    this.currentOpCount = 0;
    this.interruptible = interruptible;
    this._stack = [];
    this._observers = undefined;
    this._exit = undefined;
    this._children = undefined;
    this._interruptedCause = undefined;
    this._yielded = undefined;
    this._running = false;
    this._deferredInterrupt = false;
    this._parent = undefined;
    this._asyncContext = undefined;
    this.cache.runtimeMetrics?.recordFiberStart(this.context);
  }
  get [FiberTypeId]() {
    return fiberVariance;
  }
  get currentDispatcher() {
    return this._dispatcher ??= this.cache.scheduler.makeDispatcher();
  }
  getRef(ref) {
    return get(this.context, ref);
  }
  addObserver(cb) {
    if (this._exit) {
      cb(this._exit);
      return constVoid;
    }
    if (this._observers === undefined) {
      this._observers = [cb];
    } else {
      this._observers.push(cb);
    }
    return () => this.removeObserver(cb);
  }
  removeObserver(cb) {
    if (this._exit || this._observers === undefined)
      return;
    const index = this._observers.indexOf(cb);
    if (index >= 0) {
      this._observers.splice(index, 1);
    }
  }
  interruptUnsafe(fiberId, annotations) {
    if (this._exit) {
      return;
    }
    let cause = causeInterrupt(fiberId);
    if (this.cache.stackFrame) {
      cause = causeAnnotate(cause, make2(StackTraceKey, this.cache.stackFrame));
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations);
    }
    this._interruptedCause = this._interruptedCause ? causeCombine(this._interruptedCause, cause) : cause;
    if (this.interruptible) {
      if (this._running) {
        this._deferredInterrupt = true;
      } else {
        this.evaluate(failCause(this._interruptedCause));
      }
    }
  }
  pollUnsafe() {
    return this._exit;
  }
  evaluate(effect) {
    if (this._exit) {
      return;
    } else if (this._asyncContext !== undefined) {
      const asyncContext = this._asyncContext;
      this._asyncContext = undefined;
      return asyncContext.runInAsyncScope(this.evaluate, this, effect);
    } else if (this._yielded !== undefined) {
      const yielded = this._yielded;
      this._yielded = undefined;
      yielded();
    }
    const exit = this.runLoop(effect);
    if (exit === Yield) {
      this._asyncContext = captureAsyncContext();
      return;
    }
    const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
    if (interruptChildren !== undefined) {
      return this.evaluate(flatMap(interruptChildren, () => exit));
    }
    this._exit = exit;
    this.cache.runtimeMetrics?.recordFiberEnd(this.context, this._exit);
    if (this._parent) {
      this._parent._children?.delete(this);
      this._parent = undefined;
    }
    if (this._observers !== undefined) {
      const observers = this._observers;
      this._observers = undefined;
      for (let i = 0;i < observers.length; i++) {
        observers[i](exit);
      }
    }
    this._stack.length = 0;
    this._children = undefined;
    this.context = empty();
  }
  runLoop(effect) {
    const prevFiber = globalThis[currentFiberTypeId];
    globalThis[currentFiberTypeId] = this;
    const prevRunning = this._running;
    this._running = true;
    let yielding = false;
    let current = effect;
    this.currentOpCount = 0;
    try {
      while (true) {
        try {
          if (this._deferredInterrupt) {
            this._deferredInterrupt = false;
            current = failCause(this._interruptedCause);
          }
          this.currentOpCount++;
          const cache = this.cache;
          if (!yielding && !cache.preventYield && cache.scheduler.shouldYield(this)) {
            yielding = true;
            const prev = current;
            current = flatMap(yieldNow, () => prev);
          }
          current = cache.tracerContext ? cache.tracerContext(current, this) : current[evaluate](this);
          if (current === Yield) {
            const yielded = this._yielded;
            if (ExitTypeId in yielded) {
              this._deferredInterrupt = false;
              this._yielded = undefined;
              return yielded;
            } else if (this._deferredInterrupt) {
              this._yielded = undefined;
              yielded();
              continue;
            }
            return Yield;
          }
        } catch (error) {
          if (!hasProperty(current, evaluate)) {
            return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
          }
          current = exitDie(error);
        }
      }
    } finally {
      this._running = prevRunning;
      globalThis[currentFiberTypeId] = prevFiber;
    }
  }
  getCont(symbol) {
    if (this._deferredInterrupt) {
      this._deferredInterrupt = false;
      return deferredInterruptCont;
    }
    while (true) {
      const op = this._stack.pop();
      if (!op)
        return;
      const all = op[contAll];
      if (all !== undefined) {
        const cont = all.call(op, this);
        if (cont) {
          cont[symbol] = cont;
          return cont;
        }
      }
      if (op[symbol])
        return op;
    }
  }
  succeedWith(value) {
    if ((++this.currentOpCount & maxInlineSteps - 1) === 0) {
      return exitSucceed(value);
    }
    const cont = this.getCont(contA);
    return cont ? cont[contA](value, this) : this.yieldWith(exitSucceed(value));
  }
  yieldWith(value) {
    this._yielded = value;
    return Yield;
  }
  children() {
    return this._children ??= new Set;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  setContext(context) {
    const previous = this.context;
    this.context = context;
    if (previous !== undefined && hasSameCache(previous, context))
      return;
    const root = context.cacheRoot;
    const cache = root._fiberCache ??= makeFiberContextCache(context);
    if (this.cache?.scheduler !== cache.scheduler) {
      this._dispatcher = undefined;
    }
    this.cache = cache;
  }
  get currentSpanLocal() {
    const span = this.cache.span;
    return span?._tag === "Span" ? span : undefined;
  }
}
var makeFiberContextCache = (context) => {
  const currentTracer = getOrUndefinedUnsafe(context, TracerKey);
  return {
    scheduler: get(context, Scheduler),
    tracer: currentTracer,
    tracerContext: currentTracer ? currentTracer["context"] : undefined,
    tracerEnabled: get(context, TracerEnabled),
    span: getOrUndefinedUnsafe(context, ParentSpanKey),
    logLevel: get(context, CurrentLogLevel),
    minimumLogLevel: get(context, MinimumLogLevel),
    stackFrame: get(context, CurrentStackFrame),
    runtimeMetrics: getOrUndefinedUnsafe(context, FiberRuntimeMetricsKey),
    maxOpsBeforeYield: get(context, MaxOpsBeforeYield),
    preventYield: get(context, PreventSchedulerYield)
  };
};
var deferredInterruptCont = {
  [contA](_value, fiber) {
    return failCause(fiber._interruptedCause);
  },
  [contE](_cause, fiber) {
    return failCause(fiber._interruptedCause);
  }
};
var maxInlineSteps = 32;
var fiberMiddleware = {
  interruptChildren: undefined
};
var fiberStackAnnotations = (fiber) => {
  if (!fiber.cache.stackFrame)
    return;
  const annotations = new Map;
  annotations.set(InterruptorStackTrace.key, fiber.cache.stackFrame);
  return makeUnsafe(annotations);
};
var fiberAwaitAll = (self) => callback((resume) => {
  const iter = self[Symbol.iterator]();
  const exits = [];
  let cancel = undefined;
  function loop() {
    let result = iter.next();
    while (!result.done) {
      if (result.value._exit) {
        exits.push(result.value._exit);
        result = iter.next();
        continue;
      }
      cancel = result.value.addObserver((exit) => {
        exits.push(exit);
        loop();
      });
      return;
    }
    resume(succeed3(exits));
  }
  loop();
  return sync(() => cancel?.());
});
var fiberInterruptAll = (fibers) => withFiber((parent) => {
  const annotations = fiberStackAnnotations(parent);
  let fiberArr = empty2();
  for (const fiber of fibers) {
    fiber.interruptUnsafe(parent.id, annotations);
    fiberArr.push(fiber);
  }
  return asVoid(fiberAwaitAll(fiberArr));
});
var succeed3 = exitSucceed;
var failCause = exitFailCause;
var fail3 = exitFail;
var sync = /* @__PURE__ */ makePrimitive({
  op: "Sync",
  [evaluate](fiber) {
    const value = this[args]();
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
  }
});
var suspend = /* @__PURE__ */ makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]();
  }
});
var fromResult = /* @__PURE__ */ match({
  onFailure: fail3,
  onSuccess: succeed3
});
var yieldNowWith = /* @__PURE__ */ makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false;
    fiber.currentDispatcher.scheduleTask(() => {
      if (resumed)
        return;
      fiber.evaluate(exitVoid);
    }, this[args] ?? 0);
    return fiber.yieldWith(() => {
      resumed = true;
    });
  }
});
var yieldNow = /* @__PURE__ */ yieldNowWith(0);
var failCauseSync = (evaluate) => suspend(() => failCause(evaluate()));
var die = (defect) => exitDie(defect);
var failSync = (error) => suspend(() => fail3(error()));
var void_ = /* @__PURE__ */ succeed3(undefined);
var try_ = (options) => {
  const evaluate = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.try") : options.catch;
  return suspend(() => {
    try {
      return succeed3(evaluate());
    } catch (err) {
      return fail3(catcher(err));
    }
  });
};
var promise = (evaluate) => callbackOptions(function(resume, signal) {
  evaluate(signal).then((a) => resume(succeed3(a)), (e) => resume(die(e)));
}, evaluate.length !== 0);
var tryPromise = (options) => {
  const f = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
  return callbackOptions(function(resume, signal) {
    const failWithCatch = (cause) => suspend(() => {
      try {
        return fail3(internalCall(() => catcher(cause)));
      } catch (err) {
        return die(err);
      }
    });
    try {
      f(signal).then((a) => resume(succeed3(a)), (e) => resume(failWithCatch(e)));
    } catch (err) {
      resume(failWithCatch(err));
    }
  }, f.length !== 0);
};
var callbackOptions = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "Async",
    [evaluate](fiber) {
      let resumed = false;
      let yielded = false;
      const controller = this.withSignal ? new AbortController : undefined;
      const onCancel = this.register.call(fiber.cache.scheduler, (effect) => {
        if (resumed)
          return;
        resumed = true;
        if (yielded) {
          fiber.evaluate(effect);
        } else {
          yielded = effect;
        }
      }, controller?.signal);
      if (yielded !== false)
        return yielded;
      yielded = true;
      fiber._yielded = () => {
        resumed = true;
      };
      if (controller === undefined && onCancel === undefined) {
        return Yield;
      }
      fiber._stack.push(asyncFinalizer(() => {
        resumed = true;
        controller?.abort();
        return onCancel ?? exitVoid;
      }));
      return Yield;
    }
  });
  const AsyncImpl = function(register, withSignal) {
    this.register = register;
    this.withSignal = withSignal;
  };
  AsyncImpl.prototype = Proto;
  return function(register, withSignal) {
    return new AsyncImpl(register, withSignal);
  };
}();
var asyncFinalizer = /* @__PURE__ */ makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false;
      fiber._stack.push(setInterruptibleTrue);
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause) ? flatMap(combineFinalizerCause(exitFailCause(cause), this[args]()), () => failCause(cause)) : failCause(cause);
  }
});
var callback = (register) => callbackOptions(register, register.length >= 2);
var never = /* @__PURE__ */ callback(constVoid);
var gen = (...args) => {
  if (args.length === 1) {
    const body = args[0];
    return suspend(() => fromIteratorUnsafe(body()));
  }
  const [options, body] = args;
  return suspend(() => fromIteratorUnsafe(body.call(options.self)));
};
var fnUntraced = (body, ...pipeables) => {
  const fn = pipeables.length === 0 ? function() {
    return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
  } : function() {
    let effect = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
    for (let i = 0;i < pipeables.length; i++) {
      effect = pipeables[i](effect, ...arguments);
    }
    return effect;
  };
  return defineFunctionLength(body.length, fn);
};
var defineFunctionLength = (length, fn) => Object.defineProperty(fn, "length", {
  value: length,
  configurable: true
});
var fnUntracedEager = (body, ...pipeables) => defineFunctionLength(body.length, pipeables.length === 0 ? function() {
  return fromIteratorEagerUnsafe(() => body.apply(this, arguments));
} : function() {
  let effect = fromIteratorEagerUnsafe(() => body.apply(this, arguments));
  for (const pipeable of pipeables) {
    effect = pipeable(effect, ...arguments);
  }
  return effect;
});
var fromIteratorEagerUnsafe = (evaluate) => {
  try {
    const iterator = evaluate();
    let value = undefined;
    while (true) {
      const state = iterator.next(value);
      if (state.done) {
        return succeed3(state.value);
      }
      const primitive = state.value;
      if (primitive && primitive._tag === "Success") {
        value = primitive.value;
        continue;
      } else if (primitive && primitive._tag === "Failure") {
        return state.value;
      } else {
        let isFirstExecution = true;
        return suspend(() => {
          if (isFirstExecution) {
            isFirstExecution = false;
            return flatMap(state.value, (value) => fromIteratorUnsafe(iterator, value));
          } else {
            return suspend(() => fromIteratorUnsafe(evaluate()));
          }
        });
      }
    }
  } catch (error) {
    return die(error);
  }
};
var fromIteratorUnsafe = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "Iterator",
    [contA](value, fiber) {
      const iter = this.iterator;
      while (true) {
        const state = iter.next(value);
        if (state.done)
          return succeed3(state.value);
        if (!effectIsExit(state.value)) {
          fiber._stack.push(this);
          return state.value;
        } else if (state.value._tag === "Failure") {
          return state.value;
        }
        value = state.value.value;
      }
    },
    [evaluate](fiber) {
      return this[contA](this.initial, fiber);
    }
  });
  const IteratorImpl = function(iterator, initial) {
    this.iterator = iterator;
    this.initial = initial;
  };
  IteratorImpl.prototype = Proto;
  return function(iterator, initial) {
    return new IteratorImpl(iterator, initial);
  };
}();
var as = /* @__PURE__ */ dual(2, (self, value) => new ContImpl(self, returnPayload, succeed3(value)));
var evaluateCont = function(fiber) {
  fiber._stack.push(this);
  return this[args];
};
var OnSuccessProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccess",
  [evaluate]: evaluateCont
});
var ContImpl = function(self, cont, payload) {
  this[args] = self;
  this[contA] = cont;
  this.payload = payload;
};
ContImpl.prototype = OnSuccessProto;
var returnPayload = function() {
  return this.payload;
};
var continuationMarksStack = /* @__PURE__ */ (() => {
  const limit = /* @__PURE__ */ getStackTraceLimit();
  if (limit === 0)
    return false;
  const marker = "~effect/Effect/stackProbe";
  const probe = {
    [marker]: function stackProbe() {
      return new Error;
    }
  };
  setStackTraceLimit(1);
  const error = /* @__PURE__ */ probe[marker]();
  setStackTraceLimit(limit);
  return error.stack?.includes("[as " + marker + "]") === true;
})();
var mapCont = function(value, fiber) {
  const f = this.payload;
  return fiber.succeedWith(continuationMarksStack ? f(value) : internalCall(() => f(value)));
};
var andThenCont = function(value) {
  const f = this.payload;
  return f(value);
};
var asSome = (self) => map2(self, some2);
var andThen = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, isEffect(f) ? returnPayload : andThenCont, f));
var asVoid = (self) => new ContImpl(self, returnPayload, exitVoid);
var raceAllFirst = (all, options) => withFiber((parent) => {
  const fibers = new Set;
  onExitUnsafe(parent, () => fibers.size === 0 ? undefined : fiberInterruptAll(fibers));
  return callback((resume) => {
    let done = false;
    let i = 0;
    for (const effect of all) {
      if (done)
        break;
      const index = i++;
      const fiber = forkUnsafe(parent, effect, true, true, false);
      fibers.add(fiber);
      fiber.addObserver((exit) => {
        fibers.delete(fiber);
        const isWinner = !done;
        done = true;
        resume(exit);
        if (isWinner && options?.onWinner) {
          options.onWinner({
            fiber,
            index,
            parentFiber: parent
          });
        }
      });
    }
  });
});
var raceFirst = /* @__PURE__ */ dual((args) => isEffect(args[1]), (self, that, options) => raceAllFirst([self, that], options));
var flatMap = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, andThenCont, f));
var effectIsExit = (effect) => effect[ExitTypeId] !== undefined;
var flatMapEager = /* @__PURE__ */ dual(2, (self, f) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? f(self.value) : self;
  }
  return flatMap(self, f);
});
var map2 = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, mapCont, f));
var mapEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMap(self, f) : map2(self, f));
var mapErrorEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMapError(self, f) : mapError(self, f));
var exitIsSuccess = (self) => self._tag === "Success";
var exitVoid = /* @__PURE__ */ exitSucceed(undefined);
var exitMap = /* @__PURE__ */ dual(2, (self, f) => self._tag === "Success" ? exitSucceed(f(self.value)) : self);
var exitMapError = /* @__PURE__ */ dual(2, (self, f) => {
  if (self._tag === "Success")
    return self;
  const error = findError(self.cause);
  if (isFailure2(error))
    return self;
  return exitFail(f(error.success));
});
var exitAsVoidAll = (exits) => {
  const failures = [];
  for (const exit of exits) {
    if (exit._tag === "Failure") {
      failures.push(...exit.cause.reasons);
    }
  }
  return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures));
};
var updateContext = /* @__PURE__ */ dual(2, (self, f) => withFiber((fiber) => {
  const prevContext = fiber.context;
  const nextContext = f(prevContext);
  if (prevContext === nextContext)
    return self;
  fiber.setContext(nextContext);
  onExitUnsafe(fiber, () => {
    fiber.setContext(prevContext);
    return;
  });
  return self;
}));
var provideService = function() {
  if (arguments.length === 1) {
    return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl));
  }
  return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl)).apply(this, arguments);
};
var provideServiceImpl = (self, service, implementation) => updateContext(self, add(service, implementation));
var filterOrFail = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, predicate, orFailWith) => filterOrElse(self, predicate, orFailWith ? (a) => fail3(orFailWith(a)) : () => fail3(new NoSuchElementError)));
var forever = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => whileLoop({
  while: constTrue,
  body: constant(options?.disableYield ? self : flatMap(self, (_) => yieldNow)),
  step: constVoid
}));
var catchCause = /* @__PURE__ */ dual(2, (self, f) => new OnFailureImpl(self, f.length !== 1 ? (cause) => f(cause) : f));
var OnFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnFailure",
  [evaluate]: evaluateCont
});
var OnFailureImpl = function(self, f) {
  this[args] = self;
  this[contE] = f;
};
OnFailureImpl.prototype = OnFailureProto;
var catchCauseFilter = /* @__PURE__ */ dual(3, (self, filter, f) => catchCause(self, (cause) => {
  const eb = filter(cause);
  return isFailure2(eb) ? failCause(eb.failure) : f(eb.success, cause);
}));
var catch_ = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter(self, findError, (e) => f(e)));
var tapCauseFilter = /* @__PURE__ */ dual(3, (self, filter, f) => catchCause(self, (cause) => {
  const result = filter(cause);
  if (isFailure2(result)) {
    return failCause(cause);
  }
  return andThen(f(result.success, cause), failCause(cause));
}));
var tapError = /* @__PURE__ */ dual(2, (self, f) => tapCauseFilter(self, findError, (e) => f(e)));
var catchIf = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, predicate, f, orElse) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure2(error))
    return failCause(error.failure);
  if (!predicate(error.success)) {
    return orElse ? orElse(error.success) : failCause(cause);
  }
  return f(error.success);
}));
var catchTag = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, k, f, orElse) => {
  const pred = Array.isArray(k) ? (e) => hasProperty(e, "_tag") && k.includes(e._tag) : isTagged(k);
  return catchIf(self, pred, f, orElse);
});
var mapError = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => failSync(() => f(error))));
var orDie = (self) => catch_(self, die);
var orElseSucceed = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => sync(() => f(error))));
var ignore = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => {
  if (!options?.log) {
    return matchEffect(self, {
      onFailure: (_) => void_,
      onSuccess: (_) => void_
    });
  }
  const logEffect = logWithLevel(options.log === true ? undefined : options.log);
  return matchCauseEffect(self, {
    onFailure(cause) {
      const failure = findFail(cause);
      return isFailure2(failure) ? failCause(failure.failure) : options.message === undefined ? logEffect(cause) : logEffect(options.message, cause);
    },
    onSuccess: (_) => void_
  });
});
var option = (self) => match3(self, {
  onFailure: none2,
  onSuccess: some2
});
var matchCauseEffect = /* @__PURE__ */ dual(2, (self, options) => new OnSuccessAndFailureImpl(self, options.onSuccess.length !== 1 ? (a) => options.onSuccess(a) : options.onSuccess, options.onFailure.length !== 1 ? (cause) => options.onFailure(cause) : options.onFailure));
var OnSuccessAndFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate]: evaluateCont
});
var OnSuccessAndFailureImpl = function(self, onSuccess, onFailure) {
  this[args] = self;
  this[contA] = onSuccess;
  this[contE] = onFailure;
};
OnSuccessAndFailureImpl.prototype = OnSuccessAndFailureProto;
var matchSuccess = function(value, fiber) {
  const handlers = this.payload;
  return fiber.succeedWith(continuationMarksStack ? handlers.onSuccess(value) : internalCall(() => handlers.onSuccess(value)));
};
var makeMatch = (op, onFailure) => {
  const Proto = makePrimitiveProto({
    op,
    [evaluate]: evaluateCont,
    [contA]: matchSuccess,
    [contE]: onFailure
  });
  const MatchImpl = function(self, handlers) {
    this[args] = self;
    this.payload = handlers;
  };
  MatchImpl.prototype = Proto;
  return MatchImpl;
};
var MatchImpl = /* @__PURE__ */ makeMatch("Match", function(cause, fiber) {
  const fail = cause.reasons.find(isFailReason);
  if (fail === undefined)
    return failCause(cause);
  const handlers = this.payload;
  return fiber.succeedWith(continuationMarksStack ? handlers.onFailure(fail.error) : internalCall(() => handlers.onFailure(fail.error)));
});
var matchEffect = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onFailure: (cause) => {
    const fail = cause.reasons.find(isFailReason);
    return fail ? options.onFailure(fail.error) : failCause(cause);
  },
  onSuccess: options.onSuccess
}));
var match3 = /* @__PURE__ */ dual(2, (self, options) => new MatchImpl(self, options));
var exit = (self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self);
var exitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "Exit",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  },
  [contA](value, fiber, exit) {
    return fiber.succeedWith(exit ?? exitSucceed(value));
  },
  [contE](cause, fiber, exit) {
    return fiber.succeedWith(exit ?? exitFailCause(cause));
  }
});
var timeoutOrElse = /* @__PURE__ */ dual(2, (self, options) => flatMap(timeoutOption(self, options.duration), (option) => isNone2(option) ? options.orElse() : succeed3(option.value)));
var timeoutErrorFromDuration = (duration) => new TimeoutError(`Operation timed out after '${format2(duration)}'`);
var timeout = /* @__PURE__ */ dual(2, (self, duration) => {
  const decoded = fromInputUnsafe(duration);
  return timeoutOrElse(self, {
    duration: decoded,
    orElse: () => fail3(timeoutErrorFromDuration(decoded))
  });
});
var timeoutOption = /* @__PURE__ */ dual(2, (self, duration) => raceFirst(asSome(self), as(sleep(duration), none2())));
var ScopeTypeId = "~effect/Scope";
var ScopeCloseableTypeId = "~effect/Scope/Closeable";
var scopeClose = (self, exit_) => withFiber((fiber) => {
  fiberEnterUninterruptibleUnsafe(fiber);
  return scopeCloseUnsafe(self, exit_) ?? void_;
});
var scopeCloseUnsafe = (self, exit_) => {
  const state = self.state;
  if (state._tag === "Closed")
    return;
  self.state = {
    _tag: "Closed",
    exit: exit_
  };
  if (self.parent !== undefined) {
    scopeRemoveFinalizerUnsafe(self.parent, self);
  }
  if (state._tag === "Empty")
    return;
  if (state.finalizer !== undefined) {
    return runFinalizer(state.finalizer, exit_);
  }
  const finalizers = state.finalizers;
  if (finalizers.size === 1) {
    return runFinalizer(finalizers.values().next().value, exit_);
  }
  return scopeCloseFinalizers(self, finalizers, exit_);
};
var runFinalizer = (finalizer, exit_) => {
  try {
    return finalizer(exit_);
  } catch (defect) {
    return exitDie(defect);
  }
};
var combineFinalizerCause = (exit_, finalizer) => exitIsSuccess(exit_) ? finalizer : catchCause(finalizer, (cause) => failCause(causeCombine(exit_.cause, cause)));
var scopeCloseFinalizers = /* @__PURE__ */ fnUntraced(function* (self, finalizers, exit_) {
  let exits = [];
  const fibers = [];
  const arr = Array.from(finalizers.values());
  const parent = getCurrentFiber();
  for (let i = arr.length - 1;i >= 0; i--) {
    const finalizer = arr[i];
    if (self.strategy === "sequential") {
      exits.push(yield* exit(runFinalizer(finalizer, exit_)));
    } else {
      fibers.push(forkUnsafe(parent, runFinalizer(finalizer, exit_), true, true, "inherit"));
    }
  }
  if (fibers.length > 0) {
    exits = yield* fiberAwaitAll(fibers);
  }
  return yield* exitAsVoidAll(exits);
});
var scopeAddFinalizerExit = (scope, finalizer) => {
  return suspend(() => {
    if (scope.state._tag === "Closed") {
      return finalizer(scope.state.exit);
    }
    scopeAddFinalizerUnsafe(scope, {}, finalizer);
    return void_;
  });
};
var scopeAddFinalizer = (scope, finalizer) => scopeAddFinalizerExit(scope, constant(finalizer));
var scopeAddFinalizerUnsafe = (scope, key, finalizer) => {
  if (scope.state._tag === "Empty") {
    scope.state = {
      _tag: "Open",
      finalizerKey: key,
      finalizer,
      finalizers: undefined
    };
  } else if (scope.state._tag === "Open") {
    const state = scope.state;
    if (state.finalizer !== undefined) {
      state.finalizers = new Map([[state.finalizerKey, state.finalizer]]);
      state.finalizerKey = undefined;
      state.finalizer = undefined;
      state.finalizers.set(key, finalizer);
    } else {
      state.finalizers.set(key, finalizer);
    }
  }
};
var scopeRemoveFinalizerUnsafe = (scope, key) => {
  if (scope.state._tag !== "Open")
    return;
  const state = scope.state;
  if (state.finalizerKey === key) {
    scope.state = constScopeEmpty;
  } else if (state.finalizers !== undefined) {
    state.finalizers.delete(key);
    if (state.finalizers.size === 0) {
      scope.state = constScopeEmpty;
    }
  }
};
var scopeMakeUnsafe = (finalizerStrategy) => makeScope(finalizerStrategy, undefined);
var makeScope = (finalizerStrategy = "sequential", parent) => ({
  [ScopeCloseableTypeId]: ScopeCloseableTypeId,
  [ScopeTypeId]: ScopeTypeId,
  strategy: finalizerStrategy,
  parent,
  state: constScopeEmpty
});
var constScopeEmpty = {
  _tag: "Empty"
};
var OnExitImpl = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "OnExit",
    [evaluate](fiber) {
      fiber._stack.push(this);
      return this.effect;
    },
    [contAll](fiber) {
      if (fiber.interruptible && this.interruptible !== true) {
        fiber._stack.push(setInterruptibleTrue);
        fiber.interruptible = false;
      }
    },
    [contA](value, _, exit) {
      exit ??= exitSucceed(value);
      let eff;
      try {
        eff = this.onExit(exit);
      } catch (defect) {
        eff = exitDie(defect);
      }
      return eff ? flatMap(eff, (_) => exit) : exit;
    },
    [contE](cause, _, exit) {
      exit ??= exitFailCause(cause);
      let eff;
      try {
        eff = this.onExit(exit);
      } catch (defect) {
        eff = exitDie(defect);
      }
      return eff ? flatMap(combineFinalizerCause(exit, eff), (_) => exit) : exit;
    }
  });
  const OnExitImpl = function(effect, onExit, interruptible) {
    this.effect = effect;
    this.onExit = onExit;
    this.interruptible = interruptible;
  };
  OnExitImpl.prototype = Proto;
  return OnExitImpl;
}();
var onExitPrimitive = (effect, onExit, interruptible) => new OnExitImpl(effect, onExit, interruptible);
var onExitUnsafe = (fiber, f) => {
  fiber._stack.push(new OnExitImpl(undefined, f, undefined));
};
var onExit = /* @__PURE__ */ dual(2, onExitPrimitive);
var ensuring = /* @__PURE__ */ dual(2, (self, finalizer) => onExit(self, (_) => finalizer));
var acquireUseRelease = (acquire, use, release) => uninterruptibleMask((restore) => flatMap(acquire, (a) => onExitPrimitive(suspend(() => restore(use(a))), (exit) => release(a, exit), true)));
var uninterruptible = (self) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return self;
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return self;
});
var setInterruptible = /* @__PURE__ */ makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args];
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause);
    }
  }
});
var setInterruptibleTrue = /* @__PURE__ */ setInterruptible(true);
var setInterruptibleFalse = /* @__PURE__ */ setInterruptible(false);
var setFiberInterruptible = (fiber) => {
  fiber.interruptible = true;
  fiber._stack.push(setInterruptibleFalse);
  if (fiber._interruptedCause)
    return failCause(fiber._interruptedCause);
};
var fiberEnterUninterruptibleUnsafe = (fiber) => {
  const impl = fiber;
  if (!impl.interruptible)
    return;
  impl.interruptible = false;
  impl._stack.push(setInterruptibleTrue);
};
var interruptible = (self) => withFiber((fiber) => {
  if (fiber.interruptible)
    return self;
  return setFiberInterruptible(fiber) ?? self;
});
var uninterruptibleMask = (f) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return f(identity);
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return f(interruptible);
});
var whileLoop = /* @__PURE__ */ makePrimitive({
  op: "While",
  [contA](value, fiber) {
    this[args].step(value);
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  }
});
var forEach = /* @__PURE__ */ dual((args) => typeof args[1] === "function", (iterable, f, options) => suspend(() => {
  const concurrency = resolveConcurrency(options?.concurrency);
  if (concurrency === 1) {
    return forEachSequential(iterable, f, options);
  }
  const items = fromIterable(iterable);
  let length = items.length;
  if (length === 0) {
    return options?.discard ? void_ : succeed3([]);
  }
  const out = options?.discard ? undefined : new Array(length);
  const eff = forEachConcurrent({
    f,
    out
  }, items, {
    concurrency
  });
  return eff ? as(eff, out) : succeed3(out);
}));
var forEachSequential = (iterable, f, options) => suspend(() => {
  const out = options?.discard ? undefined : [];
  const iterator = iterable[Symbol.iterator]();
  let state = iterator.next();
  let index = 0;
  return as(whileLoop({
    while: () => !state.done,
    body: () => f(state.value, index++),
    step: (b) => {
      if (out)
        out.push(b);
      state = iterator.next();
    }
  }), out);
});
var resolveConcurrency = (concurrency) => concurrency === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrency ?? 1);
var iterateEager = () => (options) => {
  const onItem = options.onItem;
  const step = options.step;
  const resumeSequential = (state, items, index, end, effect) => flatMap(exit(effect), (itemExit) => step(state, items[index], itemExit, index) ?? runSequential(state, items, index + 1, end) ?? void_);
  const runSequential = (state, items, index = 0, end = items.length) => {
    for (;index < end; index++) {
      const item = items[index];
      const effect = onItem(state, item, index);
      if (!effectIsExit(effect)) {
        return resumeSequential(state, items, index, end, effect);
      }
      const terminal = step(state, item, effect, index);
      if (terminal)
        return terminal._tag === "Failure" ? terminal : undefined;
    }
  };
  return runSequential;
};
var iterateConcurrentImpl = (options) => {
  const onItem = options.onItem;
  const step = options.step;
  return (state, items, opts) => {
    let index = 0;
    const end = opts.end ?? items.length;
    const concurrency = opts.concurrency;
    let done = false;
    let parentFiber;
    let fibers;
    let resume;
    let terminal;
    let effect;
    const failDefect = (error) => {
      const defect = exitDie(error);
      terminal = defect;
      done = true;
      return fibers && fibers.size > 0 ? flatMap(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => terminal ?? defect) : defect;
    };
    const go = () => {
      let paused = false;
      for (;!terminal && index < end; index++) {
        const item = items[index];
        const eff = effect ?? onItem(state, item, index);
        if (effectIsExit(eff)) {
          terminal = step(state, item, eff, index);
          if (terminal)
            break;
        } else if (!parentFiber) {
          return callback((cb) => {
            parentFiber = getCurrentFiber();
            fibers = new Set;
            effect = eff;
            resume = cb;
            let result;
            try {
              result = go();
            } catch (error) {
              return cb(failDefect(error));
            }
            if (result)
              return cb(result);
            return suspend(() => {
              terminal ??= exitVoid;
              return flatMap(fibers ? fiberInterruptAll(fibers) : void_, () => terminal?._tag === "Failure" ? terminal : void_);
            });
          });
        } else {
          effect = undefined;
          const fiber = forkUnsafe(parentFiber, eff, true, true, "inherit");
          if (fiber._exit) {
            terminal = step(state, item, fiber._exit, index);
            if (terminal)
              break;
            continue;
          }
          fibers.add(fiber);
          const currentIndex = index;
          fiber.addObserver((exit) => {
            fibers.delete(fiber);
            try {
              if (terminal) {
                if (exit._tag === "Failure") {
                  const reasons = exit.cause.reasons.filter((reason) => reason._tag !== "Interrupt");
                  if (reasons.length > 0) {
                    const cause = causeFromReasons(reasons);
                    terminal = exitFailCause(terminal._tag === "Failure" ? causeCombine(terminal.cause, cause) : cause);
                  }
                }
              } else {
                const result = step(state, item, exit, currentIndex);
                if (result) {
                  terminal = result;
                  go();
                }
              }
              if (paused) {
                const eff = go();
                if (eff)
                  resume(eff);
              } else if (done && fibers.size === 0) {
                resume(terminal ?? void_);
              }
            } catch (error) {
              resume(failDefect(error));
            }
          });
          if (fibers.size < concurrency)
            continue;
          paused = true;
          index++;
          return;
        }
      }
      done = true;
      if (terminal) {
        if (fibers && fibers.size > 0) {
          const annotations = fiberStackAnnotations(parentFiber);
          fibers.forEach((f) => f.interruptUnsafe(parentFiber.id, annotations));
          return;
        }
        if (resume || terminal._tag === "Failure") {
          return terminal;
        }
      } else if (resume) {
        if (!fibers) {
          return exitVoid;
        } else if (fibers.size === 0) {
          resume(void_);
        }
      }
    };
    return go();
  };
};
var iterateConcurrent = () => (options) => iterateConcurrentImpl(options);
var forEachConcurrent = /* @__PURE__ */ iterateConcurrentImpl({
  onItem(state, item, index) {
    return state.f(item, index);
  },
  step(state, _, exit, index) {
    if (exit._tag === "Failure")
      return exit;
    else if (state.out) {
      state.out[index] = exit.value;
    }
  }
});
var filterOrElse = /* @__PURE__ */ dual(3, (self, predicate, orElse) => flatMap(self, (a) => predicate(a) ? succeed3(a) : orElse(a)));
var forkUnsafe = (parent, effect, immediate = false, daemon = false, uninterruptible = false) => {
  const parentRuntime = parent;
  const interruptible = uninterruptible === "inherit" ? parentRuntime.interruptible : !uninterruptible;
  const child = new FiberImpl(parentRuntime.context, interruptible);
  if (!daemon) {
    parentRuntime.children().add(child);
    child._parent = parentRuntime;
  }
  if (immediate) {
    child.evaluate(effect);
  } else {
    child._asyncContext = captureAsyncContext();
    parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect), 0);
  }
  return child;
};
var forkDetach = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => withFiber((fiber) => succeed3(forkUnsafe(fiber, self, options?.startImmediately, true, options?.uninterruptible))));
var runForkWith = (context) => (effect, options) => {
  const fiber = new FiberImpl(options?.scheduler ? add(context, Scheduler, options.scheduler) : context, options?.uninterruptible !== true);
  fiber.evaluate(effect);
  if (fiber._exit)
    return fiber;
  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe();
    } else {
      const abort = () => fiber.interruptUnsafe();
      options.signal.addEventListener("abort", abort, {
        once: true
      });
      fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
    }
  }
  if (options?.onFiberStart) {
    options.onFiberStart(fiber);
  }
  return fiber;
};
var runPromiseExitWith = (context) => {
  const runFork = runForkWith(context);
  return (effect, options) => {
    const fiber = runFork(effect, options);
    return new Promise((resolve) => {
      fiber.addObserver((exit) => resolve(exit));
    });
  };
};
var runPromiseWith = (context) => {
  const runPromiseExit = runPromiseExitWith(context);
  return (effect, options) => runPromiseExit(effect, options).then((exit) => {
    if (exit._tag === "Failure") {
      throw causeSquash(exit.cause);
    }
    return exit.value;
  });
};
var runPromise = /* @__PURE__ */ runPromiseWith(/* @__PURE__ */ empty());
var runSyncExitWith = (context) => {
  const runFork = runForkWith(context);
  return (effect) => {
    if (effectIsExit(effect))
      return effect;
    const scheduler = new MixedScheduler("sync");
    const fiber = runFork(effect, {
      scheduler
    });
    fiber._dispatcher?.flush();
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber));
  };
};
var runSyncExit = /* @__PURE__ */ runSyncExitWith(/* @__PURE__ */ empty());
var ClockRef = /* @__PURE__ */ Reference("effect/Clock", {
  defaultValue: () => new ClockImpl
});
var MAX_TIMER_MILLIS = 2 ** 31 - 1;

class ClockImpl {
  currentTimeMillisUnsafe() {
    return Date.now();
  }
  currentTimeMillis = /* @__PURE__ */ sync(() => this.currentTimeMillisUnsafe());
  currentTimeNanosUnsafe() {
    return wallTimeNanos();
  }
  currentTimeNanos = /* @__PURE__ */ sync(() => this.currentTimeNanosUnsafe());
  monotonicTimeNanosUnsafe() {
    return monotonicNowNanos();
  }
  monotonicTimeNanos = /* @__PURE__ */ sync(() => this.monotonicTimeNanosUnsafe());
  sleep(duration) {
    return this.sleepMillis(toMillis(duration));
  }
  sleepMillis(millis) {
    if (millis <= 0)
      return yieldNow;
    else if (!Number.isFinite(millis))
      return never;
    return callback((resume) => {
      const continuation = millis > MAX_TIMER_MILLIS ? this.sleepMillis(millis - MAX_TIMER_MILLIS) : void_;
      const handle = setTimeout(() => resume(continuation), Math.min(millis, MAX_TIMER_MILLIS));
      return sync(() => clearTimeout(handle));
    });
  }
}
var nanosPerMilli = /* @__PURE__ */ BigInt(1e6);
var monotonicNowNanos = /* @__PURE__ */ function() {
  const processHrtime = globalThis.process?.hrtime;
  if (typeof processHrtime?.bigint === "function") {
    return () => processHrtime.bigint();
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return () => BigInt(Math.round(performance.now() * 1e6));
  }
  let previous = /* @__PURE__ */ BigInt(0);
  return () => {
    const current = BigInt(Date.now()) * nanosPerMilli;
    if (current > previous) {
      previous = current;
    }
    return previous;
  };
}();
var wallTimeNanos = /* @__PURE__ */ function() {
  const reanchorThresholdNanos = /* @__PURE__ */ BigInt(1e9);
  let origin;
  return () => {
    const monotonic = monotonicNowNanos();
    const wall = BigInt(Date.now()) * nanosPerMilli;
    if (origin === undefined) {
      origin = wall - monotonic;
    } else {
      const projected = origin + monotonic;
      const skew = wall > projected ? wall - projected : projected - wall;
      if (skew > reanchorThresholdNanos) {
        origin = wall - monotonic;
      }
    }
    return origin + monotonic;
  };
}();
var clockWith = (f) => withFiber((fiber) => f(fiber.getRef(ClockRef)));
var sleep = (duration) => clockWith((clock) => clock.sleep(fromInputUnsafe(duration)));
var currentTimeMillis = /* @__PURE__ */ clockWith((clock) => clock.currentTimeMillis);
var TimeoutErrorTypeId = "~effect/Cause/TimeoutError";
class TimeoutError extends (/* @__PURE__ */ TaggedError("TimeoutError")) {
  [TimeoutErrorTypeId] = TimeoutErrorTypeId;
  constructor(message) {
    super({
      message
    });
  }
}
var AsyncFiberErrorTypeId = "~effect/Cause/AsyncFiberError";
class AsyncFiberError extends (/* @__PURE__ */ TaggedError("AsyncFiberError")) {
  [AsyncFiberErrorTypeId] = AsyncFiberErrorTypeId;
  constructor(fiber) {
    super({
      message: "An asynchronous Effect was executed with Effect.runSync",
      fiber
    });
  }
}
var UnknownErrorTypeId = "~effect/Cause/UnknownError";
class UnknownError extends (/* @__PURE__ */ TaggedError("UnknownError")) {
  [UnknownErrorTypeId] = UnknownErrorTypeId;
  constructor(cause, message) {
    super({
      message,
      cause
    });
  }
}
var ConsoleRef = /* @__PURE__ */ Reference("effect/Console", {
  defaultValue: () => globalThis.console
});
var logLevelToOrder = (level) => {
  switch (level) {
    case "All":
      return Number.MIN_SAFE_INTEGER;
    case "Fatal":
      return 50000;
    case "Error":
      return 40000;
    case "Warn":
      return 30000;
    case "Info":
      return 20000;
    case "Debug":
      return 1e4;
    case "Trace":
      return 0;
    case "None":
      return Number.MAX_SAFE_INTEGER;
  }
};
var LogLevelOrder = /* @__PURE__ */ mapInput(Number2, logLevelToOrder);
var isLogLevelGreaterThan = /* @__PURE__ */ isGreaterThan(LogLevelOrder);
var CurrentLoggers = /* @__PURE__ */ Reference("effect/Logger/CurrentLoggers", {
  defaultValue: () => new Set([defaultLogger, tracerLogger])
});
var LogToStderr = /* @__PURE__ */ Reference("effect/Logger/LogToStderr", {
  defaultValue: constFalse
});
var LoggerTypeId = "~effect/Logger";
var LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var loggerMake = (log) => {
  const self = Object.create(LoggerProto);
  self.log = log;
  return self;
};
var formatLabel = (key) => key.replace(/[\s="]/g, "_");
var formatLogSpan = (self, now) => {
  const label = formatLabel(self[0]);
  return `${label}=${now - self[1]}ms`;
};
var logWithLevel = (level) => (...message) => {
  let cause = undefined;
  for (let i = 0, len = message.length;i < len; i++) {
    const msg = message[i];
    if (isCause(msg)) {
      if (cause) {
        message.splice(i, 1);
      } else {
        message = message.slice(0, i).concat(message.slice(i + 1));
      }
      cause = cause ? causeFromReasons(cause.reasons.concat(msg.reasons)) : msg;
      i--;
    }
  }
  if (cause === undefined) {
    cause = causeEmpty;
  }
  return withFiber((fiber) => {
    const logLevel = level ?? fiber.cache.logLevel;
    if (isLogLevelGreaterThan(fiber.cache.minimumLogLevel, logLevel)) {
      return void_;
    }
    const clock = fiber.getRef(ClockRef);
    const loggers = fiber.getRef(CurrentLoggers);
    if (loggers.size > 0) {
      const date = new Date(clock.currentTimeMillisUnsafe());
      for (const logger of loggers) {
        logger.log({
          cause,
          fiber,
          date,
          logLevel,
          message
        });
      }
    }
    return void_;
  });
};
var colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101"
};
var logLevelColors = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warn: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black]
};
var defaultDateFormat = (date) => `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
var defaultLogger = /* @__PURE__ */ loggerMake(({
  cause,
  date,
  fiber,
  logLevel,
  message
}) => {
  const message_ = Array.isArray(message) ? message.slice() : [message];
  if (cause.reasons.length > 0) {
    message_.push(causePretty(cause));
  }
  const now = date.getTime();
  const spans = fiber.getRef(CurrentLogSpans);
  let spanString = "";
  for (const span of spans) {
    spanString += ` ${formatLogSpan(span, now)}`;
  }
  const annotations = fiber.getRef(CurrentLogAnnotations);
  if (Object.keys(annotations).length > 0) {
    message_.push(annotations);
  }
  const console = fiber.getRef(ConsoleRef);
  const log = fiber.getRef(LogToStderr) ? console.error : console.log;
  log(`[${defaultDateFormat(date)}] ${logLevel.toUpperCase()} (#${fiber.id})${spanString}:`, ...message_);
});
var tracerLogger = /* @__PURE__ */ loggerMake(({
  cause,
  fiber,
  logLevel,
  message
}) => {
  const clock = fiber.getRef(ClockRef);
  const annotations = fiber.getRef(CurrentLogAnnotations);
  const span = fiber.cache.span;
  if (span === undefined || span._tag === "ExternalSpan")
    return;
  const attributes = {};
  for (const [key, value] of Object.entries(annotations)) {
    assignProperty(attributes, key, value);
  }
  attributes["effect.fiberId"] = fiber.id;
  attributes["effect.logLevel"] = logLevel.toUpperCase();
  if (cause.reasons.length > 0) {
    attributes["effect.cause"] = causePretty(cause);
  }
  span.event(toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message), clock.currentTimeNanosUnsafe(), attributes);
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Cause.js
var isFailReason2 = isFailReason;
var fromReasons = causeFromReasons;
var die2 = causeDie;
var map3 = causeMap;
var pretty = causePretty;
var isDone2 = isDone;
var done2 = done;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Exit.js
var succeed4 = exitSucceed;
var failCause2 = exitFailCause;
var fail4 = exitFail;
var void_2 = exitVoid;
var isSuccess3 = exitIsSuccess;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Scope.js
var makeUnsafe2 = scopeMakeUnsafe;
var addFinalizer = scopeAddFinalizer;
var close = scopeClose;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Clock.js
var currentTimeMillis2 = currentTimeMillis;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/random.js
var Random = /* @__PURE__ */ Reference("effect/Random", {
  defaultValue: () => ({
    nextIntUnsafe() {
      return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - Number.MIN_SAFE_INTEGER + 1)) + Number.MIN_SAFE_INTEGER;
    },
    nextDoubleUnsafe() {
      return Math.random();
    }
  })
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Pull.js
var catchDone = /* @__PURE__ */ dual(2, (effect, f) => catchCauseFilter(effect, filterDoneLeftover, (l) => f(l)));
var isDoneFailure = (failure) => failure._tag === "Fail" && isDone2(failure.error);
var filterDone = (cause) => {
  let done;
  let hasFailure = false;
  for (const reason of cause.reasons) {
    if (isDoneFailure(reason)) {
      done ??= reason.error;
    } else if (reason._tag !== "Interrupt") {
      hasFailure = true;
    }
  }
  if (done === undefined)
    return fail2(cause);
  return hasFailure ? fail2(fromReasons(cause.reasons.filter((reason) => !isDoneFailure(reason)))) : succeed2(done);
};
var filterDoneLeftover = (cause) => {
  const done = filterDone(cause);
  return isFailure2(done) ? done : succeed2(done.success.value);
};
var matchEffect2 = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onSuccess: options.onSuccess,
  onFailure: (cause) => {
    const halt = filterDone(cause);
    return !isFailure2(halt) ? options.onDone(halt.success.value) : options.onFailure(halt.failure);
  }
}));

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Schedule.js
var TypeId5 = "~effect/Schedule";
var CurrentMetadata = /* @__PURE__ */ Reference("effect/Schedule/CurrentMetadata", {
  defaultValue: /* @__PURE__ */ constant({
    input: undefined,
    output: undefined,
    duration: zero,
    attempt: 0,
    start: 0,
    now: 0,
    elapsed: 0,
    elapsedSincePrevious: 0
  })
});
var ScheduleProto = {
  [TypeId5]: {
    _Out: identity,
    _In: identity,
    _Env: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var isSchedule = (u) => hasProperty(u, TypeId5);
var fromStep = (step) => {
  const self = Object.create(ScheduleProto);
  self.step = step;
  return self;
};
var metadataFn = () => {
  let n = 0;
  let previous;
  let start;
  return (now, input) => {
    if (start === undefined)
      start = now;
    const elapsed = now - start;
    const elapsedSincePrevious = previous === undefined ? 0 : now - previous;
    previous = now;
    return {
      input,
      attempt: ++n,
      start,
      now,
      elapsed,
      elapsedSincePrevious
    };
  };
};
var fromStepWithMetadata = (step) => fromStep(map2(step, (f) => {
  const meta = metadataFn();
  return (now, input) => f(meta(now, input));
}));
var toStep = (schedule) => catchCause(schedule.step, (cause) => succeed3(() => failCause(cause)));
var toStepWithMetadata = (schedule) => clockWith((clock) => map2(toStep(schedule), (step) => {
  const metaFn = metadataFn();
  return (input) => suspend(() => {
    const now = clock.currentTimeMillisUnsafe();
    return flatMap(step(now, input), ([output, duration]) => {
      const meta = metaFn(now, input);
      meta.output = output;
      meta.duration = duration;
      return as(sleep(duration), meta);
    });
  });
}));
var exponential = (base, factor = 2) => {
  const baseMillis = toMillis(fromInputUnsafe(base));
  return fromStepWithMetadata(succeed3((meta) => {
    const duration = millis(baseMillis * Math.pow(factor, meta.attempt - 1));
    return succeed3([duration, duration]);
  }));
};
var passthrough = (self) => fromStep(map2(toStep(self), (step) => (now, input) => matchEffect2(step(now, input), {
  onSuccess: (result) => succeed3([input, result[1]]),
  onFailure: failCause,
  onDone: () => done2(input)
})));
var spaced = (duration) => {
  const decoded = fromInputUnsafe(duration);
  return fromStepWithMetadata(succeed3((meta) => succeed3([meta.attempt - 1, decoded])));
};
var while_ = /* @__PURE__ */ dual(2, (self, predicate) => fromStep(map2(toStep(self), (step) => {
  const meta = metadataFn();
  return (now, input) => flatMap(step(now, input), (result) => {
    const [output, duration] = result;
    const eff = predicate({
      ...meta(now, input),
      output,
      duration
    });
    return flatMap(isEffect(eff) ? eff : succeed3(eff), (check) => check ? succeed3(result) : done2(output));
  });
})));
var forever2 = /* @__PURE__ */ spaced(zero);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schedule.js
var findErrorOnly = (cause) => cause.reasons.every(isFailReason) ? findError(cause) : fail2(cause);
var retryOrElse = /* @__PURE__ */ dual(3, (self, policy, orElse) => flatMap(toStepWithMetadata(policy), (step) => {
  let meta = CurrentMetadata.defaultValue();
  let lastError;
  const loop = catchCauseFilter(suspend(() => provideService(self, CurrentMetadata, meta)), findErrorOnly, (error) => {
    lastError = error;
    return flatMap(step(error), (meta_) => {
      meta = meta_;
      return loop;
    });
  });
  return catchDone(loop, (out) => internalCall(() => orElse(lastError, out)));
}));
var retry = /* @__PURE__ */ dual(2, (self, options) => {
  const schedule = typeof options === "function" ? options(identity) : isSchedule(options) ? options : buildFromOptions(options);
  return retryOrElse(self, schedule, fail3);
});
var passthroughForever = /* @__PURE__ */ passthrough(forever2);
var buildFromOptions = (options) => {
  let schedule = options.schedule ? passthrough(options.schedule) : passthroughForever;
  if (options.while) {
    schedule = while_(schedule, ({
      input
    }) => {
      const applied = options.while(input);
      return isEffect(applied) ? applied : succeed3(applied);
    });
  }
  if (options.until) {
    schedule = while_(schedule, ({
      input
    }) => {
      const applied = options.until(input);
      return isEffect(applied) ? map2(applied, (b) => !b) : succeed3(!applied);
    });
  }
  if (options.times !== undefined) {
    schedule = while_(schedule, ({
      attempt
    }) => succeed3(attempt <= options.times));
  }
  return schedule;
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Effect.js
var forEach2 = forEach;
var whileLoop2 = whileLoop;
var promise2 = promise;
var tryPromise2 = tryPromise;
var succeed5 = succeed3;
var suspend2 = suspend;
var sync2 = sync;
var void_3 = void_;
var gen2 = gen;
var fail5 = fail3;
var failCause3 = failCause;
var failCauseSync2 = failCauseSync;
var die3 = die;
var try_2 = try_;
var withFiber2 = withFiber;
var fromResult2 = fromResult;
var flatMap2 = flatMap;
var andThen2 = andThen;
var option2 = option;
var exit2 = exit;
var map4 = map2;
var as2 = as;
var asVoid2 = asVoid;
var catch_2 = catch_;
var catchTag2 = catchTag;
var catchCause2 = catchCause;
var mapError2 = mapError;
var orDie2 = orDie;
var tapError2 = tapError;
var retry2 = retry;
var ignore2 = ignore;
var orElseSucceed2 = orElseSucceed;
var timeout2 = timeout;
var timeoutOption2 = timeoutOption;
var filterOrFail2 = filterOrFail;
var matchCauseEffect2 = matchCauseEffect;
var acquireUseRelease2 = acquireUseRelease;
var ensuring2 = ensuring;
var onExit2 = onExit;
var forever3 = forever;
var forkDetach2 = forkDetach;
var runPromise2 = runPromise;
var runSyncExit2 = runSyncExit;
var mapEager2 = mapEager;
var mapErrorEager2 = mapErrorEager;
var flatMapEager2 = flatMapEager;
var fnUntracedEager2 = fnUntracedEager;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Random.js
var Random2 = Random;
var randomWith = (f) => withFiber2((fiber) => succeed5(f(fiber.getRef(Random2))));
var nextIntBetween = (min, max, options) => {
  const extra = options?.halfOpen === true ? 0 : 1;
  return randomWith((r) => {
    const minInt = Math.ceil(min);
    const maxInt = Math.floor(max);
    return Math.floor(r.nextDoubleUnsafe() * (maxInt - minInt + extra)) + minInt;
  });
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/encoding/Base64.js
var encode = (input) => encodeBytes(typeof input === "string" ? encoder.encode(input) : input);
var decode = (str) => {
  const stripped = stripCrlf(str);
  const length = stripped.length;
  if (length % 4 !== 0) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Length must be a multiple of 4, but is ${length}`
    }));
  }
  const index = stripped.indexOf("=");
  if (index !== -1 && (index < length - 2 || index === length - 2 && stripped[length - 1] !== "=")) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: "Found a '=' character, but it is not at the end"
    }));
  }
  try {
    const missingOctets = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
    const result = new Uint8Array(3 * (length / 4) - missingOctets);
    for (let i = 0, j = 0;i < length; i += 4, j += 3) {
      const buffer = getCode(stripped.charCodeAt(i)) << 18 | getCode(stripped.charCodeAt(i + 1)) << 12 | getCode(stripped.charCodeAt(i + 2)) << 6 | getCode(stripped.charCodeAt(i + 3));
      result[j] = buffer >> 16;
      result[j + 1] = buffer >> 8 & 255;
      result[j + 2] = buffer & 255;
    }
    return succeed2(result);
  } catch (cause) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: cause instanceof Error ? cause.message : "Invalid input"
    }));
  }
};
var encodeBytes = (bytes) => {
  const length = bytes.length;
  let result = "";
  let i;
  for (i = 2;i < length; i += 3) {
    result += alphabet[bytes[i - 2] >> 2];
    result += alphabet[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += alphabet[(bytes[i - 1] & 15) << 2 | bytes[i] >> 6];
    result += alphabet[bytes[i] & 63];
  }
  if (i === length + 1) {
    result += alphabet[bytes[i - 2] >> 2];
    result += alphabet[(bytes[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === length) {
    result += alphabet[bytes[i - 2] >> 2];
    result += alphabet[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += alphabet[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
};
var encoder = /* @__PURE__ */ new TextEncoder;
var stripCrlf = (str) => str.replace(/[\n\r]/g, "");
var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var codes = /* @__PURE__ */ new Uint8Array(123).fill(255);
for (let i = 0;i < alphabet.length; i++)
  codes[/* @__PURE__ */ alphabet.charCodeAt(i)] = i;
codes[61] = 0;
var getCode = (charCode) => {
  if (charCode >= codes.length || codes[charCode] === 255) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  return codes[charCode];
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/annotations.js
function resolve(ast) {
  return ast.checks ? ast.checks[ast.checks.length - 1].annotations : ast.annotations;
}
var STRUCTURAL_ANNOTATION_KEY = "~structural";
var SENTINELS_ANNOTATION_KEY = "~sentinels";
var CONSTRUCTOR_ANNOTATION_KEY = "~constructor";
var getExpected = /* @__PURE__ */ memoize((ast) => {
  const identifier = resolve(ast)?.identifier;
  if (typeof identifier === "string")
    return identifier;
  return ast.getExpected(getExpected);
});

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/parser.js
var missing = /* @__PURE__ */ Symbol();
var succeed6 = succeed4;
var missingExit = /* @__PURE__ */ succeed6(missing);
var sameExit = /* @__PURE__ */ succeed6(missing);
var toOption = (value) => value === missing ? none2() : some2(value);
var fromOptionExit = (option) => option._tag === "None" ? missingExit : succeed6(option.value);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/SchemaIssue.js
var TypeId6 = "~effect/SchemaIssue/Issue";
function isIssue(u) {
  return hasProperty(u, TypeId6) && u[TypeId6] === TypeId6;
}
function hasInput(issue) {
  return Object.hasOwn(issue, "input");
}

class IssueNodeImpl {
  [TypeId6] = TypeId6;
  constructor(input, options) {
    if (options?.reportInput === true && input !== missing) {
      this.input = input;
    }
  }
}
var Filter = class extends IssueNodeImpl {
  _tag = "Filter";
  filter;
  issue;
  constructor(filter, issue, input, options) {
    super(input, options);
    this.filter = filter;
    this.issue = issue;
  }
};
var Encoding = class extends IssueNodeImpl {
  _tag = "Encoding";
  ast;
  issue;
  constructor(ast, issue, input, options) {
    super(input, options);
    this.ast = ast;
    this.issue = issue;
  }
};
var Pointer = class extends IssueNodeImpl {
  _tag = "Pointer";
  path;
  issue;
  constructor(path, issue) {
    super();
    this.path = path;
    this.issue = issue;
  }
};
var MissingKey = class extends IssueNodeImpl {
  _tag = "MissingKey";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
};
var UnexpectedKey = class extends IssueNodeImpl {
  _tag = "UnexpectedKey";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
};
var Composite = class extends IssueNodeImpl {
  _tag = "Composite";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
};
var InvalidType = class extends IssueNodeImpl {
  _tag = "InvalidType";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
};
var InvalidValue = class extends IssueNodeImpl {
  _tag = "InvalidValue";
  annotations;
  constructor(annotations, input, options) {
    super(input, options);
    this.annotations = annotations;
  }
};
var AnyOf = class extends IssueNodeImpl {
  _tag = "AnyOf";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
};
var OneOf = class extends IssueNodeImpl {
  _tag = "OneOf";
  ast;
  successes;
  constructor(ast, successes, input, options) {
    super(input, options);
    this.ast = ast;
    this.successes = successes;
  }
};
function makeFilterIssue(entry, input, options) {
  if (isIssue(entry)) {
    return entry;
  }
  if (typeof entry === "string") {
    return new InvalidValue({
      message: entry
    }, input, options);
  }
  const inner = typeof entry.issue === "string" ? new InvalidValue({
    message: entry.issue
  }, input, options) : entry.issue;
  return new Pointer(entry.path, inner);
}
function makeSingle(out, input, options) {
  if (out === undefined) {
    return;
  }
  if (typeof out === "boolean") {
    return out ? undefined : new InvalidValue(undefined, input, options);
  }
  return makeFilterIssue(out, input, options);
}
function normalizeFilterOutput(ast, out, input, options) {
  if (Array.isArray(out)) {
    if (!isReadonlyArrayNonEmpty(out)) {
      return;
    }
    return out.length === 1 ? makeFilterIssue(out[0], input, options) : new Composite(ast, map(out, (entry) => makeFilterIssue(entry, input, options)), input, options);
  }
  return makeSingle(out, input, options);
}
var defaultLeafHook = (issue) => {
  const message = findMessage(issue);
  if (message !== undefined)
    return message;
  switch (issue._tag) {
    case "InvalidType":
      return getExpectedMessage(getExpected(issue.ast), issue);
    case "InvalidValue": {
      const expected = findExpected(issue);
      if (expected !== undefined)
        return getExpectedMessage(expected, issue);
      const input = formatInput(issue);
      return input === undefined ? "Expected a valid value" : `Invalid data ${input}`;
    }
    case "MissingKey":
      return "Missing key";
    case "UnexpectedKey": {
      const input = formatInput(issue);
      return input === undefined ? "Expected no excess property" : `Unexpected key with value ${input}`;
    }
    case "Forbidden":
      return "Forbidden operation";
    case "OneOf": {
      const input = formatInput(issue);
      return input === undefined ? "Expected exactly one member to match" : `Expected exactly one member to match the input ${input}`;
    }
  }
};
var defaultCheckHook = (issue) => findMessage(issue.issue) ?? findMessage(issue);
function formatInput(issue) {
  return hasInput(issue) ? format(issue.input) : undefined;
}
function findExpected(issue) {
  const expected = issue.annotations?.expected;
  return typeof expected === "string" ? expected : undefined;
}
function getExpectedMessage(expected, issue) {
  const input = formatInput(issue);
  return input === undefined ? `Expected ${expected}` : `Expected ${expected}, got ${input}`;
}
function formatCheck(check) {
  const expected = check.annotations?.expected;
  if (typeof expected === "string")
    return expected;
  switch (check._tag) {
    case "Filter":
      return "<filter>";
    case "FilterGroup":
      return check.checks.map((check) => formatCheck(check)).join(" & ");
  }
}
function makeFormatterDefault() {
  return (issue) => formatIssue(issue, "");
}
var defaultFormatter = /* @__PURE__ */ makeFormatterDefault();
function formatIssue(issue, path) {
  let message;
  switch (issue._tag) {
    case "Filter": {
      const annotated = defaultCheckHook(issue);
      if (annotated !== undefined) {
        message = annotated;
      } else {
        if (issue.issue._tag !== "InvalidValue") {
          return formatIssue(issue.issue, path);
        }
        const expected = findExpected(issue.issue);
        message = expected === undefined ? getExpectedMessage(formatCheck(issue.filter), issue) : getExpectedMessage(expected, issue.issue);
      }
      break;
    }
    case "Encoding":
      return formatIssue(issue.issue, path);
    case "Pointer":
      return formatIssue(issue.issue, path + formatPath(issue.path));
    case "Composite":
    case "AnyOf": {
      if (issue._tag === "Composite" || issue.issues.length > 0) {
        return issue.issues.map((issue) => formatIssue(issue, path)).join(`
`);
      }
      message = findMessage(issue) ?? getExpectedMessage(getExpected(issue.ast), issue);
      break;
    }
    default:
      message = defaultLeafHook(issue);
      break;
  }
  return path ? `${message}
  at ${path}` : message;
}
function findMessage(issue) {
  if (issue._tag === "Pointer")
    return;
  if (issue._tag === "Encoding")
    return findMessage(issue.issue);
  const annotations = issue._tag === "Filter" ? issue.filter.annotations : ("annotations" in issue) ? issue.annotations : issue.ast.annotations;
  const message = annotations?.[issue._tag === "MissingKey" ? "messageMissingKey" : issue._tag === "UnexpectedKey" ? "messageUnexpectedKey" : "message"];
  if (typeof message === "string")
    return message;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/cause.js
function getSchemaIssue(cause) {
  let issue;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isIssue(reason.error)) {
      return;
    }
    issue ??= reason.error;
  }
  return issue;
}
function getSchemaIssueOrThrow(cause, message) {
  const issue = getSchemaIssue(cause);
  if (issue === undefined) {
    throw new Error(message, {
      cause
    });
  }
  return issue;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/SchemaGetter.js
var makeGetter = (fields) => Object.assign(Object.create(Prototype), fields);
var passthrough_ = /* @__PURE__ */ makeGetter({
  _tag: "Passthrough"
});
function passthrough2() {
  return passthrough_;
}
function transform(f) {
  return makeGetter({
    _tag: "Transform",
    transform: f
  });
}
function transformEffect(f) {
  return makeGetter({
    _tag: "TransformEffect",
    transform: f
  });
}
function transformOptional(f) {
  return makeGetter({
    _tag: "TransformOptional",
    transform: f
  });
}
function transformOptionalEffect(f) {
  return makeGetter({
    _tag: "TransformOptionalEffect",
    transform: f
  });
}
function omit() {
  return transformOptional(() => none2());
}
function withDefault(defaultValue) {
  return transformOptionalEffect((o) => {
    const filtered = filter(o, isNotUndefined);
    return isSome2(filtered) ? succeed5(filtered) : mapEager2(defaultValue, some2);
  });
}
function String2() {
  return transform(globalThis.String);
}
function Number3() {
  return transform(globalThis.Number);
}
function parseJson(options) {
  return transformEffect((input, parseOptions) => try_2({
    try: () => JSON.parse(input, options?.reviver),
    catch: () => new InvalidValue({
      expected: "a valid JSON string"
    }, input, parseOptions)
  }));
}
function stringifyJson(options) {
  return transformEffect((input, parseOptions) => try_2({
    try: () => {
      const output = JSON.stringify(input, options?.replacer, options?.space);
      if (output === undefined) {
        throw new TypeError("Value cannot be represented as JSON");
      }
      return output;
    },
    catch: () => new InvalidValue({
      expected: "a JSON-serializable value"
    }, input, parseOptions)
  }));
}
function encodeBase64() {
  return transform(encode);
}
function decodeBase64() {
  return transformEffect((input, options) => mapErrorEager2(fromResult2(decode(input)), () => new InvalidValue({
    expected: "a valid Base64 string"
  }, input, options)));
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/SchemaTransformation.js
var TypeId7 = "~effect/SchemaTransformation/Transformation";
var Transformation = class extends Class {
  [TypeId7] = TypeId7;
  _tag = "Transformation";
  decode;
  encode;
  constructor(decode, encode) {
    super();
    this.decode = decode;
    this.encode = encode;
  }
  flip() {
    return new Transformation(this.encode, this.decode);
  }
};
function isTransformation(u) {
  return hasProperty(u, TypeId7) && u[TypeId7] === TypeId7;
}
var makeTransformation = (options) => {
  if (isTransformation(options)) {
    return options;
  }
  return new Transformation(options.decode, options.encode);
};
function transformEffect2(options) {
  return new Transformation(transformEffect(options.decode), transformEffect(options.encode));
}
function transform2(options) {
  return new Transformation(transform(options.decode), transform(options.encode));
}
var passthrough_2 = /* @__PURE__ */ new Transformation(/* @__PURE__ */ passthrough2(), /* @__PURE__ */ passthrough2());
function passthrough3() {
  return passthrough_2;
}
var numberFromString = /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number3(), /* @__PURE__ */ String2());
var urlFromString = /* @__PURE__ */ transformEffect2({
  decode: (s, options) => URL.canParse(s) ? succeed5(new URL(s)) : fail5(new InvalidValue({
    expected: "a valid URL string"
  }, s, options)),
  encode: (url) => succeed5(url.href)
});
var uint8ArrayFromBase64String = /* @__PURE__ */ new Transformation(/* @__PURE__ */ decodeBase64(), /* @__PURE__ */ encodeBase64());
function fromJsonString(options) {
  return new Transformation(parseJson(options ?? {}), stringifyJson(options));
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/SchemaAST.js
function makeGuard(tag) {
  return (ast) => ast._tag === tag;
}
var isDeclaration = /* @__PURE__ */ makeGuard("Declaration");
var isNever2 = /* @__PURE__ */ makeGuard("Never");
var isLiteral = /* @__PURE__ */ makeGuard("Literal");
var isUniqueSymbol = /* @__PURE__ */ makeGuard("UniqueSymbol");
var isArrays = /* @__PURE__ */ makeGuard("Arrays");
var isObjects = /* @__PURE__ */ makeGuard("Objects");
var isSuspend = /* @__PURE__ */ makeGuard("Suspend");
var Link = class {
  to;
  transformation;
  constructor(to, transformation) {
    this.to = to;
    this.transformation = transformation;
  }
};
var defaultParseOptions = {};
var Context = class {
  isOptional;
  isMutable;
  constructorDefault;
  annotations;
  constructor(isOptional, isMutable, constructorDefault = undefined, annotations = undefined) {
    this.isOptional = isOptional;
    this.isMutable = isMutable;
    this.constructorDefault = constructorDefault;
    this.annotations = annotations;
  }
};
var TypeId8 = "~effect/Schema";

class ASTNodeImpl {
  [TypeId8] = TypeId8;
  annotations;
  checks;
  encoding;
  context;
  constructor(annotations = undefined, checks = undefined, encoding = undefined, context = undefined) {
    this.annotations = annotations;
    this.checks = checks;
    this.encoding = encoding;
    this.context = context;
  }
  toString() {
    return `<${this._tag}>`;
  }
}
var Declaration = class extends ASTNodeImpl {
  _tag = "Declaration";
  typeParameters;
  run;
  encodingChecks;
  encodingRun;
  constructor(typeParameters, run, annotations, checks, encoding, context, encodingChecks, encodingRun) {
    super(annotations, checks, encoding, context);
    this.typeParameters = typeParameters;
    this.run = run;
    this.encodingChecks = encodingChecks;
    this.encodingRun = encodingRun;
  }
  getParser() {
    let run;
    return (input, options) => {
      if (input === missing)
        return missingExit;
      return (run ??= this.run(this.typeParameters))(input, this, options);
    };
  }
  _rebuild(recur, checks, encodingChecks, run, encodingRun) {
    const tps = mapOrSame(this.typeParameters, recur);
    return tps === this.typeParameters && checks === this.checks && encodingChecks === this.encodingChecks && run === this.run && encodingRun === this.encodingRun ? this : new Declaration(tps, run, this.annotations, checks, undefined, this.context, encodingChecks, encodingRun);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks, this.run, this.encodingRun);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks, this.encodingRun ?? this.run, this.run);
  }
  getExpected() {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    return "<Declaration>";
  }
};
var Null = class extends ASTNodeImpl {
  _tag = "Null";
  getParser() {
    return fromConst(this, null);
  }
  getExpected() {
    return "null";
  }
};
var null_ = /* @__PURE__ */ new Null;
var Unknown = class extends ASTNodeImpl {
  _tag = "Unknown";
  getParser() {
    return fromRefinement(this, isUnknown);
  }
  getExpected() {
    return "unknown";
  }
};
var unknown = /* @__PURE__ */ new Unknown;
var Literal = class extends ASTNodeImpl {
  _tag = "Literal";
  literal;
  constructor(literal, annotations, checks, encoding, context) {
    super(annotations, checks, encoding, context);
    if (typeof literal === "number" && !globalThis.Number.isFinite(literal)) {
      throw new Error(`A numeric literal must be finite, got ${format(literal)}`);
    }
    this.literal = literal;
  }
  getParser() {
    return fromConst(this, this.literal);
  }
  matchPart(s, _options) {
    return s === globalThis.String(this.literal) ? this.literal : undefined;
  }
  toCodecJson() {
    return typeof this.literal === "bigint" ? literalToString(this) : this;
  }
  toCodecStringTree() {
    return typeof this.literal === "string" ? this : literalToString(this);
  }
  getExpected() {
    return typeof this.literal === "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal);
  }
};
function literalToString(ast) {
  const literalAsString = globalThis.String(ast.literal);
  return replaceEncoding(ast, [new Link(new Literal(literalAsString), new Transformation(transform(() => ast.literal), transform(() => literalAsString)))]);
}
var String3 = class extends ASTNodeImpl {
  _tag = "String";
  getParser() {
    return fromRefinement(this, isString);
  }
  matchPart(s, options) {
    const checks = this.checks;
    return checks && !options.disableChecks && collectIssues(checks, s, undefined, this, options) ? undefined : s;
  }
  getExpected() {
    return "string";
  }
};
var string2 = /* @__PURE__ */ new String3;
var Number4 = class extends ASTNodeImpl {
  _tag = "Number";
  getParser() {
    return fromRefinement(this, isNumber);
  }
  matchKey(s, options) {
    return this._match(isStringNumberRegExp, s, options);
  }
  matchPart(s, options) {
    return this._match(isStringFiniteRegExp, s, options);
  }
  _match(regexp, s, options) {
    if (!regexp.test(s))
      return;
    const value = globalThis.Number(s);
    if (options.disableChecks || !this.checks)
      return value;
    return collectIssues(this.checks, value, undefined, this, options) ? undefined : value;
  }
  toCodecJson() {
    if (this.checks && (hasCheck(this.checks, "effect/schema/isFinite") || hasCheck(this.checks, "effect/schema/isInt"))) {
      return this;
    }
    return replaceEncoding(this, [numberToJson]);
  }
  toCodecStringTree() {
    if (this.toCodecJson() === this) {
      return replaceEncoding(this, [finiteToString]);
    }
    return replaceEncoding(this, [numberToString]);
  }
  getExpected() {
    return "number";
  }
};
function hasCheck(checks, id) {
  return checks.some((check) => check.annotations?.representation?.id === id || check._tag === "FilterGroup" && hasCheck(check.checks, id));
}
var number2 = /* @__PURE__ */ new Number4;
var Boolean2 = class extends ASTNodeImpl {
  _tag = "Boolean";
  getParser() {
    return fromRefinement(this, isBoolean);
  }
  getExpected() {
    return "boolean";
  }
};
var boolean = /* @__PURE__ */ new Boolean2;
var Arrays = class extends ASTNodeImpl {
  _tag = "Arrays";
  isMutable;
  elements;
  rest;
  encodingChecks;
  constructor(isMutable, elements, rest, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.isMutable = isMutable;
    this.elements = elements;
    this.rest = rest;
    this.encodingChecks = encodingChecks;
    let hasOptional = false;
    for (let i = 0;i < elements.length; i++) {
      if (isOptional(elements[i])) {
        hasOptional = true;
      } else if (hasOptional) {
        throw new Error("A required element cannot follow an optional element. ts(1257)");
      }
    }
    if (hasOptional && rest.length > 1) {
      throw new Error("A required element cannot follow an optional element. ts(1257)");
    }
    for (let i = 1;i < rest.length; i++) {
      if (isOptional(rest[i])) {
        throw new Error("An optional element cannot follow a rest element. ts(1266)");
      }
    }
  }
  getParser(compile, compileField = compile) {
    const ast = this;
    let elements;
    let rest;
    const elementLen = ast.elements.length;
    const tailLen = Math.max(0, ast.rest.length - 1);
    function getParser(tailThreshold, index) {
      if (index < elementLen) {
        return elements[index];
      } else if (index >= tailThreshold) {
        return rest[index - tailThreshold + 1];
      }
      return rest[0];
    }
    const finish = (state) => {
      const {
        input,
        len,
        options
      } = state;
      if (ast.rest.length === 0 && len > elementLen) {
        for (let i = elementLen;i < len; i++) {
          const unexpected = new UnexpectedKey(ast, input[i], options);
          const issue = new Pointer([i], unexpected);
          if (options.errors === "all") {
            if (state.issues)
              state.issues.push(issue);
            else
              state.issues = [issue];
          } else {
            return fail5(new Composite(ast, [issue], input, options));
          }
        }
      }
      if (state.issues) {
        return fail5(new Composite(ast, state.issues, input, options));
      }
      return succeed6(state.output);
    };
    const parse = (input, options) => {
      const len = input.length;
      const state = {
        ast,
        getParser,
        input,
        len,
        tailThreshold: Math.max(elementLen, len - tailLen),
        output: new globalThis.Array(len),
        issues: undefined,
        options
      };
      const end = ast.rest.length === 0 ? elementLen : Math.max(len, elementLen + tailLen);
      const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency);
      const eff = concurrency === 1 ? parseArray(state, input, 0, end) : parseArrayConcurrent(state, input, {
        concurrency,
        end
      });
      if (!eff)
        return finish(state);
      if (effectIsExit(eff))
        return flatMapEager2(eff, () => finish(state));
      let first = true;
      return suspend2(() => {
        if (!first)
          return parse(input, options);
        first = false;
        return flatMap2(eff, () => finish(state));
      });
    };
    return (input, options) => {
      if (input === missing)
        return missingExit;
      try {
        if (!Array.isArray(input)) {
          return fail5(new InvalidType(ast, input, options));
        }
        if (!elements) {
          elements = ast.elements.map((ast) => ({
            ast,
            parser: compileField(ast)
          }));
          rest = ast.rest.map((ast) => ({
            ast,
            parser: compileField(ast)
          }));
        }
        return parse(input, options);
      } catch (error) {
        return die3(error);
      }
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const elements = mapOrSame(this.elements, recur);
    const rest = mapOrSame(this.rest, recur);
    return elements === this.elements && rest === this.rest && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Arrays(this.isMutable, elements, rest, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  getExpected() {
    return "array";
  }
};
function stepArray(s, item, exit, i) {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, i, exit);
  }
  const value = exit === sameExit ? item : exit[args];
  if (value !== missing) {
    s.output[i] = value;
  } else {
    const p = s.getParser(s.tailThreshold, i);
    if (isOptional(p.ast))
      return;
    const issue = new Pointer([i], new MissingKey(p.ast.context?.annotations));
    if (s.options.errors === "all") {
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
    } else {
      return fail4(new Composite(s.ast, [issue], s.input, s.options));
    }
  }
}
var parseArrayOptions = {
  onItem(s, item, i) {
    const value = i < s.len ? item : missing;
    return s.getParser(s.tailThreshold, i).parser(value, s.options);
  },
  step: stepArray
};
var parseArray = /* @__PURE__ */ iterateEager()(parseArrayOptions);
var parseArrayConcurrent = /* @__PURE__ */ iterateConcurrent()(parseArrayOptions);
var wrapPropertyKeyIssue = (s, ast, key, exit) => {
  if (exit.cause.reasons.length === 0) {
    return exit;
  }
  const issue = getSchemaIssue(exit.cause);
  if (issue === undefined) {
    return failCause2(map3(exit.cause, (issue) => new Composite(ast, [new Pointer([key], issue)], s.input, s.options)));
  }
  const pointer = new Pointer([key], issue);
  if (s.options.errors === "all") {
    if (s.issues)
      s.issues.push(pointer);
    else
      s.issues = [pointer];
  } else {
    return fail4(new Composite(ast, [pointer], s.input, s.options));
  }
};
var FINITE_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?";
function getIndexSignatureKeys(input, parameter, options = defaultParseOptions) {
  let stringKeys;
  let symbolKeys;
  function go(parameter) {
    switch (parameter._tag) {
      case "String":
      case "TemplateLiteral":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchPart(k, options) !== undefined);
      case "Number":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchKey(k, options) !== undefined);
      case "Symbol":
        return (symbolKeys ??= Object.getOwnPropertySymbols(input)).filter((k) => Object.prototype.propertyIsEnumerable.call(input, k) && parameter.matchKey(k, options) !== undefined);
      case "Union":
        return [...new Set(parameter.types.flatMap(go))];
      default:
        return [];
    }
  }
  return go(parameterFromPropertyKey(toEncoded(parameter)));
}
var PropertySignature = class {
  name;
  type;
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
};
function isIndexSignatureParameterSide(ast) {
  switch (ast._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return ast.types.every(isIndexSignatureParameterSide);
    default:
      return false;
  }
}
function isIndexSignatureParameterEncodedSide(ast) {
  const encoded = getLastEncoding(ast);
  switch (encoded._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return encoded.types.every(isIndexSignatureParameterEncodedSide);
    default:
      return false;
  }
}
function isIndexSignatureParameter(ast) {
  return isIndexSignatureParameterSide(ast) && isIndexSignatureParameterEncodedSide(ast);
}
var IndexSignature = class {
  parameter;
  type;
  constructor(parameter, type) {
    if (!isIndexSignatureParameter(parameter)) {
      throw new Error(`Invalid index signature parameter ${parameter._tag}`);
    }
    this.parameter = parameter;
    this.type = type;
    if (isOptional(type) && !containsUndefined(type)) {
      throw new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.");
    }
  }
};
var Objects = class extends ASTNodeImpl {
  _tag = "Objects";
  propertySignatures;
  indexSignatures;
  encodingChecks;
  constructor(propertySignatures, indexSignatures, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.propertySignatures = propertySignatures;
    this.indexSignatures = indexSignatures;
    this.encodingChecks = encodingChecks;
  }
  getParser(compile, compileField = compile) {
    const ast = this;
    const hasProperties = ast.propertySignatures.length;
    const indexCount = ast.indexSignatures.length;
    if (!hasProperties && !indexCount) {
      return fromRefinement(ast, isNotNullish);
    }
    let properties;
    let indexes;
    const compileMembers = () => {
      if (!properties) {
        properties = ast.propertySignatures.map((ps) => ({
          parser: compileField(ps.type),
          name: ps.name,
          type: ps.type
        }));
        indexes = indexCount ? ast.indexSignatures.map((is) => ({
          is,
          parserKey: compile(parameterFromPropertyKey(is.parameter)),
          parserValue: compileField(is.type)
        })) : undefined;
      }
      return properties;
    };
    const makeFallback = () => {
      const expectedKeys = new Set(ast.propertySignatures.map((ps) => typeof ps.name === "number" ? globalThis.String(ps.name) : ps.name));
      const finishIndex = (s, key, k2, inputValue, exitValue) => {
        if (exitValue._tag === "Failure") {
          return wrapPropertyKeyIssue(s, ast, key, exitValue) ?? void_2;
        }
        const value = exitValue === sameExit ? inputValue : exitValue[args];
        if (k2 !== missing && value !== missing) {
          if (hasProperties && (expectedKeys.has(key) || expectedKeys.has(typeof k2 === "number" ? globalThis.String(k2) : k2)))
            return void_2;
          assignProperty(s.out, k2, value);
        }
        return void_2;
      };
      const parseIndex = (s, key, index, exitKey) => {
        if (!exitKey) {
          const eff = index.parserKey(key, s.options);
          if (!effectIsExit(eff)) {
            return flatMap2(exit2(eff), (exit) => parseIndex(s, key, index, exit));
          }
          exitKey = eff;
        }
        if (exitKey._tag === "Failure") {
          return wrapPropertyKeyIssue(s, ast, key, exitKey) ?? void_2;
        }
        const k2 = exitKey === sameExit ? key : exitKey[args];
        const inputValue = s.input[key];
        const result = index.parserValue(inputValue, s.options);
        return effectIsExit(result) ? finishIndex(s, key, k2, inputValue, result) : flatMap2(exit2(result), (exit) => finishIndex(s, key, k2, inputValue, exit));
      };
      const parseStringIndex = (s, key, index) => {
        const inputValue = s.input[key];
        const result = index.parserValue(inputValue, s.options);
        return effectIsExit(result) ? finishIndex(s, key, key, inputValue, result) : flatMap2(exit2(result), (exit) => finishIndex(s, key, key, inputValue, exit));
      };
      const parseIndexes = indexCount ? iterateConcurrent()({
        onItem: (s, [key, index]) => index.is.parameter === string2 ? parseStringIndex(s, key, index) : parseIndex(s, key, index),
        step: (_s, _item, exit) => exit._tag === "Failure" ? exit : undefined
      }) : undefined;
      return fnUntracedEager2(function* (input, options) {
        if (input === missing) {
          return missing;
        }
        if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
          return yield* fail5(new InvalidType(ast, input, options));
        }
        compileMembers();
        const record = input;
        const out = {};
        const state = {
          ast,
          input: record,
          out,
          issues: undefined,
          options
        };
        const errorsAllOption = options.errors === "all";
        const onExcessPropertyError = options.onExcessProperty === "error";
        const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency);
        const indexKeys = indexCount && onExcessPropertyError ? ast.indexSignatures.map((index) => getIndexSignatureKeys(record, index.parameter, options)) : undefined;
        if (onExcessPropertyError) {
          const coveredKeys = indexKeys ? new Set(expectedKeys) : expectedKeys;
          if (indexKeys) {
            for (const keys of indexKeys) {
              for (const key of keys)
                coveredKeys.add(key);
            }
          }
          const inputKeys = Reflect.ownKeys(record);
          for (let i = 0;i < inputKeys.length; i++) {
            const key = inputKeys[i];
            if (!coveredKeys.has(key) && Object.prototype.propertyIsEnumerable.call(record, key)) {
              const unexpected = new UnexpectedKey(ast, record[key], options);
              const issue = new Pointer([key], unexpected);
              if (errorsAllOption) {
                if (state.issues) {
                  state.issues.push(issue);
                } else {
                  state.issues = [issue];
                }
                continue;
              } else {
                return yield* fail5(new Composite(ast, [issue], input, options));
              }
            }
          }
        }
        if (hasProperties) {
          const eff = concurrency === 1 ? parseProperties(state, properties) : parsePropertiesConcurrent(state, properties, {
            concurrency
          });
          if (eff)
            yield* eff;
        }
        if (indexCount && concurrency === 1) {
          for (let i = 0;i < indexCount; i++) {
            const index = indexes[i];
            const parse = index.is.parameter === string2 ? parseStringIndex : parseIndex;
            const keys = indexKeys?.[i] ?? (index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options));
            for (let j = 0;j < keys.length; j++) {
              const eff = parse(state, keys[j], index);
              if (!effectIsExit(eff))
                yield* eff;
              else if (eff._tag === "Failure")
                return yield* eff;
            }
          }
        } else if (parseIndexes) {
          const keyPairs = empty2();
          for (let i = 0;i < indexCount; i++) {
            const index = indexes[i];
            const keys = indexKeys?.[i] ?? (index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options));
            for (let j = 0;j < keys.length; j++) {
              keyPairs.push([keys[j], index]);
            }
          }
          const eff = parseIndexes(state, keyPairs, {
            concurrency
          });
          if (eff)
            yield* eff;
        }
        if (state.issues) {
          return yield* fail5(new Composite(ast, state.issues, input, options));
        }
        return out;
      });
    };
    if (indexCount)
      return makeFallback();
    let fallback;
    const resume = (state, index, pending) => {
      const property = properties[index];
      return flatMap2(exit2(pending), (exit) => {
        const terminal = stepProperty(state, property, exit);
        if (terminal)
          return terminal;
        const done = () => succeed6(state.out);
        const eff = parseProperties(state, properties.slice(index + 1));
        return eff ? flatMapEager2(eff, done) : done();
      });
    };
    return (input, options) => {
      if (input === missing)
        return missingExit;
      if (options.errors === "all" || options.onExcessProperty !== undefined || options.concurrency !== undefined && resolveConcurrency(options.concurrency) !== 1) {
        return (fallback ??= makeFallback())(input, options);
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return fail5(new InvalidType(ast, input, options));
      }
      const props = compileMembers();
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: undefined,
        options
      };
      try {
        for (let index = 0;index < props.length; index++) {
          const property = props[index];
          const name = property.name;
          const hasKey = hasPropertySignature(record, name);
          const value = hasKey ? record[name] : missing;
          const exit = property.parser(value, options);
          if (!effectIsExit(exit)) {
            return resume(state, index, exit);
          }
          if (exit === sameExit) {
            if (hasKey)
              assignProperty(out, name, value);
            continue;
          }
          const terminal = stepProperty(state, property, exit);
          if (terminal)
            return terminal;
        }
      } catch (error) {
        return die3(error);
      }
      return succeed6(out);
    };
  }
  _rebuild(recur, recurParameter, checks, encodingChecks) {
    const props = mapOrSame(this.propertySignatures, (ps) => {
      const t = recur(ps.type);
      return t === ps.type ? ps : new PropertySignature(ps.name, t);
    });
    const indexes = mapOrSame(this.indexSignatures, (is) => {
      const p = recurParameter(is.parameter);
      const t = recur(is.type);
      return p === is.parameter && t === is.type ? is : new IndexSignature(p, t);
    });
    return props === this.propertySignatures && indexes === this.indexSignatures && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Objects(props, indexes, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, recur, this.encodingChecks, this.checks);
  }
  recur(recur, recurParameter = recur) {
    return this._rebuild(recur, recurParameter, this.checks, this.encodingChecks);
  }
  getExpected() {
    if (this.propertySignatures.length === 0 && this.indexSignatures.length === 0)
      return "object | array";
    return "object";
  }
};
function stepProperty(s, p, exit) {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, p.name, exit);
  }
  if (exit === sameExit)
    return;
  const value = exit[args];
  if (value !== missing) {
    assignProperty(s.out, p.name, value);
    return;
  }
  delete s.out[p.name];
  if (!isOptional(p.type)) {
    const issue = new Pointer([p.name], new MissingKey(p.type.context?.annotations));
    if (s.options.errors === "all") {
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
      return;
    } else {
      return fail4(new Composite(s.ast, [issue], s.input, s.options));
    }
  }
}
var parsePropertiesOptions = {
  onItem(s, p) {
    if (!hasPropertySignature(s.input, p.name)) {
      return p.parser(missing, s.options);
    }
    const value = s.input[p.name];
    assignProperty(s.out, p.name, value);
    return p.parser(value, s.options);
  },
  step: stepProperty
};
var parseProperties = /* @__PURE__ */ iterateEager()(parsePropertiesOptions);
var parsePropertiesConcurrent = /* @__PURE__ */ iterateConcurrent()(parsePropertiesOptions);
function combineChecks(a, b) {
  if (!a)
    return b;
  if (!b)
    return a;
  return [...a, ...b];
}
function struct(fields, checks, annotations) {
  return new Objects(Reflect.ownKeys(fields).map((key) => {
    return new PropertySignature(key, fields[key].ast);
  }), [], annotations, checks);
}
function getAST(self) {
  return self.ast;
}
function tuple(elements, checks = undefined) {
  return new Arrays(false, elements.map((e) => e.ast), [], undefined, checks);
}
function union(members, options, checks) {
  return new Union(members.map(getAST), options, undefined, checks);
}
var toCandidate = /* @__PURE__ */ memoizeIdempotent((ast) => {
  while (true) {
    if (isSuspend(ast))
      return unknown;
    const encoding = ast.encoding;
    if (!encoding) {
      return ast.recur?.(toCandidate, identity) ?? ast;
    }
    if (encoding.some((link) => link.transformation._tag === "Middleware" && link.transformation.decode !== identity))
      return unknown;
    ast = encoding[encoding.length - 1].to;
  }
});
function getCandidateTypes(ast) {
  switch (ast._tag) {
    case "Null":
      return ["null"];
    case "Undefined":
      return ["undefined"];
    case "String":
    case "TemplateLiteral":
      return ["string"];
    case "Number":
      return ["number"];
    case "Boolean":
      return ["boolean"];
    case "Symbol":
    case "UniqueSymbol":
      return ["symbol"];
    case "BigInt":
      return ["bigint"];
    case "Arrays":
      return ["array"];
    case "ObjectKeyword":
      return ["object", "array", "function"];
    case "Objects":
      return ast.propertySignatures.length || ast.indexSignatures.length ? ["object"] : ["string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
    case "Enum":
      return Array.from(new Set(ast.enums.map(([, v]) => typeof v)));
    case "Literal":
      return [typeof ast.literal];
    case "Union":
      return Array.from(new Set(ast.types.flatMap(getCandidateTypes)));
    default:
      return ["null", "undefined", "string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
  }
}
function collectSentinels(ast) {
  switch (ast._tag) {
    default:
      return [];
    case "Declaration": {
      const s = ast.annotations?.[SENTINELS_ANNOTATION_KEY];
      return Array.isArray(s) ? s : [];
    }
    case "Objects":
      return ast.propertySignatures.flatMap((ps) => {
        const type = ps.type;
        if (!isOptional(type)) {
          if (isLiteral(type)) {
            return [{
              key: ps.name,
              literal: type.literal
            }];
          }
          if (isUniqueSymbol(type)) {
            return [{
              key: ps.name,
              literal: type.symbol
            }];
          }
        }
        return [];
      });
    case "Arrays":
      return ast.elements.flatMap((e, i) => {
        if (!isOptional(e)) {
          if (isLiteral(e)) {
            return [{
              key: i,
              literal: e.literal
            }];
          }
          if (isUniqueSymbol(e)) {
            return [{
              key: i,
              literal: e.symbol
            }];
          }
        }
        return [];
      });
    case "Union": {
      if (ast.types.length === 0)
        return [];
      const members = ast.types.map((type) => collectSentinels(toCandidate(type)));
      return members[0].filter((s) => members.every((sentinels) => sentinels.some((o) => o.key === s.key && o.literal === s.literal)));
    }
    case "Suspend":
      return collectSentinels(ast.thunk());
  }
}
var candidateIndexCache = /* @__PURE__ */ new WeakMap;
var emptyCandidates = /* @__PURE__ */ Object.freeze([]);
var getRuntimeType = (input) => input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
var hasPropertySignature = (input, key) => key === "__proto__" ? Object.hasOwn(input, key) : (key in input);
function getCandidateIndex(types) {
  let index = candidateIndexCache.get(types);
  if (index)
    return index;
  let bySentinel;
  let sentinelCandidateCount = 0;
  let otherwise;
  let literalCandidates;
  let onlyLiterals = true;
  const literalOf = [];
  for (let i = 0;i < types.length; i++) {
    const a = types[i];
    const encoded = toCandidate(a);
    if (isNever2(encoded))
      continue;
    if (isLiteral(encoded) || isUniqueSymbol(encoded)) {
      literalCandidates ??= new Map;
      const literal = isLiteral(encoded) ? encoded.literal : encoded.symbol;
      literalOf[i] = literal;
      let arr = literalCandidates.get(literal);
      if (!arr)
        literalCandidates.set(literal, arr = []);
      arr.push(i);
    } else {
      onlyLiterals = false;
    }
    const sentinels = collectSentinels(encoded);
    if (sentinels.length) {
      bySentinel ??= new Map;
      sentinelCandidateCount++;
      for (const {
        key,
        literal
      } of sentinels) {
        let entry = bySentinel.get(key);
        if (!entry)
          bySentinel.set(key, entry = [new Map, new Set]);
        entry[1].add(i);
        let indexes = entry[0].get(literal);
        if (!indexes)
          entry[0].set(literal, indexes = new Set);
        indexes.add(i);
      }
    } else {
      otherwise ??= {};
      const candidateTypes = getCandidateTypes(encoded);
      for (const t of candidateTypes)
        (otherwise[t] ??= []).push(i);
    }
  }
  const fallbacks = {};
  const getFallback = (type) => fallbacks[type] ??= Object.freeze(otherwise?.[type] ?? emptyCandidates);
  if (onlyLiterals && literalCandidates) {
    literalCandidates.forEach(Object.freeze);
    index = (input) => literalCandidates.get(input) ?? emptyCandidates;
  } else if (bySentinel?.size === 1 && !otherwise) {
    const [key, [byValue]] = bySentinel.entries().next().value;
    const candidates = new Map;
    for (const [literal, indexes] of byValue) {
      candidates.set(literal, Object.freeze(Array.from(indexes)));
    }
    const all = Object.freeze(types.map((_, i) => i));
    index = (input, isConstructor) => {
      if (isObjectKeyword(input)) {
        const value = hasPropertySignature(input, key) ? input[key] : undefined;
        if (value !== undefined)
          return candidates.get(value) ?? emptyCandidates;
        if (isConstructor)
          return all;
      }
      return emptyCandidates;
    };
  } else if (bySentinel) {
    let commonSentinel;
    for (const entry of bySentinel) {
      if ((!commonSentinel || entry[1][0].size > commonSentinel[1][0].size) && entry[1][1].size === sentinelCandidateCount) {
        commonSentinel = entry;
      }
    }
    index = (input, isConstructor) => {
      const runtimeType = getRuntimeType(input);
      if (!isObjectKeyword(input))
        return getFallback(runtimeType);
      const selected = new Set(otherwise?.[runtimeType]);
      let directKey;
      if (commonSentinel) {
        const [key, [byValue]] = commonSentinel;
        const hasKey = hasPropertySignature(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          if (!match)
            return getFallback(runtimeType);
          for (const i of match)
            selected.add(i);
          directKey = key;
        }
      }
      if (directKey === undefined) {
        for (const [key, [byValue, all]] of bySentinel) {
          const hasKey = hasPropertySignature(input, key);
          const value = hasKey ? input[key] : undefined;
          if (hasKey && (!isConstructor || value !== undefined)) {
            const match = byValue.get(value);
            if (match) {
              for (const i of match)
                selected.add(i);
            }
          } else if (isConstructor) {
            for (const i of all)
              selected.add(i);
          }
        }
      }
      for (const [key, [byValue, all]] of bySentinel) {
        if (key === directKey)
          continue;
        const hasKey = hasPropertySignature(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          for (const i of selected) {
            if (all.has(i) && !match?.has(i))
              selected.delete(i);
          }
        }
      }
      return Array.from(selected).sort((a, b) => a - b);
    };
  } else {
    index = (input) => {
      const fallback = getFallback(getRuntimeType(input));
      return literalCandidates ? fallback.filter((i) => literalOf[i] === undefined || literalOf[i] === input) : fallback;
    };
  }
  candidateIndexCache.set(types, index);
  return index;
}
var Union = class extends ASTNodeImpl {
  _tag = "Union";
  types;
  options;
  encodingChecks;
  constructor(types, options, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.types = types;
    this.options = options;
    this.encodingChecks = encodingChecks;
  }
  getParser(compile, compileField) {
    const ast = this;
    const isConstructor = compileField !== undefined;
    const parsers = [];
    const parser = (i) => parsers[i] ??= compile(ast.types[i]);
    let index;
    return (input, options) => {
      if (input === missing) {
        return missingExit;
      }
      const candidates = (index ??= getCandidateIndex(ast.types))(input, isConstructor);
      if (candidates.length === 0) {
        return fail5(new AnyOf(ast, [], input, options));
      }
      if (candidates.length === 1) {
        const result = parser(candidates[0])(input, options);
        if (result._tag === "Success")
          return result;
        return effectIsExit(result) ? failSingleUnionCandidate(ast, result.cause, input, options) : catchSingleUnionCandidate(ast, result, input, options);
      }
      return parseUnionCandidates(ast, parser, candidates, input, options);
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const types = mapOrSame(this.types, recur);
    return types === this.types && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Union(types, this.options, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  matchPart(s, options) {
    for (const type of this.types) {
      const out = type.matchPart(s, options);
      if (out !== undefined)
        return out;
    }
    return;
  }
  getExpected(getExpected) {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    if (this.types.length === 0)
      return "never";
    const types = this.types.map((type) => {
      const encoded = toEncoded(type);
      switch (encoded._tag) {
        case "Arrays": {
          const literals = encoded.elements.filter(isLiteral);
          if (literals.length > 0) {
            return `${formatIsMutable(encoded.isMutable)}[ ${literals.map((e) => getExpected(e) + formatIsOptional(e.context?.isOptional)).join(", ")}, ... ]`;
          }
          break;
        }
        case "Objects": {
          const literals = encoded.propertySignatures.filter((ps) => isLiteral(ps.type));
          if (literals.length > 0) {
            return `{ ${literals.map((ps) => `${formatIsMutable(ps.type.context?.isMutable)}${formatPropertyKey(ps.name)}${formatIsOptional(ps.type.context?.isOptional)}: ${getExpected(ps.type)}`).join(", ")}, ... }`;
          }
          break;
        }
      }
      return getExpected(encoded);
    });
    return Array.from(new Set(types)).join(" | ");
  }
};
function failSingleUnionCandidate(ast, cause, input, options) {
  const issue = getSchemaIssue(cause);
  if (!issue)
    return failCause2(cause);
  return fail4(new AnyOf(ast, [issue], input, options));
}
function catchSingleUnionCandidate(ast, result, input, options) {
  return catchCause2(result, (cause) => failSingleUnionCandidate(ast, cause, input, options));
}
function parseUnionCandidates(ast, parser, candidates, input, options) {
  const state = {
    ast,
    parser,
    input,
    out: undefined,
    successes: ast.options?.mode === "oneOf" ? [] : undefined,
    issues: undefined,
    options
  };
  const eff = parseUnion(state, candidates);
  if (!eff) {
    if (state.out)
      return state.out;
    return fail5(new AnyOf(ast, state.issues ?? [], input, options));
  }
  if (effectIsExit(eff))
    return resumeUnion(eff, state);
  let first = true;
  return suspend2(() => {
    if (!first)
      return parseUnionCandidates(ast, parser, candidates, input, options);
    first = false;
    return resumeUnion(eff, state);
  });
}
function resumeUnion(eff, state) {
  return flatMapEager2(eff, (_) => {
    if (state.out === sameExit)
      return succeed5(state.input);
    if (state.out)
      return state.out;
    return fail5(new AnyOf(state.ast, state.issues ?? [], state.input, state.options));
  });
}
var parseUnion = /* @__PURE__ */ iterateEager()({
  onItem(s, i) {
    return s.parser(i)(s.input, s.options);
  },
  step(s, i, exit) {
    if (exit._tag === "Failure") {
      const issue = getSchemaIssue(exit.cause);
      if (issue === undefined) {
        return exit;
      }
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
    } else {
      if (s.out && s.successes) {
        s.successes.push(s.ast.types[i]);
        return fail4(new OneOf(s.ast, s.successes, s.input, s.options));
      }
      s.out = exit;
      if (s.successes) {
        s.successes.push(s.ast.types[i]);
      } else {
        return void_2;
      }
    }
  }
});
var nonFiniteLiterals = /* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("Infinity"), /* @__PURE__ */ new Literal("-Infinity"), /* @__PURE__ */ new Literal("NaN")]);
function formatIsMutable(isMutable) {
  return isMutable ? "" : "readonly ";
}
function formatIsOptional(isOptional) {
  return isOptional ? "?" : "";
}
var Filter2 = class extends Class {
  _tag = "Filter";
  run;
  annotations;
  aborted;
  constructor(run, annotations = undefined, aborted = false) {
    super();
    this.run = run;
    this.annotations = annotations;
    this.aborted = aborted;
  }
  annotate(annotations) {
    return new Filter2(this.run, {
      ...this.annotations,
      ...annotations
    }, this.aborted);
  }
  abort() {
    return new Filter2(this.run, this.annotations, true);
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
};
var FilterGroup = class extends Class {
  _tag = "FilterGroup";
  checks;
  annotations;
  constructor(checks, annotations = undefined) {
    super();
    this.checks = checks;
    this.annotations = annotations;
  }
  annotate(annotations) {
    return new FilterGroup(this.checks, {
      ...this.annotations,
      ...annotations
    });
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
};
function makeFilter(filter, annotations, aborted = false) {
  return new Filter2((input, ast, options) => normalizeFilterOutput(ast, filter(input, ast, options), input, options), annotations, aborted);
}
function isFinite(annotations) {
  return makeFilter((n) => globalThis.Number.isFinite(n), {
    expected: "a finite number",
    representation: {
      id: "effect/schema/isFinite",
      payload: null
    },
    toJsonSchema: () => ({
      type: "number"
    }),
    toCode: () => ({
      runtime: "Schema.isFinite()"
    }),
    arbitraryConstraint: {
      number: "finite"
    },
    ...annotations
  });
}
var finite = /* @__PURE__ */ appendChecks(number2, [/* @__PURE__ */ isFinite()]);
var numberToJson = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finite, nonFiniteLiterals]), /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number3(), /* @__PURE__ */ transform((n) => globalThis.Number.isFinite(n) ? n : globalThis.String(n))));
function isPattern(regExp, annotations) {
  const copy = new globalThis.RegExp(regExp);
  const payload = {
    source: copy.source,
    flags: copy.flags
  };
  return makeFilter((s) => {
    copy.lastIndex = 0;
    return copy.test(s);
  }, {
    expected: `a string matching the RegExp ${payload.source}`,
    representation: {
      id: "effect/schema/isPattern",
      payload
    },
    toJsonSchema: () => [{}, true],
    arbitraryConstraint: {
      patterns: [payload]
    },
    ...annotations
  });
}
var bodyOwners = /* @__PURE__ */ new WeakMap;
function copy(ast, changes) {
  const out = Object.assign(Object.create(Object.getPrototypeOf(ast)), ast, changes);
  if (Reflect.ownKeys(changes).every((key) => key === "context" || key === "encoding")) {
    bodyOwners.set(out, getContextOwner(ast));
  }
  return out;
}
function getContextOwner(ast) {
  const existing = bodyOwners.get(ast);
  if (existing !== undefined)
    return existing;
  if (ast.encoding === undefined)
    return ast;
  const owner = Object.assign(Object.create(Object.getPrototypeOf(ast)), ast, {
    encoding: undefined
  });
  bodyOwners.set(ast, owner);
  return owner;
}
function replaceEncoding(ast, encoding) {
  return ast.encoding === encoding ? ast : copy(ast, {
    encoding
  });
}
function replaceContext(ast, context) {
  if (ast.context === context) {
    return ast;
  }
  const owner = getContextOwner(ast);
  if (owner.context === context && owner.encoding === ast.encoding) {
    return owner;
  }
  return copy(ast, {
    context
  });
}
function getLastEncoding(ast) {
  return ast.encoding ? getLastEncoding(ast.encoding[ast.encoding.length - 1].to) : ast;
}
function annotate(ast, annotations) {
  if (ast.checks) {
    const last = ast.checks[ast.checks.length - 1];
    return replaceChecks(ast, append(ast.checks.slice(0, -1), last.annotate(annotations)));
  }
  return copy(ast, {
    annotations: {
      ...ast.annotations,
      ...annotations
    }
  });
}
function replaceChecks(ast, checks) {
  if (ast._tag === "Suspend" && checks) {
    throw new Error("Cannot add checks to Suspend");
  }
  if (ast.checks === checks) {
    return ast;
  }
  return copy(ast, {
    checks
  });
}
function appendChecks(ast, checks) {
  return replaceChecks(ast, combineChecks(ast.checks, checks));
}
function mapLink(link, f) {
  const to = f(link.to);
  return to === link.to ? link : new Link(to, link.transformation);
}
function updateLastLink(encoding, f) {
  const links = encoding;
  const last = links[links.length - 1];
  const out = mapLink(last, f);
  return out === last ? encoding : append(encoding.slice(0, encoding.length - 1), out);
}
function applyToLastLink(f) {
  return (ast) => ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, f)) : ast;
}
function applyToSelfOrLastLinkEncodingIdempotent(f, options) {
  function out(ast) {
    if (ast.encoding) {
      const last = ast.encoding[ast.encoding.length - 1];
      return options?.stopAt?.(last) ? ast : replaceEncoding(ast, updateLastLink(ast.encoding, out));
    }
    return f(ast);
  }
  return memoizeIdempotent(out);
}
function appendTransformation(from, transformation, to) {
  const link = new Link(from, transformation);
  return replaceEncoding(to, to.encoding ? [...to.encoding, link] : [link]);
}
function mapOrSame(as, f) {
  let out;
  for (let i = 0;i < as.length; i++) {
    const a = as[i];
    const fa = f(a);
    if (out) {
      out[i] = fa;
    } else if (fa !== a) {
      out = new Array(as.length);
      for (let j = 0;j < i; j++) {
        out[j] = as[j];
      }
      out[i] = fa;
    }
  }
  return out ?? as;
}
function annotateKey(ast, annotations) {
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, ast.context.constructorDefault, {
    ...ast.context.annotations,
    ...annotations
  }) : new Context(false, false, undefined, annotations);
  return replaceContext(ast, context);
}
var optionalKey = /* @__PURE__ */ memoizeIdempotent((ast) => {
  const context = ast.context ? ast.context.isOptional === false ? new Context(true, ast.context.isMutable, ast.context.constructorDefault, ast.context.annotations) : ast.context : new Context(true, false);
  return optionalKeyLastLink(replaceContext(ast, context));
});
var optionalKeyLastLink = /* @__PURE__ */ applyToLastLink(optionalKey);
function withConstructorDefault(ast, defaultValue) {
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, defaultValue, ast.context.annotations) : new Context(false, false, defaultValue);
  return replaceContext(ast, context);
}
function decodeTo(from, to, transformation) {
  return appendTransformation(from, transformation, to);
}
function parseParameter(ast) {
  const literals = [];
  const parameters = [];
  function go(ast) {
    switch (ast._tag) {
      case "Literal":
        if (isPropertyKey(ast.literal) && !literals.includes(ast.literal)) {
          literals.push(ast.literal);
        }
        return;
      case "UniqueSymbol":
        if (!literals.includes(ast.symbol)) {
          literals.push(ast.symbol);
        }
        return;
      case "Never":
        return;
      case "Union":
        for (let i = 0;i < ast.types.length; i++) {
          go(ast.types[i]);
        }
        return;
      default:
        parameters.push(ast);
    }
  }
  go(ast);
  return {
    literals,
    parameters
  };
}
function record(key, value) {
  const {
    literals,
    parameters: indexSignatures
  } = parseParameter(key);
  return new Objects(literals.map((literal) => new PropertySignature(literal, value)), indexSignatures.map((parameter) => new IndexSignature(parameter, value)));
}
function isOptional(ast) {
  return ast.context?.isOptional ?? false;
}
function isStructuralCheck(check) {
  return check.annotations?.[STRUCTURAL_ANNOTATION_KEY] === true || check._tag === "FilterGroup" && check.checks.every(isStructuralCheck);
}
function extractStructuralChecks(checks) {
  function extract(check) {
    if (isStructuralCheck(check))
      return [check];
    return check._tag === "FilterGroup" ? check.checks.flatMap(extract) : [];
  }
  const out = checks.flatMap(extract);
  return isArrayNonEmpty2(out) ? out : undefined;
}
function canPreserveEncodingChecks(ast) {
  let preserve = true;
  function visit(child) {
    preserve = preserve && !child.encoding && !isSuspend(child);
    if (preserve && "recur" in child)
      child.recur(visit);
    return child;
  }
  if ("recur" in ast)
    ast.recur(visit);
  return preserve;
}
var toType = /* @__PURE__ */ memoizeIdempotent((ast) => {
  const owner = getContextOwner(ast);
  if (owner !== ast) {
    const type = toType(owner);
    return type === owner && ast.encoding === undefined ? ast : replaceContext(type, ast.context);
  }
  const type = "recur" in ast ? ast.recur(toType) : ast;
  if ("encodingChecks" in type && type.encodingChecks) {
    const checks = canPreserveEncodingChecks(ast) ? type.encodingChecks : isArrays(type) || isObjects(type) || isDeclaration(type) && type.typeParameters.length > 0 ? extractStructuralChecks(type.encodingChecks) : undefined;
    return copy(type, {
      encodingChecks: undefined,
      checks: combineChecks(type.checks, checks)
    });
  }
  return type;
});
var toEncoded = /* @__PURE__ */ memoizeIdempotent((ast) => {
  return toType(flip2(ast));
});
function flipEncoding(ast, encoding) {
  const links = encoding;
  const len = links.length;
  const last = links[len - 1];
  const ls = [new Link(flip2(replaceEncoding(ast, undefined)), links[0].transformation.flip())];
  for (let i = 1;i < len; i++) {
    ls.unshift(new Link(flip2(links[i - 1].to), links[i].transformation.flip()));
  }
  const to = flip2(last.to);
  if (to.encoding) {
    return replaceEncoding(to, [...to.encoding, ...ls]);
  } else {
    return replaceEncoding(to, ls);
  }
}
var flip2 = /* @__PURE__ */ memoize((ast) => {
  if (ast.encoding) {
    return flipEncoding(ast, ast.encoding);
  }
  const owner = getContextOwner(ast);
  if (owner !== ast) {
    const flipped = flip2(owner);
    return flipped === owner ? ast : replaceContext(flipped, ast.context);
  }
  return "flip" in ast ? ast.flip(flip2) : ("recur" in ast) ? ast.recur(flip2) : ast;
});
function containsUndefined(ast) {
  switch (ast._tag) {
    case "Undefined":
      return true;
    case "Union":
      return ast.types.some(containsUndefined);
    default:
      return false;
  }
}
function fromConst(ast, value) {
  const succeed = value === 0 ? sameExit : succeed6(value);
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (input === value)
      return succeed;
    return fail5(new InvalidType(ast, input, options));
  };
}
function fromRefinement(ast, refinement) {
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (refinement(input))
      return sameExit;
    return fail5(new InvalidType(ast, input, options));
  };
}
var parameterFromPropertyKey = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Number":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromPropertyKey);
  }
});
var isStringFiniteRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${FINITE_PATTERN}$`);
var isStringNumberRegExp = /* @__PURE__ */ new globalThis.RegExp(`^(?:${FINITE_PATTERN}|Infinity|-Infinity|NaN)$`);
function isStringFinite(annotations) {
  return isPattern(isStringFiniteRegExp, {
    expected: "a string representing a finite number",
    representation: {
      id: "effect/schema/isStringFinite",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: isStringFiniteRegExp.source
    }),
    ...annotations
  });
}
var finiteString = /* @__PURE__ */ appendChecks(string2, [/* @__PURE__ */ isStringFinite()]);
var finiteToString = /* @__PURE__ */ new Link(finiteString, numberFromString);
var numberToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finiteString, nonFiniteLiterals]), numberFromString);
var BIGINT_PATTERN = "-?\\d+";
var isStringBigIntRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${BIGINT_PATTERN}$`);
var REGEXP_PATTERN = "Symbol\\(([\\s\\S]*)\\)";
var isStringSymbolRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${REGEXP_PATTERN}$`);
function collectIssues(checks, value, issues, ast, options) {
  for (let i = 0;i < checks.length; i++) {
    const check = checks[i];
    if (check._tag === "FilterGroup") {
      issues = collectIssues(check.checks, value, issues, ast, options);
      if (issues && (options.errors !== "all" || issues[issues.length - 1].filter.aborted)) {
        return issues;
      }
    } else {
      const issue = check.run(value, ast, options);
      if (issue) {
        const filter = new Filter(check, issue, value, options);
        if (issues)
          issues.push(filter);
        else
          issues = [filter];
        if (options.errors !== "all" || check.aborted) {
          return issues;
        }
      }
    }
  }
  return issues;
}
function getConstructorDescriptor(ast) {
  if (!isDeclaration(ast))
    return;
  const getDescriptor = ast.annotations?.[CONSTRUCTOR_ANNOTATION_KEY];
  return isFunction(getDescriptor) ? getDescriptor(ast.typeParameters) : undefined;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/interpreter.js
var flatMapTransformation = (result, current, f) => result === sameExit ? f(current) : flatMapEager2(result, f);
function compileTransformation(transformation) {
  if (transformation._tag === "Middleware") {
    return (result, current, options) => {
      const transformed = result === sameExit ? transformation.decode(succeed6(toOption(current)), options) : transformation.decode(mapEager2(result, toOption), options);
      return fromOptionalEffect(transformed);
    };
  }
  const getter = transformation.decode;
  switch (getter._tag) {
    case "Passthrough":
      return (result, current) => result === sameExit ? succeed6(current) : result;
    case "Transform": {
      const transform = (value) => value === missing ? missingExit : succeed6(getter.transform(value));
      return (result, current) => flatMapTransformation(result, current, transform);
    }
    case "TransformOptional": {
      const transform = (value) => fromOptionExit(getter.transform(toOption(value)));
      return (result, current) => flatMapTransformation(result, current, transform);
    }
    case "TransformEffect":
      return (result, current, options) => flatMapTransformation(result, current, (value) => value === missing ? missingExit : getter.transform(value, options));
    case "TransformOptionalEffect":
      return (result, current, options) => flatMapTransformation(result, current, (value) => fromOptionalEffect(getter.transform(toOption(value), options)));
  }
}
var fromOptionalEffect = (effect) => flatMapEager2(effect, fromOptionExit);
var wrapEncoding = (ast, input, options, effect) => catchCause2(effect, (cause) => failCauseSync2(() => map3(cause, (issue) => new Encoding(ast, issue, input, options))));
function makeConstructorParser(descriptor, compile) {
  const transform = compileTransformation(descriptor.link.transformation);
  let sourceParser;
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (descriptor.isConstructed(input))
      return sameExit;
    const result = (sourceParser ??= compile(descriptor.link.to))(input, options);
    return transform(result, input, options);
  };
}
function withDefault2(ast, parser) {
  const defaultValue = ast.context.constructorDefault;
  return (input, options) => {
    if (input !== missing && input !== undefined)
      return parser(input, options);
    const result = defaultValue;
    if (effectIsExit(result) && result._tag === "Success") {
      const local = parser(result[args], options);
      return local === sameExit ? result : local;
    }
    return flatMapEager2(wrapEncoding(ast, input, options, result), (value) => {
      const local = parser(value, options);
      return local === sameExit ? succeed6(value) : local;
    });
  };
}
function compileField(ast, compile) {
  const parser = compile(ast);
  return ast.context?.constructorDefault === undefined ? parser : withDefault2(ast, parser);
}
function compile(ast, compile, compileField, base, specialize) {
  if (ast._tag === "Declaration") {
    for (const parameter of ast.typeParameters)
      compile(parameter);
  }
  const descriptor = compileField ? getConstructorDescriptor(ast) : undefined;
  const parser = descriptor ? makeConstructorParser(descriptor, compile) : base ?? ast.getParser(compile, compileField);
  const checks = ast.checks;
  const links = ast.encoding;
  const transformations = links?.map((link) => compileTransformation(link.transformation));
  const encodingChecks = ast.encodingChecks;
  if (!links && !checks && !encodingChecks) {
    return parser;
  }
  let encodingParsers;
  const parseChecks = (input, options) => {
    let result = parser(input, options);
    if (encodingChecks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const output = result === sameExit ? input : result[args];
          if (input !== missing && output !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              result = fail5(new Composite(ast, issues, input, options));
            }
          }
        }
      } else {
        result = flatMap2(result, (value) => {
          if (input !== missing && value !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues, input, options));
            }
          }
          return succeed5(value);
        });
      }
    }
    if (checks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const value = result === sameExit ? input : result[args];
          if (value === missing)
            return result;
          const issues = collectIssues(checks, value, undefined, ast, options);
          if (issues) {
            result = fail5(new Composite(ast, issues, value, options));
          }
        }
      } else {
        result = flatMap2(result, (value) => {
          if (value !== missing) {
            const issues = collectIssues(checks, value, undefined, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues, value, options));
            }
          }
          return succeed5(value);
        });
      }
    }
    return result;
  };
  const parseLocal = specialize === undefined ? parseChecks : specialize(parseChecks);
  if (!links) {
    return parseLocal;
  }
  return (input, options) => {
    const parsers = encodingParsers ??= links.map((link) => compile(link.to));
    let current = input;
    let result = parsers[parsers.length - 1](input, options);
    for (let i = links.length - 1;i >= 0; i--) {
      result = transformations[i](result, current, options);
      if (i !== 0) {
        const next = parsers[i - 1];
        if (result._tag === "Success") {
          current = result[args];
          result = next(current, options);
        } else {
          result = flatMapEager2(result, (value) => {
            const nextResult = next(value, options);
            return nextResult === sameExit ? succeed6(value) : nextResult;
          });
        }
      }
    }
    if (result._tag === "Success") {
      const value = result[args];
      const local = parseLocal(value, options);
      return local === sameExit ? result : local;
    }
    result = wrapEncoding(ast, input, options, result);
    return flatMapEager2(result, (value) => {
      const local = parseLocal(value, options);
      return local === sameExit ? succeed6(value) : local;
    });
  };
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/compilerRegistry.js
var invalid2 = /* @__PURE__ */ Symbol();
var cache = /* @__PURE__ */ new WeakMap;
var compiler;
var compilerAdaptersEnabled = false;
var decodeChild = (ast) => compilerAdaptersEnabled ? lazyParser(resolve2, ast, "parser") : resolve2(ast).parser;
var makeChild = (ast) => compilerAdaptersEnabled ? lazyParser(resolve2, ast, "makeEffect") : resolve2(ast).makeEffect;
var makeField = (ast) => compileField(ast, makeChild);

class InterpretedEntry {
  ast;
  constructor(ast) {
    this.ast = ast;
  }
  get decodeEffect() {
    return this.cachedDecodeEffect ??= compile(this.ast, decodeChild);
  }
  get parser() {
    return this.decodeEffect;
  }
  get makeEffect() {
    return this.cachedMakeEffect ??= compile(this.ast, makeChild, makeField);
  }
}

class CompilerEntry extends InterpretedEntry {
  compiled;
  resolve;
  constructor(ast, compiled, resolve) {
    super(ast);
    this.compiled = compiled;
    this.resolve = resolve;
  }
  save(key, value) {
    Object.defineProperty(this, key, {
      value
    });
    return value;
  }
  operation(key) {
    const compiled = this.compiled;
    return typeof compiled === "function" ? compiled(this.ast, this.resolve, key) : compiled?.[key];
  }
  get is() {
    return this.save("is", this.operation("is"));
  }
  get decode() {
    return this.save("decode", this.operation("decode"));
  }
  get make() {
    return this.save("make", this.operation("make"));
  }
  get decodeEffect() {
    return this.save("decodeEffect", this.operation("decodeEffect") ?? compile(this.ast, (ast) => lazyParser(this.resolve, ast, "parser")));
  }
  get parser() {
    const decode = this.decode;
    return decode === undefined ? this.decodeEffect : this.save("parser", withDecode(decode, () => this.decodeEffect));
  }
  get makeEffect() {
    const makeEffect = this.operation("makeEffect");
    if (makeEffect !== undefined)
      return this.save("makeEffect", makeEffect);
    const child = (ast) => lazyParser(this.resolve, ast, "makeEffect");
    return this.save("makeEffect", compile(this.ast, child, (ast) => compileField(ast, child)));
  }
}
function withDecode(fastDecode, decodeEffect) {
  let detailed;
  return (input, options) => {
    if (input !== missing) {
      try {
        const value = fastDecode(input, options);
        if (value !== invalid2)
          return value === input ? sameExit : succeed6(value);
      } catch (error) {
        return die3(error);
      }
    }
    return (detailed ??= decodeEffect())(input, options);
  };
}
function lazyParser(resolve, ast, operation) {
  const entry = resolve(ast);
  if (entry.compiled === undefined || Object.hasOwn(entry, operation)) {
    return entry[operation];
  }
  let parser;
  return (input, options) => (parser ??= entry[operation])(input, options);
}
function resolve2(ast) {
  const cached = cache.get(ast);
  if (cached !== undefined)
    return cached;
  const entry = compiler === undefined ? new InterpretedEntry(ast) : new CompilerEntry(ast, compiler(ast, resolve2), resolve2);
  cache.set(ast, entry);
  return entry;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/SchemaParser.js
function makeEffect(schema) {
  const ast = schema.ast;
  let parser;
  return (input, options) => {
    return (parser ??= runWithCompiler(constructorCompiler, toType(ast)))(input, options?.disableChecks ? options?.parseOptions ? {
      ...options.parseOptions,
      disableChecks: true
    } : {
      disableChecks: true
    } : options?.parseOptions);
  };
}
function makeOption(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit = runSyncExit2(parser(input, options));
    if (isSuccess3(exit)) {
      return some2(exit.value);
    }
    getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues");
    return none2();
  };
}
function make4(schema) {
  return makeConstructorSync(toType(schema.ast));
}
function decodeUnknownEffect(schema, options) {
  const parser = run(schema.ast);
  return options === undefined ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
function decodeUnknownOption(schema, options) {
  return asOption(decodeUnknownEffect(schema, options));
}
function encodeUnknownEffect(schema, options) {
  const parser = run(flip2(schema.ast));
  return options === undefined ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
var mergeParseOptions = (options, overrideOptions) => overrideOptions ? {
  ...options,
  ...overrideOptions
} : options;
var getValue = (value) => {
  if (value === missing) {
    return fail5(new InvalidValue);
  }
  return succeed5(value);
};
function run(ast) {
  return runWithCompiler(normalCompiler, ast);
}
function parserResult(result, input) {
  if (result === sameExit) {
    return succeed5(input);
  }
  if (!effectIsExit(result)) {
    return flatMapEager2(result, getValue);
  }
  return result[args] === missing ? getValue(missing) : result;
}
function runWithCompiler(compiler, ast) {
  let parser;
  return (input, options) => {
    const result = (parser ??= compiler(ast))(input, options ?? defaultParseOptions);
    if (result === sameExit) {
      return succeed5(input);
    }
    if (!effectIsExit(result)) {
      return flatMapEager2(result, getValue);
    }
    return result[args] === missing ? getValue(missing) : result;
  };
}
function asExit(parser) {
  return (input, options) => runSyncExit2(parser(input, options));
}
function asOption(parser) {
  const parserExit = asExit(parser);
  return (input, options) => {
    const exit = parserExit(input, options);
    if (isSuccess3(exit)) {
      return some2(exit.value);
    }
    getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues");
    return none2();
  };
}
function runSync2(effect, message) {
  const exit = runSyncExit2(effect);
  if (isSuccess3(exit)) {
    return exit.value;
  }
  const issue = getSchemaIssueOrThrow(exit.cause, message);
  throw new Error("Schema validation failed", {
    cause: issue
  });
}
function makeConstructorSync(ast) {
  let entry;
  let parser;
  return (input, options) => {
    entry ??= resolve2(ast);
    const parseOptions = options?.disableChecks ? options.parseOptions ? {
      ...options.parseOptions,
      disableChecks: true
    } : {
      disableChecks: true
    } : options?.parseOptions ?? defaultParseOptions;
    const make = entry.make;
    if (make !== undefined && input !== missing) {
      let output;
      try {
        output = make(input, parseOptions);
      } catch (error) {
        getSchemaIssueOrThrow(die2(error), "Constructor adapter can only throw schema issues");
        throw error;
      }
      if (output !== invalid2 && output !== missing)
        return output;
    }
    const result = (parser ??= entry.makeEffect)(input, parseOptions);
    return runSync2(parserResult(result, input), "Constructor adapter can only throw schema issues");
  };
}
var normalCompiler = (ast) => resolve2(ast).parser;
var constructorCompiler = (ast) => resolve2(ast).makeEffect;

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schema/make.js
var TypeId9 = "~effect/Schema/Schema";
var RebuildOptions = /* @__PURE__ */ Symbol();
var SchemaProto = {
  [TypeId9]: TypeId9,
  get make() {
    const value = make4(this);
    Object.defineProperty(this, "make", {
      value,
      enumerable: true
    });
    return value;
  },
  get makeEffect() {
    const value = makeEffect(this);
    Object.defineProperty(this, "makeEffect", {
      value,
      enumerable: true
    });
    return value;
  },
  get makeOption() {
    const value = makeOption(this);
    Object.defineProperty(this, "makeOption", {
      value,
      enumerable: true
    });
    return value;
  },
  pipe() {
    return pipeArguments(this, arguments);
  },
  annotate(annotations) {
    return this.rebuild(annotate(this.ast, annotations));
  },
  annotateKey(annotations) {
    return this.rebuild(annotateKey(this.ast, annotations));
  },
  check(...checks) {
    return this.rebuild(appendChecks(this.ast, checks));
  },
  rebuild(ast) {
    return make5(ast, this[RebuildOptions]);
  }
};
function make5(ast, options) {
  function Schema() {}
  const self = Object.setPrototypeOf(Schema, SchemaProto);
  if (options && (Object.hasOwn(options, "name") || Object.hasOwn(options, "length") || Object.hasOwn(options, "__proto__"))) {
    Object.defineProperties(self, Object.getOwnPropertyDescriptors({
      ...options
    }));
  } else {
    Object.assign(self, options);
  }
  self[RebuildOptions] = options;
  self.ast = ast;
  return self;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Struct.js
var omit2 = /* @__PURE__ */ dual(2, (self, keys) => {
  return buildStruct(self, (k, v) => !hasPropertyKey(keys, k) ? [k, v] : undefined);
});
var lambda = (f) => f;
function hasPropertyKey(keys, key) {
  return keys.some((candidate) => candidate === key || typeof candidate === "number" && String(candidate) === key);
}
function buildStruct(source, f) {
  const out = {};
  for (const k of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, k))
      continue;
    const res = f(k, source[k]);
    if (res) {
      const [nk, nv] = res;
      assignProperty(out, nk, nv);
    }
  }
  return out;
}

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/schemaError.js
var SchemaErrorTypeId = "~effect/Schema/SchemaError";

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Schema.js
function declareConstructor() {
  return (typeParameters, run, annotations) => {
    return make6(new Declaration(typeParameters.map(getAST), (typeParameters) => run(typeParameters.map((ast) => make6(ast))), annotations));
  };
}
function declare(is, annotations) {
  return declareConstructor()([], () => (input, ast, options) => is(input) ? succeed5(input) : fail5(new InvalidType(ast, input, options)), annotations);
}
class SchemaError extends (/* @__PURE__ */ TaggedError2("SchemaError")) {
  [SchemaErrorTypeId] = SchemaErrorTypeId;
  constructor(issue) {
    const stackTraceLimit = getStackTraceLimit();
    setStackTraceLimit(0);
    try {
      super({
        issue
      });
    } finally {
      setStackTraceLimit(stackTraceLimit);
    }
  }
  get message() {
    return defaultFormatter(this.issue);
  }
  toJSON() {
    return {
      _tag: this._tag,
      message: this.message
    };
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  toString() {
    return `SchemaError(${this.message})`;
  }
}
function fromIssueEffect(self) {
  if (effectIsExit(self)) {
    return fromIssueExit(self);
  }
  return catchCause2(self, (cause) => failCauseSync2(() => map3(cause, (issue) => new SchemaError(issue))));
}
function fromIssueExit(exit) {
  return isSuccess3(exit) ? exit : failCause2(map3(exit.cause, (issue) => new SchemaError(issue)));
}
function decodeUnknownEffect2(schema, options) {
  const parser = decodeUnknownEffect(schema, options);
  return (input, options) => {
    return fromIssueEffect(parser(input, options));
  };
}
var decodeUnknownOption2 = decodeUnknownOption;
function encodeUnknownEffect2(schema, options) {
  const parser = encodeUnknownEffect(schema, options);
  return (input, options) => {
    return fromIssueEffect(parser(input, options));
  };
}
var encodeEffect = encodeUnknownEffect2;
var make6 = make5;
var optionalKey2 = /* @__PURE__ */ lambda((schema) => make6(optionalKey(schema.ast), {
  schema
}));
var toEncoded2 = /* @__PURE__ */ lambda((schema) => make6(toEncoded(schema.ast), {
  schema
}));
function Literal2(literal) {
  const out = make6(new Literal(literal), {
    literal,
    transform(to) {
      return out.pipe(decodeTo2(Literal2(to), {
        decode: transform(() => to),
        encode: transform(() => literal)
      }));
    }
  });
  return out;
}
var Unknown2 = /* @__PURE__ */ make6(unknown);
var Null2 = /* @__PURE__ */ make6(null_);
var String4 = /* @__PURE__ */ make6(string2);
var Number5 = /* @__PURE__ */ make6(number2);
var Boolean3 = /* @__PURE__ */ make6(boolean);
function makeStruct(ast, fields) {
  return make6(ast, {
    fields,
    mapFields(f, options) {
      const fields = f(this.fields);
      return makeStruct(struct(fields, options?.unsafePreserveChecks ? this.ast.checks : undefined), fields);
    }
  });
}
function Struct(fields) {
  return makeStruct(struct(fields, undefined), fields);
}
function Record(key, value) {
  return make6(record(key.ast, value.ast), {
    key,
    value
  });
}
function makeTuple(ast, elements) {
  return make6(ast, {
    elements,
    mapElements(f, options) {
      const elements = f(this.elements);
      return makeTuple(tuple(elements, options?.unsafePreserveChecks ? this.ast.checks : undefined), elements);
    }
  });
}
function Tuple(elements) {
  return makeTuple(tuple(elements), elements);
}
var ArraySchema = /* @__PURE__ */ lambda((schema) => make6(new Arrays(false, [], [schema.ast]), {
  value: schema
}));
var NonEmptyArray = /* @__PURE__ */ lambda((schema) => make6(new Arrays(false, [schema.ast], [schema.ast]), {
  value: schema
}));
function makeUnion(ast, members) {
  return make6(ast, {
    members,
    mapMembers(f, options) {
      const members = f(this.members);
      return makeUnion(union(members, this.ast.options, options?.unsafePreserveChecks ? this.ast.checks : undefined), members);
    }
  });
}
function Union2(members, options) {
  return makeUnion(union(members, options, undefined), members);
}
function Literals(literals) {
  const members = literals.map(Literal2);
  return make6(union(members, undefined, undefined), {
    literals,
    members,
    mapMembers(f) {
      return Union2(f(this.members));
    },
    pick(literals) {
      return Literals(literals);
    },
    transform(to) {
      return Union2(members.map((member, index) => member.transform(to[index])));
    }
  });
}
var NullOr = /* @__PURE__ */ lambda((self) => Union2([self, Null2]));
function decodeTo2(to, transformation) {
  return (from) => {
    return make6(decodeTo(from.ast, to.ast, transformation ? makeTransformation(transformation) : passthrough3()), {
      from,
      to
    });
  };
}
function withConstructorDefault2(defaultValue) {
  return (schema) => make6(withConstructorDefault(schema.ast, defaultValue), {
    schema
  });
}
function toIssueEffect(self) {
  return catchCause2(self, (cause) => failCauseSync2(() => map3(cause, (error) => error.issue)));
}
function withDecodingDefaultKey(defaultValue, options) {
  const encode = options?.encodingStrategy === "omit" ? omit() : passthrough2();
  return (self) => {
    return optionalKey2(toEncoded2(self)).pipe(decodeTo2(self, {
      decode: withDefault(toIssueEffect(defaultValue)),
      encode
    }));
  };
}
function tag(literal) {
  return Literal2(literal).pipe(withConstructorDefault2(succeed5(literal)));
}
function TaggedStruct(value, fields) {
  return Struct({
    _tag: tag(value),
    ...fields
  });
}
function instanceOf(constructor, annotations) {
  return declare((u) => u instanceof constructor, annotations);
}
function link() {
  return (encodeTo, transformation) => {
    return new Link(encodeTo.ast, makeTransformation(transformation));
  };
}
var makeFilter2 = makeFilter;
function isPattern2(regExp, annotations) {
  const source = regExp.source;
  const flags = regExp.flags;
  const canExport = /^[dg]*uy?$/.test(flags);
  const runtimeRegExp = flags === "" ? `new RegExp(${format(source)})` : `new RegExp(${format(source)}, ${format(flags)})`;
  return isPattern(regExp, {
    toJsonSchema: () => canExport ? {
      pattern: flags.endsWith("y") ? `^(?:${source})` : source
    } : [{}, true],
    toCode: () => ({
      runtime: `Schema.isPattern(${runtimeRegExp})`
    }),
    ...annotations
  });
}
function isBase64(annotations) {
  const regExp = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return isPattern2(regExp, {
    expected: "a base64 encoded string",
    representation: {
      id: "effect/schema/isBase64",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: regExp.source
    }),
    toCode: () => ({
      runtime: "Schema.isBase64()"
    }),
    ...annotations
  });
}
function makeIsGreaterThanOrEqualTo(options) {
  const gte = isGreaterThanOrEqualTo(options.order);
  const formatter = options.formatter ?? format;
  return (minimum, annotations) => {
    return makeFilter2((input) => gte(input, minimum), {
      expected: `a value greater than or equal to ${formatter(minimum)}`,
      arbitraryConstraint: {
        order: options.order,
        minimum
      },
      ...options.annotate?.(minimum),
      ...annotations
    });
  };
}
function encodeNumberPayload(number) {
  if (!globalThis.Number.isFinite(number)) {
    throw new globalThis.RangeError(`Expected a finite number, got ${format(number)}`);
  }
  return number;
}
var isGreaterThanOrEqualTo2 = /* @__PURE__ */ makeIsGreaterThanOrEqualTo({
  order: Number2,
  annotate: (minimum) => ({
    representation: {
      id: "effect/schema/isGreaterThanOrEqualTo",
      payload: {
        minimum: encodeNumberPayload(minimum)
      }
    },
    toJsonSchema: () => ({
      minimum
    }),
    toCode: () => ({
      runtime: `Schema.isGreaterThanOrEqualTo(${format(minimum)})`
    })
  })
});
function isInt(annotations) {
  return makeFilter2((n) => globalThis.Number.isSafeInteger(n), {
    expected: "an integer",
    representation: {
      id: "effect/schema/isInt",
      payload: null
    },
    toJsonSchema: () => ({
      type: "integer",
      minimum: globalThis.Number.MIN_SAFE_INTEGER,
      maximum: globalThis.Number.MAX_SAFE_INTEGER
    }),
    toCode: () => ({
      runtime: "Schema.isInt()"
    }),
    arbitraryConstraint: {
      number: "integer"
    },
    ...annotations
  });
}
var Int = /* @__PURE__ */ Number5.check(/* @__PURE__ */ isInt());
var RegExp2 = /* @__PURE__ */ instanceOf(globalThis.RegExp, {
  representation: {
    id: "effect/schema/RegExp",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.RegExp`,
    Type: `globalThis.RegExp`
  }),
  expected: "RegExp",
  toCodecJson: () => link()(Struct({
    source: String4,
    flags: String4
  }), transformEffect2({
    decode: (e, options) => try_2({
      try: () => new globalThis.RegExp(e.source, e.flags),
      catch: () => new InvalidValue({
        expected: "valid RegExp source and flags"
      }, e, options)
    }),
    encode: (regExp) => succeed5({
      source: regExp.source,
      flags: regExp.flags
    })
  }))
});
var URLString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as a URL"
});
var URL2 = /* @__PURE__ */ instanceOf(globalThis.URL, {
  representation: {
    id: "effect/schema/URL",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URL`,
    Type: `globalThis.URL`
  }),
  expected: "URL",
  toCodecJson: () => link()(URLString, urlFromString)
});
var JsonString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as JSON",
  contentMediaType: "application/json"
});
function fromJsonString2(schema, options) {
  return JsonString.pipe(decodeTo2(schema, fromJsonString(options)));
}
var File = /* @__PURE__ */ instanceOf(globalThis.File, {
  representation: {
    id: "effect/schema/File",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.File`,
    Type: `globalThis.File`
  }),
  expected: "File",
  toCodecJson: () => link()(Struct({
    data: String4.check(isBase64()),
    type: String4,
    name: String4,
    lastModified: Int
  }), transformEffect2({
    decode: (e, options) => match(decode(e.data), {
      onFailure: () => fail5(new InvalidValue({
        expected: "a valid Base64 string"
      }, e.data, options)),
      onSuccess: (bytes) => {
        const buffer = new globalThis.Uint8Array(bytes);
        return succeed5(new globalThis.File([buffer], e.name, {
          type: e.type,
          lastModified: e.lastModified
        }));
      }
    }),
    encode: (file, options) => tryPromise2({
      try: async () => {
        const bytes = new globalThis.Uint8Array(await file.arrayBuffer());
        return {
          data: encode(bytes),
          type: file.type,
          name: file.name,
          lastModified: file.lastModified
        };
      },
      catch: () => new InvalidValue({
        expected: "a readable File"
      }, file, options)
    })
  }))
});
var FormData2 = /* @__PURE__ */ instanceOf(globalThis.FormData, {
  representation: {
    id: "effect/schema/FormData",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.FormData`,
    Type: `globalThis.FormData`
  }),
  expected: "FormData",
  toCodecJson: () => link()(ArraySchema(Tuple([String4, Union2([Struct({
    _tag: tag("String"),
    value: String4
  }), Struct({
    _tag: tag("File"),
    value: File
  })])])), transformEffect2({
    decode: (e) => {
      const out = new globalThis.FormData;
      for (const [key, entry] of e) {
        out.append(key, entry.value);
      }
      return succeed5(out);
    },
    encode: (formData) => {
      return succeed5(globalThis.Array.from(formData.entries()).map(([key, value]) => {
        if (typeof value === "string") {
          return [key, {
            _tag: "String",
            value
          }];
        } else {
          return [key, {
            _tag: "File",
            value
          }];
        }
      }));
    }
  }))
});
var URLSearchParams2 = /* @__PURE__ */ instanceOf(globalThis.URLSearchParams, {
  representation: {
    id: "effect/schema/URLSearchParams",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URLSearchParams`,
    Type: `globalThis.URLSearchParams`
  }),
  expected: "URLSearchParams",
  toCodecJson: () => link()(String4.annotate({
    expected: "a query string that will be decoded as URLSearchParams"
  }), transform2({
    decode: (e) => new globalThis.URLSearchParams(e),
    encode: (params) => params.toString()
  }))
});
var Base64String = /* @__PURE__ */ String4.annotate({
  expected: "a base64 encoded string that will be decoded as Uint8Array",
  format: "byte",
  contentEncoding: "base64"
});
var Uint8Array2 = /* @__PURE__ */ instanceOf(globalThis.Uint8Array, {
  representation: {
    id: "effect/schema/Uint8Array",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.Uint8Array`,
    Type: `globalThis.Uint8Array`
  }),
  expected: "Uint8Array",
  toCodecJson: () => link()(Base64String, uint8ArrayFromBase64String)
});
var arbitraryMinimumDateTimestamp = -8640000000000000;
var arbitraryMaximumDateTimestamp = 8640000000000000;
var arbitraryMinimumZonedDateTimeTimestamp = arbitraryMinimumDateTimestamp + 14 * 60 * 60 * 1000;
var arbitraryMaximumZonedDateTimeTimestamp = arbitraryMaximumDateTimestamp - 14 * 60 * 60 * 1000;
var arbitraryMinimumTimeZoneOffset = -12 * 60 * 60 * 1000;
var arbitraryMaximumTimeZoneOffset = 14 * 60 * 60 * 1000;
// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/MutableRef.js
var TypeId10 = "~effect/MutableRef";
var MutableRefProto = {
  [TypeId10]: TypeId10,
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "MutableRef",
      current: toJson(this.current)
    };
  }
};
var make7 = (value) => {
  const ref = Object.create(MutableRefProto);
  ref.current = value;
  return ref;
};

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Channel.js
var TypeId11 = "~effect/Channel";
var ChannelProto = {
  [TypeId11]: {
    _Env: identity,
    _InErr: identity,
    _InElem: identity,
    _OutErr: identity,
    _OutElem: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromTransform = (transform) => {
  const self = Object.create(ChannelProto);
  self.transform = (upstream, scope) => catchCause2(transform(upstream, scope), (cause) => succeed5(failCause3(cause)));
  return self;
};
var toTransform = (channel) => channel.transform;
var fromReadableStream = (options) => fromTransform((_, scope) => readableStreamToPullUnsafe({
  scope,
  readable: options.evaluate(),
  onError: options.onError,
  releaseLockOnEnd: options.releaseLockOnEnd
}));
var readableStreamToPullUnsafe = (options) => {
  const reader = options.readable.getReader();
  const exit = options.exit ?? make7(undefined);
  const pull = suspend2(() => {
    if (exit.current)
      return exit.current;
    return matchCauseEffect2(tryPromise2({
      try: () => reader.read(),
      catch: options.onError
    }), {
      onFailure: (cause) => exit.current ?? failCause3(cause),
      onSuccess: ({
        done,
        value
      }) => {
        if (exit.current)
          return exit.current;
        return done ? done2() : succeed5(of(value));
      }
    });
  });
  return as2(addFinalizer(options.scope, options.releaseLockOnEnd ? sync2(() => reader.releaseLock()) : promise2(() => reader.cancel().catch(constVoid))), pull);
};
var runWith = (self, f, onHalt) => suspend2(() => {
  const scope = makeUnsafe2();
  const makePull = toTransform(self)(done2(), scope);
  return catchDone(flatMap2(makePull, f), onHalt ? onHalt : succeed5).pipe(onExit2((exit) => close(scope, exit)));
});
var runForEach = /* @__PURE__ */ dual(2, (self, f) => runWith(self, (pull) => forever3(flatMap2(pull, f), {
  disableYield: true
})));
// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/internal/stream.js
var TypeId12 = "~effect/Stream";
var streamVariance = {
  _R: identity,
  _E: identity,
  _A: identity
};
var Stream = function(channel) {
  this.channel = channel;
};
Stream.prototype = {
  [TypeId12]: streamVariance,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromChannel = (channel) => new Stream(channel);

// ../../node_modules/.bun/effect@4.0.4/node_modules/effect/dist/Stream.js
var fromChannel2 = fromChannel;
var fromReadableStream2 = (options) => fromChannel2(fromReadableStream(options));
var runForEach2 = /* @__PURE__ */ dual(2, (self, f) => runForEach(self.channel, (arr) => {
  let i = 0;
  return whileLoop2({
    while: () => i < arr.length,
    body: () => f(arr[i++]),
    step: constVoid
  });
}));
// package.json
var package_default = {
  name: "@holyclaude/cli",
  version: "0.1.0",
  description: "The holyclaude command line: Intent and Assignment state, plugin hooks.",
  license: "Apache-2.0",
  bin: {
    holyclaude: "./src/main.ts"
  },
  type: "module",
  scripts: {
    build: "mise run build"
  },
  dependencies: {
    "@holyclaude/core": "workspace:*",
    "@toon-format/toon": "^4.0.0",
    effect: "^4.0.0"
  }
};

// src/errors.ts
class Usage extends TaggedError2("Usage") {
}

class NotBound extends TaggedError2("NotBound") {
  get message() {
    return `Assignment ${this.id} has no bound agent`;
  }
}

class StdinMissing extends TaggedError2("StdinMissing") {
  get message() {
    return `${this.command} reads JSON from stdin and none was provided`;
  }
}

// src/args.ts
var stringFlag = (parsed, name) => {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
};
var booleanFlag = (parsed, name) => parsed.flags[name] === true;
var listFlag = (parsed, name) => {
  const value = parsed.flags[name];
  return Array.isArray(value) ? value : [];
};
var parseArgs = (args, spec, usage) => gen2(function* () {
  const positionals = [];
  const flags = {};
  for (let index = 0;index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--") || arg === "--") {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const kind = spec[name];
    if (kind === undefined)
      return yield* new Usage({
        message: `Unknown flag --${name}`,
        hint: `Usage: holyclaude ${usage}`
      });
    if (kind === "boolean") {
      flags[name] = equals === -1 ? true : arg.slice(equals + 1) !== "false";
      continue;
    }
    const value = equals === -1 ? args[++index] : arg.slice(equals + 1);
    if (value === undefined)
      return yield* new Usage({
        message: `Flag --${name} needs a value`,
        hint: `Usage: holyclaude ${usage}`
      });
    if (kind === "list") {
      const existing = flags[name];
      flags[name] = [...Array.isArray(existing) ? existing : [], value];
    } else
      flags[name] = value;
  }
  const parsed = { positionals, flags };
  return parsed;
});

// ../core/src/codec.ts
var MAX_GITIGNORE_BYTES = 256 * 1024;
var OBSERVATIONS_ROTATE_BYTES = 1024 * 1024;
var OBSERVATIONS_READ_BYTES = 4 * 1024 * 1024;
var MAX_LEGACY_STATE_BYTES = 1024 * 1024;
var strict = { onExcessProperty: "error" };
var decodeStrict = (schema) => decodeUnknownEffect2(schema, strict);
var decodeJsonStrict = (schema) => decodeUnknownEffect2(fromJsonString2(schema), strict);
// ../core/src/errors.ts
class UnknownRecord extends TaggedError2("UnknownRecord") {
  get message() {
    return `Unknown ${this.kind} ${this.id}`;
  }
}

class InvalidRecord extends TaggedError2("InvalidRecord") {
}

class InvalidPath extends TaggedError2("InvalidPath") {
  get message() {
    return `Invalid path "${this.path}": ${this.reason}`;
  }
}

class InvalidWorktree extends TaggedError2("InvalidWorktree") {
  get message() {
    return `Invalid worktree "${this.path}": ${this.reason}`;
  }
}

class StaleRevision extends TaggedError2("StaleRevision") {
  get message() {
    return `Stale intent revision ${this.given}; the live revision is ${this.live}`;
  }
}

class IntentClosed extends TaggedError2("IntentClosed") {
  get message() {
    return `Intent ${this.intent_id} is closed; \`holyclaude intent reopen --intent ${this.intent_id}\` opens it again`;
  }
}

class IntentBusy extends TaggedError2("IntentBusy") {
  get message() {
    return `Intent ${this.intent_id} has Running Assignments (${this.running.join(", ")}); settle them before closing it`;
  }
}

class NoActiveIntent extends TaggedError2("NoActiveIntent") {
  get message() {
    return this.open.length === 0 ? "No Intent is open; create one with `holyclaude intent create`, or reopen one with `holyclaude intent reopen --intent <id>`" : `Several Intents are open and none is in use; run \`holyclaude intent use <id>\` or pass --intent <id>. Open Intents: ${this.open.map((intent) => `${intent.id} (${intent.objective.replace(/\s+/g, " ")})`).join("; ")}`;
  }
}

class NoRevision extends TaggedError2("NoRevision") {
  get message() {
    return `Intent ${this.intent_id} has no valid revision; update it with a material change first`;
  }
}

class InvalidTransition extends TaggedError2("InvalidTransition") {
  get message() {
    return `Cannot ${this.action} ${this.id} while it is ${this.state}`;
  }
}

class DispatchRefused extends TaggedError2("DispatchRefused") {
  get message() {
    return `Dispatch of ${this.id} refused (${this.reason}): ${this.detail}`;
  }
}

class Conflict extends TaggedError2("Conflict") {
  get message() {
    return `${this.id} already has a different recorded ${this.what}`;
  }
}

class InsufficientEvidence extends TaggedError2("InsufficientEvidence") {
  get message() {
    return `Acceptance of ${this.id} rejected: ${this.detail}`;
  }
}

class TooLarge extends TaggedError2("TooLarge") {
  get message() {
    return `${this.subject} is ${this.bytes} bytes; the limit is ${this.limit}`;
  }
}

class StateLocked extends TaggedError2("StateLocked") {
  get message() {
    return `State is locked by another process. If none is running, delete ${this.lockFile} (and ${this.lockFile}.breaking if it exists)`;
  }
}

class LockLost extends TaggedError2("LockLost") {
  get message() {
    return `Lock ${this.lockFile} was taken over before the write was committed; nothing was written. Retry the operation`;
  }
}

class CorruptRecord extends TaggedError2("CorruptRecord") {
  get message() {
    return `${this.path} is not a valid state file: ${this.reason}`;
  }
}

class SymlinkRefused extends TaggedError2("SymlinkRefused") {
  get message() {
    return `${this.path} is a symbolic link; nothing under the state directory may be one`;
  }
}

class MigratedFileInTheWay extends TaggedError2("MigratedFileInTheWay") {
  get message() {
    return `${this.path} already exists and differs from the state file waiting to be migrated; nothing was migrated. Move ${this.path} away, then rerun`;
  }
}

class OwnedElsewhere extends TaggedError2("OwnedElsewhere") {
  get message() {
    return `${this.id} is running for clone ${this.clone_id}, not this one; its own root settles it. Use \`holyclaude reconcile resolve ${this.id}\` to settle it from here`;
  }
}

class StateIo extends TaggedError2("StateIo") {
  get message() {
    return `State I/O failed for ${this.path}: ${String(this.cause)}`;
  }
}
// ../core/src/io.ts
var attempt = (run) => tryPromise2({ try: run, catch: (cause) => cause });
var io = (path, run) => attempt(run).pipe(mapError2((cause) => new StateIo({ path, cause })));
var hasCode = (cause, code) => typeof cause === "object" && cause !== null && ("code" in cause) && cause.code === code;
var attemptTransient = (run) => attempt(run).pipe(retry2({
  schedule: exponential("5 millis", 2),
  times: 4,
  while: (cause) => hasCode(cause, "EPERM") || hasCode(cause, "EBUSY")
}));
var readText = (path, limit) => gen2(function* () {
  const file = Bun.file(path);
  if (!(yield* io(path, () => file.exists())))
    return;
  if (limit === undefined)
    return yield* io(path, () => file.text());
  if (file.size > limit)
    return yield* new TooLarge({ subject: path, bytes: file.size, limit });
  const bytes = yield* io(path, () => file.slice(0, limit + 1).bytes());
  if (bytes.byteLength > limit)
    return yield* new TooLarge({ subject: path, bytes: bytes.byteLength, limit });
  return new TextDecoder().decode(bytes);
});
var NEWLINE = 10;
var readTail = (path, limit) => gen2(function* () {
  const file = Bun.file(path);
  if (!(yield* io(path, () => file.exists())))
    return;
  const start = Math.max(0, file.size - limit);
  const bytes = yield* io(path, () => file.slice(start).bytes());
  if (start === 0)
    return new TextDecoder().decode(bytes);
  const lineBreak = bytes.indexOf(NEWLINE);
  return lineBreak === -1 ? "" : new TextDecoder().decode(bytes.subarray(lineBreak + 1));
});
// ../core/src/layout.ts
import { join as join2 } from "path";

// ../core/src/safety.ts
import { lstat } from "fs/promises";
import { join, relative, sep } from "path";
var lstatIfPresent = (path) => attempt(() => lstat(path)).pipe(catch_2((cause) => hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR") ? succeed5(undefined) : fail5(new StateIo({ path, cause }))));
var refuseSymlinks = (directory, path) => gen2(function* () {
  const parts = relative(directory, path).split(sep).filter((part) => part !== "" && part !== ".");
  let current = directory;
  for (const part of [undefined, ...parts]) {
    if (part !== undefined)
      current = join(current, part);
    const info = yield* lstatIfPresent(current);
    if (info === undefined)
      return;
    if (info.isSymbolicLink())
      return yield* new SymlinkRefused({ path: current });
  }
});

// ../core/src/layout.ts
var STORE_DIRECTORY = ".holyclaude";
var LOCAL_DIRECTORY = "local";
var LEGACY_FILE = "state.json";
var MIGRATED_FILE = "state.json.migrated";
var projectRoot = (env = process.env) => env["CLAUDE_PROJECT_DIR"] || process.cwd();
var stateDirPath = (env = process.env) => env["HOLYCLAUDE_STATE_DIR"] || join2(projectRoot(env), STORE_DIRECTORY);
var intentFile = (directory, intentId) => join2(directory, "intents", intentId, "intent.json");
var assignmentFile = (directory, intentId, id) => join2(directory, "intents", intentId, "assignments", `${id}.json`);
var localFile = (directory, name) => join2(directory, LOCAL_DIRECTORY, name);
var observationsFile = (directory) => localFile(directory, "observations.jsonl");
var previousObservationsFile = (directory) => localFile(directory, "observations.1.jsonl");
var lockFile = (directory) => localFile(directory, "lock");
var legacyFile = (directory) => join2(directory, LEGACY_FILE);
var migratedFile = (directory) => join2(directory, MIGRATED_FILE);
var legacyLockFiles = (directory) => [
  join2(directory, `${LEGACY_FILE}.lock`),
  join2(directory, `${LEGACY_FILE}.lock.breaking`)
];
var IGNORE_RULES = [
  `/${LOCAL_DIRECTORY}/`,
  "*.tmp",
  `/${MIGRATED_FILE}`,
  `/${LEGACY_FILE}`,
  `/${LEGACY_FILE}.lock*`,
  "/state.observations.jsonl"
].join(`
`) + `
`;
var LOCAL_IGNORE_RULES = `*
`;
var LOCAL_IGNORE_READ_BYTES = 16;
var ensureLocalDirectory = (directory) => {
  const path = localFile(directory, ".gitignore");
  return refuseSymlinks(directory, path).pipe(andThen2(readText(path, LOCAL_IGNORE_READ_BYTES)), catchTag2("TooLarge", () => succeed5(undefined)), flatMap2((current) => current === LOCAL_IGNORE_RULES ? void_3 : io(path, () => Bun.write(path, LOCAL_IGNORE_RULES))), asVoid2);
};
var LEGACY_IGNORE_RULES = `*
`;
var keepLocalFilesOutOfVersionControl = (directory) => {
  const path = join2(directory, ".gitignore");
  return refuseSymlinks(directory, path).pipe(andThen2(readText(path, MAX_GITIGNORE_BYTES)), map4((current) => current === undefined || current === LEGACY_IGNORE_RULES ? IGNORE_RULES : undefined), flatMap2((rules) => rules === undefined ? void_3 : io(path, () => Bun.write(path, rules))), asVoid2);
};
// ../core/src/lock.ts
import { open, rm, stat } from "fs/promises";
import { hostname } from "os";

// ../core/src/model/primitives.ts
var Text = String4.check(isPattern2(/\S/));
var Id = Text;
var Labels = NonEmptyArray(Text);
var Revision = Int.check(isGreaterThanOrEqualTo2(1));
var StoredRevision = Int.check(isGreaterThanOrEqualTo2(0)).pipe(withDecodingDefaultKey(succeed5(0)));
var TextList = ArraySchema(Text).pipe(withDecodingDefaultKey(succeed5([])));

// ../core/src/lock.ts
var LOCK_STALE_MS = 30000;
var MAX_OWNER_BYTES = 4 * 1024;
var LockOwner = Struct({
  pid: Int.check(isGreaterThanOrEqualTo2(1)),
  host: Text,
  token: Text,
  acquired_at: Int
});
var readOwner = (file) => readText(file, MAX_OWNER_BYTES).pipe(flatMap2((text) => text === undefined ? succeed5(undefined) : decodeJsonStrict(LockOwner)(text)), orElseSucceed2(() => {
  return;
}));
var ownsFile = (file, token) => readOwner(file).pipe(map4((owner) => owner?.token === token));
var processAlive = (pid) => try_2({ try: () => process.kill(pid, 0), catch: (cause) => cause }).pipe(as2(true), catch_2((cause) => succeed5(!hasCode(cause, "ESRCH"))));
var isStale = (file, owner) => gen2(function* () {
  if (owner !== undefined && owner.host === hostname())
    return !(yield* processAlive(owner.pid));
  const { mtimeMs } = yield* attempt(() => stat(file));
  return (yield* currentTimeMillis2) - mtimeMs > LOCK_STALE_MS;
});
var createExclusively = (file, content) => attemptTransient(() => open(file, "wx")).pipe(flatMap2((handle) => attempt(() => handle.writeFile(content)).pipe(tapError2(() => attempt(() => rm(file, { force: true })).pipe(ignore2)), ensuring2(attempt(() => handle.close()).pipe(ignore2)))));
var claim = (file) => gen2(function* () {
  const owner = {
    pid: process.pid,
    host: hostname(),
    token: crypto.randomUUID(),
    acquired_at: yield* currentTimeMillis2
  };
  const content = yield* encodeEffect(fromJsonString2(LockOwner))(owner).pipe(orDie2);
  yield* createExclusively(file, content);
  return owner.token;
});
var releaseIfOwned = (file, token) => ownsFile(file, token).pipe(flatMap2((owns) => owns ? attempt(() => rm(file, { force: true })) : void_3), ignore2);
var removeIfStale = (file) => gen2(function* () {
  const judged = yield* readOwner(file);
  if (!(yield* isStale(file, judged)))
    return false;
  if ((yield* readOwner(file))?.token !== judged?.token)
    return false;
  yield* attempt(() => rm(file));
  return true;
}).pipe(orElseSucceed2(() => false));
var breakStaleLock = (lockFile) => {
  const guard = `${lockFile}.breaking`;
  return acquireUseRelease2(claim(guard), () => removeIfStale(lockFile), (token) => releaseIfOwned(guard, token)).pipe(catch_2(() => removeIfStale(guard).pipe(as2(false))));
};
var acquireLock = (directory, lockFile) => {
  const create = claim(lockFile).pipe(mapError2((cause) => hasCode(cause, "EEXIST") ? new StateLocked({ lockFile }) : new StateIo({ path: lockFile, cause })), map4((token) => ({ directory, file: lockFile, token })));
  return create.pipe(catchTag2("StateLocked", (locked) => breakStaleLock(lockFile).pipe(andThen2(fail5(locked)))), retry2({
    schedule: exponential("10 millis", 1.5),
    times: 15,
    while: (error) => error._tag === "StateLocked"
  }));
};
var withStateLock = (directory, use) => {
  const file = lockFile(directory);
  return acquireUseRelease2(refuseSymlinks(directory, `${file}.breaking`).pipe(andThen2(refuseSymlinks(directory, file)), andThen2(ensureLocalDirectory(directory)), andThen2(acquireLock(directory, file))), use, (lock) => releaseIfOwned(lock.file, lock.token));
};
// ../core/src/files.ts
import { rename } from "fs/promises";
var readJson = (schema, path, limit) => readText(path, limit).pipe(flatMap2((text) => text === undefined ? succeed5(undefined) : decodeJsonStrict(schema)(text).pipe(mapError2((error) => new CorruptRecord({ path, reason: error.message })))));
var encodeJson = (schema, value) => encodeEffect(schema)(value).pipe(map4((encoded) => `${JSON.stringify(encoded, null, 2)}
`));
var moveFile = (from, to, lock) => gen2(function* () {
  if (!(yield* ownsFile(lock.file, lock.token)))
    return yield* new LockLost({ lockFile: lock.file });
  yield* refuseSymlinks(lock.directory, from);
  yield* refuseSymlinks(lock.directory, to);
  yield* attemptTransient(() => rename(from, to)).pipe(mapError2((cause) => new StateIo({ path: to, cause })));
});
var deleteIfPresent = (path) => attempt(() => Bun.file(path).delete()).pipe(catch_2((cause) => hasCode(cause, "ENOENT") ? void_3 : fail5(new StateIo({ path, cause }))));
var commitFile = (path, content, lock) => {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  return refuseSymlinks(lock.directory, path).pipe(andThen2(io(path, () => Bun.write(temporary, content))), andThen2(moveFile(temporary, path, lock)), tapError2(() => deleteIfPresent(temporary).pipe(ignore2)));
};
var removeFile = (path, lock) => refuseSymlinks(lock.directory, path).pipe(andThen2(deleteIfPresent(path)));
var NEWLINE2 = 10;
var endsALine = (path) => io(path, async () => {
  const file = Bun.file(path);
  return file.size === 0 || (await file.slice(file.size - 1).bytes())[0] === NEWLINE2;
});
var prependLines = (front, path, lock) => {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const copy = (source, writer) => fromReadableStream2({
    evaluate: () => Bun.file(source).stream(),
    onError: (cause) => new StateIo({ path: source, cause })
  }).pipe(runForEach2((chunk) => io(temporary, async () => {
    await writer.write(chunk);
    await writer.flush();
  })));
  return gen2(function* () {
    yield* refuseSymlinks(lock.directory, path);
    const separator = (yield* endsALine(front)) ? "" : `
`;
    const writer = Bun.file(temporary).writer();
    yield* gen2(function* () {
      yield* copy(front, writer);
      yield* io(temporary, async () => void await writer.write(separator));
      yield* copy(path, writer);
    }).pipe(ensuring2(io(temporary, async () => void await writer.end()).pipe(ignore2)));
    yield* moveFile(temporary, path, lock);
  }).pipe(tapError2(() => deleteIfPresent(temporary).pipe(ignore2)));
};

// ../core/src/model/ids.ts
var TIME_DIGITS = 9;
var RANDOM_DIGITS = 4;
var identifier2 = (kind) => String4.check(isPattern2(new RegExp(`^${kind}-[a-z0-9]+(?:-[a-z0-9]+)*$`)));
var IntentId = identifier2("intent");
var AssignmentId = identifier2("assignment");
var CloneId = identifier2("clone");
var randomDigits = forEach2(Array.from({ length: RANDOM_DIGITS }, (_, index) => index), () => nextIntBetween(0, 35).pipe(map4((digit) => digit.toString(36)))).pipe(map4((digits) => digits.join("")));
var newId = (kind) => gen2(function* () {
  const time = (yield* currentTimeMillis2).toString(36).padStart(TIME_DIGITS, "0");
  return `${kind}-${time}-${yield* randomDigits}`;
});
var compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var legacyCounter = (id) => {
  const digits = /^[a-z]+-(\d+)$/.exec(id)?.[1];
  return digits === undefined ? undefined : BigInt(digits);
};
var compareIds = (a, b) => {
  const first = legacyCounter(a);
  const second = legacyCounter(b);
  if (first !== undefined && second !== undefined)
    return first < second ? -1 : first > second ? 1 : compareText(a, b);
  if (first !== undefined)
    return -1;
  if (second !== undefined)
    return 1;
  return compareText(a, b);
};
var sortedById = (records) => records.toSorted((a, b) => compareIds(a.id, b.id));

// ../core/src/model/routes.ts
var Role = Literals([
  "Explorer.map",
  "Explorer.lookup",
  "Explorer.trace",
  "Librarian.lookup",
  "Librarian.research",
  "Worker.mechanical",
  "Worker.implementation",
  "Worker.integration",
  "Worker.operations",
  "Worker.validation",
  "Worker.debugging",
  "Worker.visual",
  "Reviewer.code",
  "Reviewer.testing",
  "Reviewer.audit",
  "Reviewer.security",
  "Reviewer.artifact",
  "Reviewer.visual"
]);
var Mutability = Literals(["ReadOnly", "ScopedWrite"]);
var Capability = Literals(["Search", "Shell", "VisualInspection", "Write"]);
var Independence = Literals([
  "DisjointWrites",
  "DependenciesTerminal",
  "IndependentReview"
]);
var Model = Literals(["haiku", "sonnet"]);
var Effort = Literals(["medium", "high", "xhigh"]);
var spec = (mutability, capabilities, independence, model, effort) => ({ mutability, capabilities, independence, model, effort });
var SPECS = {
  "Explorer.map": spec("ReadOnly", [], "DisjointWrites", "haiku", "medium"),
  "Explorer.lookup": spec("ReadOnly", [], "DisjointWrites", "haiku", "medium"),
  "Explorer.trace": spec("ReadOnly", [], "DependenciesTerminal", "sonnet", "medium"),
  "Librarian.lookup": spec("ReadOnly", ["Search"], "DisjointWrites", "haiku", "medium"),
  "Librarian.research": spec("ReadOnly", ["Search"], "DependenciesTerminal", "sonnet", "medium"),
  "Worker.mechanical": spec("ScopedWrite", ["Write"], "DisjointWrites", "haiku", "high"),
  "Worker.implementation": spec("ScopedWrite", ["Write"], "DisjointWrites", "sonnet", "high"),
  "Worker.integration": spec("ScopedWrite", ["Write"], "DependenciesTerminal", "sonnet", "high"),
  "Worker.operations": spec("ScopedWrite", ["Shell"], "DisjointWrites", "haiku", "high"),
  "Worker.validation": spec("ReadOnly", ["Shell"], "DependenciesTerminal", "haiku", "high"),
  "Worker.debugging": spec("ScopedWrite", ["Write"], "DependenciesTerminal", "sonnet", "high"),
  "Worker.visual": spec("ScopedWrite", ["Write", "VisualInspection"], "DisjointWrites", "sonnet", "high"),
  "Reviewer.code": spec("ReadOnly", [], "IndependentReview", "sonnet", "high"),
  "Reviewer.testing": spec("ReadOnly", ["Shell"], "IndependentReview", "sonnet", "medium"),
  "Reviewer.audit": spec("ReadOnly", [], "IndependentReview", "haiku", "high"),
  "Reviewer.security": spec("ReadOnly", [], "IndependentReview", "sonnet", "high"),
  "Reviewer.artifact": spec("ReadOnly", [], "IndependentReview", "haiku", "high"),
  "Reviewer.visual": spec("ReadOnly", ["VisualInspection"], "IndependentReview", "sonnet", "high")
};
var routeFor = (role) => ({
  role,
  agent: role.toLowerCase().replace(".", "-"),
  ...SPECS[role]
});
var ROUTES = Role.literals.map(routeFor);

// ../core/src/model/worker.ts
var Worker = Struct({
  agent_id: Id,
  preset: Role,
  fingerprint: Text,
  history: ArraySchema(Id)
});

// ../core/src/local.ts
var WorkersFile = Struct({ workers: ArraySchema(Worker) });
var AgentsFile = Record(AssignmentId, Id);
var WorktreesFile = Record(AssignmentId, Text);
var CloneFile = Struct({ clone_id: CloneId });
var ActiveIntentFile = Struct({ intent_id: IntentId });
var workersPath = (directory) => localFile(directory, "workers.json");
var agentsPath = (directory) => localFile(directory, "agents.json");
var worktreesPath = (directory) => localFile(directory, "worktrees.json");
var clonePath = (directory) => localFile(directory, "clone.json");
var activeIntentPath = (directory) => localFile(directory, "active-intent.json");
var readLocal = (schema, directory, path, limit) => refuseSymlinks(directory, path).pipe(andThen2(readJson(schema, path, limit)));
var readWorkers = (directory, limit) => readLocal(WorkersFile, directory, workersPath(directory), limit).pipe(map4((file) => file?.workers ?? []));
var readAgents = (directory, limit) => readLocal(AgentsFile, directory, agentsPath(directory), limit).pipe(map4((file) => file ?? {}));
var readWorktrees = (directory, limit) => readLocal(WorktreesFile, directory, worktreesPath(directory), limit).pipe(map4((file) => file ?? {}));
var readActiveIntent = (directory, limit) => readLocal(ActiveIntentFile, directory, activeIntentPath(directory), limit).pipe(map4((file) => file?.intent_id));
var writeActiveIntent = (directory, intentId, lock) => encodeJson(ActiveIntentFile, { intent_id: intentId }).pipe(flatMap2((content) => commitFile(activeIntentPath(directory), content, lock)));
var readCloneId = (directory) => readLocal(CloneFile, directory, clonePath(directory)).pipe(map4((file) => file?.clone_id));
var ensureCloneId = (directory, lock) => gen2(function* () {
  const existing = yield* readCloneId(directory);
  if (existing !== undefined)
    return existing;
  const created = yield* newId("clone");
  const content = yield* encodeJson(CloneFile, { clone_id: created });
  yield* commitFile(clonePath(directory), content, lock);
  return created;
});
var stampClone = (cloneId, before, after) => {
  const wasRunning = new Set(before.assignments.filter((row) => row.state === "Running").map((row) => row.id));
  const entering = new Set(after.assignments.filter((row) => row.state === "Running" && !wasRunning.has(row.id)).map((row) => row.id));
  return entering.size === 0 ? succeed5(after) : cloneId.pipe(map4((own) => ({
    ...after,
    assignments: after.assignments.map((row) => entering.has(row.id) ? { ...row, clone_id: own } : row)
  })));
};
var sortedKeys = (agents) => Object.fromEntries(Object.entries(agents).toSorted(([a], [b]) => compareIds(a, b)));
var writeLocal = (directory, before, after, lock) => gen2(function* () {
  const workersFile = workersPath(directory);
  const workers = yield* encodeJson(WorkersFile, after);
  const workersBefore = yield* encodeJson(WorkersFile, before);
  if (workers !== workersBefore)
    yield* commitFile(workersFile, workers, lock);
  const agentsFile = agentsPath(directory);
  const stored = yield* readAgents(directory);
  const bound = after.assignments.flatMap((row) => row.agent_id === null ? [] : [[row.id, row.agent_id]]);
  const merged = sortedKeys({ ...stored, ...Object.fromEntries(bound) });
  const agents = yield* encodeJson(AgentsFile, merged);
  const agentsBefore = yield* encodeJson(AgentsFile, sortedKeys(stored));
  if (agents !== agentsBefore)
    yield* commitFile(agentsFile, agents, lock);
  const worktreesFile = worktreesPath(directory);
  const keys = yield* readWorktrees(directory);
  const inState = new Set(after.assignments.map((row) => row.id));
  const held = after.assignments.flatMap((row) => row.state === "Running" && row.worktree !== undefined ? [[row.id, row.worktree]] : []);
  const kept = Object.entries(keys).filter(([id]) => !inState.has(id));
  const worktrees = yield* encodeJson(WorktreesFile, sortedKeys({ ...Object.fromEntries(kept), ...Object.fromEntries(held) }));
  const worktreesBefore = yield* encodeJson(WorktreesFile, sortedKeys(keys));
  if (worktrees !== worktreesBefore)
    yield* commitFile(worktreesFile, worktrees, lock);
});
// ../core/src/observations.ts
var rotateObservations = (directory) => {
  const current = observationsFile(directory);
  const previous = previousObservationsFile(directory);
  const full = io(current, async () => Bun.file(current).size > OBSERVATIONS_ROTATE_BYTES);
  return refuseSymlinks(directory, current).pipe(andThen2(refuseSymlinks(directory, previous)), andThen2(full), flatMap2((outgrown) => outgrown ? withStateLock(directory, (lock) => full.pipe(flatMap2((still) => still ? moveFile(current, previous, lock) : void_3))) : void_3));
};
// ../core/src/paths.ts
import { isAbsolute, relative as relative2, resolve as resolve3, sep as sep2 } from "path";
var FORBIDDEN_CHARACTERS = /[:*?"<>|]/;
var CONTROL_CHARACTERS = /\p{Cc}/u;
var RESERVED_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9\u00B9\u00B2\u00B3]|lpt[1-9\u00B9\u00B2\u00B3]|conin\$|conout\$) *(?:\..*)?$/i;
var segmentProblem = (segment) => {
  if (segment === "")
    return "empty segment";
  if (segment === "." || segment === "..")
    return `"${segment}" segment`;
  if (segment.endsWith(".") || segment.endsWith(" "))
    return "trailing dot or space";
  if (CONTROL_CHARACTERS.test(segment))
    return "control character";
  if (FORBIDDEN_CHARACTERS.test(segment))
    return 'one of : * ? " < > |';
  if (RESERVED_DEVICE_NAME.test(segment))
    return "Windows reserved device name";
  return;
};
var normalizePath = (raw) => {
  const path = raw.replaceAll("\\", "/");
  const problem = path.startsWith("/") ? "absolute path" : path.split("/").map(segmentProblem).find((found) => found !== undefined);
  return problem === undefined ? succeed5(path) : fail5(new InvalidPath({ path: raw, reason: problem }));
};
var normalizePaths = (raw) => forEach2(raw, normalizePath).pipe(map4((paths) => paths.filter((path, index) => paths.findIndex((other) => other.toLowerCase() === path.toLowerCase()) === index)));
var pathsOverlap = (a, b) => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
};
var anyOverlap = (a, b) => a.some((left) => b.some((right) => pathsOverlap(left, right)));
var isInsideRoots = (path, roots, base) => {
  const target = resolve3(base, path);
  return roots.some((root) => {
    const inside = relative2(resolve3(base, root), target);
    return inside.split(sep2)[0] !== ".." && !isAbsolute(inside);
  });
};
// ../core/src/legacy.ts
import { join as join4 } from "path";

// ../core/src/model/acceptance.ts
var AcceptanceRecord = Struct({
  intent_revision: Revision,
  rationale: Text,
  criteria_evidence: Record(Text, Text),
  required_evidence: Record(Text, Text)
});

// ../core/src/model/assignment.ts
var AssignmentState = Literals([
  "Ready",
  "Running",
  "Succeeded",
  "Failed",
  "Cancelled"
]);
var Metadata = Struct({
  ownership_paths: TextList,
  symbols: TextList,
  domains: TextList,
  dependencies: TextList,
  related_assignments: TextList,
  independent_from: TextList
});
var AssignmentDraft = Struct({
  intent_id: Id,
  intent_revision: Revision,
  role: Role,
  objective: Text,
  scope: TextList,
  constraints: TextList,
  acceptance_criteria: Labels,
  required_evidence: Labels,
  mutability: Mutability,
  metadata: Metadata.pipe(withDecodingDefaultKey(succeed5({})))
});
var Assignment = Struct({
  ...AssignmentDraft.fields,
  id: AssignmentId,
  intent_revision: StoredRevision,
  state: AssignmentState,
  agent_id: NullOr(Id),
  result: NullOr(Text),
  acceptance: NullOr(AcceptanceRecord),
  clone_id: optionalKey2(CloneId),
  worktree: optionalKey2(Text)
});
var isOpenAssignment = (assignment) => assignment.state === "Ready" || assignment.state === "Running" || assignment.state === "Succeeded" && assignment.acceptance === null;
var isTerminal = (assignment) => assignment.state === "Succeeded" || assignment.state === "Failed" || assignment.state === "Cancelled";

// ../core/src/model/intent.ts
var IntentState = Literals(["open", "closed"]);
var Intent = Struct({
  id: IntentId,
  objective: Text,
  requirements: String4,
  revision: StoredRevision,
  state: optionalKey2(toEncoded2(IntentState)).pipe(decodeTo2(IntentState, {
    decode: withDefault(succeed5("open")),
    encode: transformOptional(filter((state) => state !== "open"))
  })),
  close_reason: optionalKey2(Text),
  closed_at: optionalKey2(String4)
});

// ../core/src/model/state.ts
var State = Struct({
  version: Literal2(1),
  intents: ArraySchema(Intent),
  assignments: ArraySchema(Assignment),
  workers: ArraySchema(Worker)
});
var findIntent = (state, id) => {
  const found = state.intents.find((intent) => intent.id === id);
  return found === undefined ? fail5(new UnknownRecord({ kind: "intent", id })) : succeed5(found);
};
var findAssignment = (state, id) => {
  const found = state.assignments.find((assignment) => assignment.id === id);
  return found === undefined ? fail5(new UnknownRecord({ kind: "assignment", id })) : succeed5(found);
};
var refuseOtherClone = (state, id, cloneId) => {
  const row = state.assignments.find((assignment) => assignment.id === id);
  return row?.state === "Running" && row.clone_id !== undefined && row.clone_id !== cloneId ? fail5(new OwnedElsewhere({ id, clone_id: row.clone_id })) : void_3;
};
var invalidTransition = (assignment, action) => fail5(new InvalidTransition({ id: assignment.id, state: assignment.state, action }));
var requireLiveRevision = (intent, given) => intent.revision < 1 ? fail5(new NoRevision({ intent_id: intent.id })) : given === intent.revision ? void_3 : fail5(new StaleRevision({ given, live: intent.revision }));
var requireOpen = (intent) => intent.state === "open" ? void_3 : fail5(new IntentClosed({ intent_id: intent.id }));
var openIntents = (state) => sortedById(state.intents).filter((intent) => intent.state === "open");
var intentInUse = (state, stored) => {
  const open = openIntents(state);
  const chosen = open.find((intent) => intent.id === stored);
  return chosen ?? (open.length === 1 ? open[0] : undefined);
};
var resolveIntent = (state, flag, stored) => gen2(function* () {
  if (flag !== undefined)
    return yield* findIntent(state, flag);
  const inUse = intentInUse(state, stored);
  if (inUse !== undefined)
    return inUse;
  return yield* new NoActiveIntent({
    open: openIntents(state).map(({ id, objective }) => ({ id, objective }))
  });
});
var withAssignment = (state, next) => ({
  ...state,
  assignments: state.assignments.map((assignment) => assignment.id === next.id ? next : assignment)
});
var replaceAssignment = (state, next) => ({
  state: withAssignment(state, next),
  value: next
});
var unchanged = (state, assignment) => ({
  state,
  value: assignment
});
var duplicate = (ids) => {
  const seen = new Set;
  for (const id of ids) {
    if (seen.has(id))
      return id;
    seen.add(id);
  }
  return;
};
var validateState = (state) => gen2(function* () {
  const fail = (message) => fail5(new InvalidRecord({ message }));
  const intentIds = state.intents.map((intent) => intent.id);
  const assignmentIds = state.assignments.map((assignment) => assignment.id);
  const workerIds = state.workers.map((worker) => worker.agent_id);
  for (const [kind, ids] of [
    ["intent", intentIds],
    ["assignment", assignmentIds],
    ["worker", workerIds]
  ]) {
    const repeated = duplicate(ids);
    if (repeated !== undefined)
      return yield* fail(`Duplicate ${kind} id ${repeated}`);
  }
  const knownIntents = new Set(intentIds);
  const knownAssignments = new Set(assignmentIds);
  for (const assignment of state.assignments) {
    if (!knownIntents.has(assignment.intent_id))
      return yield* fail(`Assignment ${assignment.id} names unknown intent ${assignment.intent_id}`);
    const { dependencies, related_assignments, independent_from } = assignment.metadata;
    const unknown = [...dependencies, ...related_assignments, ...independent_from].find((id) => !knownAssignments.has(id));
    if (unknown !== undefined)
      return yield* fail(`Assignment ${assignment.id} references unknown assignment ${unknown}`);
  }
  return state;
});

// ../core/src/records.ts
import { readdir } from "fs/promises";
import { join as join3 } from "path";
var AssignmentRecord = Assignment.mapFields(omit2(["agent_id", "worktree"]));
var segments = (relative) => relative.split(/[\\/]/);
var scan = (directory, pattern) => attempt(() => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true }))).pipe(catch_2((cause) => hasCode(cause, "ENOENT") ? succeed5([]) : fail5(new StateIo({ path: directory, cause }))));
var intentFolders = (directory) => attempt(() => readdir(join3(directory, "intents"))).pipe(catch_2((cause) => hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR") ? succeed5([]) : fail5(new StateIo({ path: join3(directory, "intents"), cause }))));
var present = (path) => flatMap2((value) => value === undefined ? fail5(new CorruptRecord({ path, reason: "the file disappeared while reading" })) : succeed5(value));
var readIntents = (directory, limit) => scan(directory, "intents/*/intent.json").pipe(flatMap2((files) => forEach2(files, (relative) => {
  const path = join3(directory, relative);
  const folder = segments(relative)[1] ?? "";
  return refuseSymlinks(directory, path).pipe(andThen2(readJson(Intent, path, limit)), present(path), filterOrFail2((intent) => intent.id === folder, (intent) => new CorruptRecord({
    path,
    reason: `its id ${intent.id} does not match the directory ${folder}`
  })));
})));
var readAssignments = (directory, limit) => scan(directory, "intents/*/assignments/*.json").pipe(flatMap2((files) => forEach2(files, (relative) => {
  const path = join3(directory, relative);
  const parts = segments(relative);
  const folder = parts[1] ?? "";
  const name = (parts[3] ?? "").replace(/\.json$/, "");
  return refuseSymlinks(directory, path).pipe(andThen2(readJson(AssignmentRecord, path, limit)), present(path), filterOrFail2((record) => record.id === name, (record) => new CorruptRecord({
    path,
    reason: `its id ${record.id} does not match the file name ${name}`
  })), filterOrFail2((record) => record.intent_id === folder, (record) => new CorruptRecord({
    path,
    reason: `its intent ${record.intent_id} does not match the directory ${folder}`
  })));
})));
var loadRecordState = (directory, limit) => gen2(function* () {
  for (const path of [directory, join3(directory, "intents"), join3(directory, "local")])
    yield* refuseSymlinks(directory, path);
  for (const folder of yield* intentFolders(directory)) {
    yield* refuseSymlinks(directory, join3(directory, "intents", folder));
    yield* refuseSymlinks(directory, join3(directory, "intents", folder, "assignments"));
  }
  const intents = sortedById(yield* readIntents(directory, limit));
  const agents = yield* readAgents(directory, limit);
  const worktrees = yield* readWorktrees(directory, limit);
  const assignments = sortedById(yield* readAssignments(directory, limit)).map((record) => {
    const worktree = record.state === "Running" ? worktrees[record.id] : undefined;
    return {
      ...record,
      agent_id: agents[record.id] ?? null,
      ...worktree === undefined ? {} : { worktree }
    };
  });
  const workers = yield* readWorkers(directory, limit);
  return yield* validateState({ version: 1, intents, assignments, workers });
});
var recordTexts = (directory, state) => gen2(function* () {
  const texts = new Map;
  for (const intent of state.intents) {
    texts.set(intentFile(directory, intent.id), yield* encodeJson(Intent, intent));
  }
  for (const assignment of state.assignments) {
    const path = assignmentFile(directory, assignment.intent_id, assignment.id);
    texts.set(path, yield* encodeJson(AssignmentRecord, assignment));
  }
  return texts;
});
var persist = (directory, before, after, lock) => gen2(function* () {
  yield* validateState(after);
  const was = yield* recordTexts(directory, before);
  const now = yield* recordTexts(directory, after);
  for (const [path, text] of now)
    if (was.get(path) !== text)
      yield* commitFile(path, text, lock);
  yield* writeLocal(directory, before, after, lock);
});

// ../core/src/legacy.ts
var readLegacy = (directory) => refuseSymlinks(directory, legacyFile(directory)).pipe(andThen2(readJson(State, legacyFile(directory), MAX_LEGACY_STATE_BYTES)), flatMap2((state) => state === undefined ? succeed5(undefined) : validateState(state)));
var mergeLegacy = (legacy, existing) => {
  const known = (own) => new Set(own.map((record) => record.id));
  const intents = known(legacy.intents);
  const assignments = known(legacy.assignments);
  const workers = new Set(legacy.workers.map((worker) => worker.agent_id));
  return {
    version: 1,
    intents: [...legacy.intents, ...existing.intents.filter(({ id }) => !intents.has(id))],
    assignments: [
      ...legacy.assignments,
      ...existing.assignments.filter(({ id }) => !assignments.has(id))
    ],
    workers: [
      ...legacy.workers,
      ...existing.workers.filter(({ agent_id }) => !workers.has(agent_id))
    ]
  };
};
var moveObservations = (directory, lock) => {
  const from = join4(directory, "state.observations.jsonl");
  const to = previousObservationsFile(directory);
  return gen2(function* () {
    yield* refuseSymlinks(directory, from);
    yield* refuseSymlinks(directory, to);
    if (!(yield* io(from, () => Bun.file(from).exists())))
      return;
    if (yield* io(to, () => Bun.file(to).exists())) {
      yield* prependLines(from, to, lock);
      yield* removeFile(from, lock);
    } else
      yield* moveFile(from, to, lock);
  });
};
var migrateLegacy = (directory, lock) => gen2(function* () {
  const legacy = yield* readLegacy(directory);
  if (legacy === undefined)
    return;
  const migrated = migratedFile(directory);
  yield* refuseSymlinks(directory, migrated);
  const kept = yield* readText(migrated, MAX_LEGACY_STATE_BYTES);
  if (kept !== undefined && kept !== (yield* readText(legacyFile(directory), MAX_LEGACY_STATE_BYTES)))
    return yield* new MigratedFileInTheWay({ path: migrated });
  const existing = yield* loadRecordState(directory);
  const incoming = yield* recordTexts(directory, legacy);
  for (const [path, text] of yield* recordTexts(directory, existing)) {
    const old = incoming.get(path);
    if (old !== undefined && old !== text)
      return yield* new CorruptRecord({
        path,
        reason: `it disagrees with ${legacyFile(directory)}; move one of them away`
      });
  }
  yield* persist(directory, existing, mergeLegacy(legacy, existing), lock);
  yield* moveObservations(directory, lock);
  if (kept === undefined)
    yield* moveFile(legacyFile(directory), migrated, lock);
  else
    yield* removeFile(legacyFile(directory), lock);
  for (const file of legacyLockFiles(directory))
    yield* removeFile(file, lock);
});

// ../core/src/store.ts
var loadState = (directory, limit) => gen2(function* () {
  const legacy = yield* readLegacy(directory);
  const existing = yield* loadRecordState(directory, limit);
  return legacy === undefined ? existing : mergeLegacy(legacy, existing);
});
var updateState = (directory, transition) => withStateLock(directory, (lock) => gen2(function* () {
  yield* keepLocalFilesOutOfVersionControl(directory);
  yield* migrateLegacy(directory, lock);
  const before = yield* loadRecordState(directory);
  const cloneId = ensureCloneId(directory, lock);
  const { state, value } = yield* transition(before, {
    cloneId,
    useIntent: (intentId) => writeActiveIntent(directory, intentId, lock)
  });
  if (state !== before)
    yield* persist(directory, before, yield* stampClone(cloneId, before, state), lock);
  return value;
}));
// ../core/src/worktree.ts
import { realpath, stat as stat2 } from "fs/promises";
import { resolve as resolve4 } from "path";
var openWorktree = (path) => gen2(function* () {
  if (path.trim() === "")
    return yield* new InvalidWorktree({ path, reason: "empty path" });
  const root = resolve4(path);
  const info = yield* attempt(() => stat2(root)).pipe(catch_2((cause) => fail5(hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR") ? new InvalidWorktree({ path, reason: "no such directory" }) : new StateIo({ path, cause }))));
  if (!info.isDirectory())
    return yield* new InvalidWorktree({ path, reason: "not a directory" });
  const real = yield* io(root, () => realpath(root));
  const key = new Bun.CryptoHasher("sha256").update(real).digest("hex").slice(0, 16);
  return { root, key };
});
// ../core/src/model/ci.ts
var CiGate = Literals(["Pending", "Passed", "Failed", "Unknown"]);
// ../core/src/transitions/assignment.ts
var FollowUpInput = Struct({ predecessor_id: Id, assignment: AssignmentDraft });
var createAssignment = (state, draft) => gen2(function* () {
  yield* requireOpen(yield* findIntent(state, draft.intent_id));
  const ownership_paths = yield* normalizePaths(draft.metadata.ownership_paths);
  if (draft.mutability !== "ReadOnly" && ownership_paths.length === 0)
    return yield* new InvalidRecord({
      message: "A non-ReadOnly Assignment needs an ownership path"
    });
  const { dependencies, related_assignments, independent_from } = draft.metadata;
  yield* forEach2([...dependencies, ...related_assignments, ...independent_from], (id) => findAssignment(state, id));
  const assignment = {
    ...draft,
    metadata: { ...draft.metadata, ownership_paths },
    id: yield* newId("assignment"),
    state: "Ready",
    agent_id: null,
    result: null,
    acceptance: null
  };
  const change = {
    state: { ...state, assignments: [...state.assignments, assignment] },
    value: assignment
  };
  return change;
});
var followUp = (state, input) => gen2(function* () {
  const predecessor = yield* findAssignment(state, input.predecessor_id);
  if (!isTerminal(predecessor))
    return yield* invalidTransition(predecessor, "follow up");
  const { metadata } = input.assignment;
  const related = new Set([...metadata.related_assignments, predecessor.id]);
  return yield* createAssignment(state, {
    ...input.assignment,
    metadata: { ...metadata, related_assignments: [...related] }
  });
});
// ../core/src/transitions/completion.ts
var Outcome = Literals(["Success", "Failure", "Errored", "Interrupted", "Stopped"]);
var FinishInput = Struct({ assignment_id: Id, outcome: Outcome, result: Text });
var CancelInput = Struct({
  assignment_id: Id,
  notification: Literal2("stopped"),
  reason: optionalKey2(Text)
});
var AcceptInput = Struct({ assignment_id: Id, acceptance: AcceptanceRecord });
var ResolveReconcileInput = Union2([
  TaggedStruct("Fail", { assignment_id: Id, reason: Text }),
  TaggedStruct("Keep", { assignment_id: Id })
]);
var finish = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  const target = input.outcome === "Success" ? "Succeeded" : "Failed";
  if (isTerminal(assignment))
    return assignment.state === target && assignment.result === input.result ? unchanged(state, assignment) : yield* new Conflict({ id: assignment.id, what: "finish" });
  if (assignment.state !== "Running" || assignment.agent_id === null)
    return yield* invalidTransition(assignment, "finish");
  return replaceAssignment(state, { ...assignment, state: target, result: input.result });
});
var cancel = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  if (assignment.state !== "Running")
    return yield* invalidTransition(assignment, "cancel");
  return replaceAssignment(state, {
    ...assignment,
    state: "Cancelled",
    result: input.reason ?? null
  });
});
var coverageProblems = (name, declared, given) => {
  const labels = Object.keys(given);
  const missing = declared.filter((label) => !labels.includes(label));
  const extra = labels.filter((label) => !declared.includes(label));
  return [
    ...missing.length > 0 ? [`${name} missing ${missing.join(", ")}`] : [],
    ...extra.length > 0 ? [`${name} unknown ${extra.join(", ")}`] : []
  ];
};
var sameEvidence = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
var sameAcceptance = (a, b) => a.intent_revision === b.intent_revision && a.rationale === b.rationale && sameEvidence(a.criteria_evidence, b.criteria_evidence) && sameEvidence(a.required_evidence, b.required_evidence);
var accept = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  const { acceptance } = input;
  if (assignment.acceptance !== null)
    return sameAcceptance(assignment.acceptance, acceptance) ? unchanged(state, assignment) : yield* new Conflict({ id: assignment.id, what: "acceptance" });
  if (assignment.state !== "Succeeded")
    return yield* invalidTransition(assignment, "accept");
  const intent = yield* findIntent(state, assignment.intent_id);
  yield* requireLiveRevision(intent, assignment.intent_revision);
  yield* requireLiveRevision(intent, acceptance.intent_revision);
  const problems = [
    ...coverageProblems("criteria", assignment.acceptance_criteria, acceptance.criteria_evidence),
    ...coverageProblems("required evidence", assignment.required_evidence, acceptance.required_evidence)
  ];
  if (problems.length > 0)
    return yield* new InsufficientEvidence({ id: assignment.id, detail: problems.join("; ") });
  return replaceAssignment(state, { ...assignment, acceptance });
});
var reconcile = (state, cloneId) => {
  const running = sortedById(state.assignments.filter((assignment) => assignment.state === "Running"));
  const isElsewhere = (assignment) => assignment.clone_id !== undefined && assignment.clone_id !== cloneId;
  return {
    local: running.filter((assignment) => !isElsewhere(assignment)),
    elsewhere: running.filter(isElsewhere)
  };
};
var resolveReconcile = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  if (assignment.state !== "Running")
    return yield* invalidTransition(assignment, "reconcile");
  return input._tag === "Keep" ? unchanged(state, assignment) : replaceAssignment(state, { ...assignment, state: "Failed", result: input.reason });
});
// ../core/src/transitions/selection.ts
var SelectWorkerInput = Struct({ assignment_id: Id, fingerprint: Text });
var isIdle = (state, worker) => {
  const lastId = worker.history.at(-1);
  if (lastId === undefined)
    return true;
  const last = state.assignments.find((assignment) => assignment.id === lastId);
  return last !== undefined && isTerminal(last);
};
var intersects = (a, b) => a.some((item) => b.includes(item));
var hasRelevantContext = (state, worker, next) => {
  const last = state.assignments.find((assignment) => assignment.id === worker.history.at(-1));
  if (last === undefined)
    return false;
  return next.metadata.related_assignments.includes(last.id) || anyOverlap(next.metadata.ownership_paths, last.metadata.ownership_paths) || intersects(next.metadata.symbols, last.metadata.symbols) || intersects(next.metadata.domains, last.metadata.domains);
};
var smallestId = (workers) => workers.toSorted((a, b) => a.agent_id < b.agent_id ? -1 : 1)[0];
var reuseProblem = (state, worker, next, fingerprint) => {
  if (worker.preset !== next.role)
    return `${worker.agent_id} is a ${worker.preset}, not a ${next.role}`;
  if (routeFor(next.role).model === "haiku")
    return `${next.role} runs on Haiku, so every Assignment gets a new worker`;
  if (worker.fingerprint !== fingerprint)
    return `${worker.agent_id} was launched with a different roster or tools`;
  if (!isIdle(state, worker))
    return `${worker.agent_id} is still working on ${worker.history.at(-1)}`;
  if (routeFor(next.role).independence === "IndependentReview" && intersects(worker.history, next.metadata.independent_from))
    return `${worker.agent_id} worked on what this review must be independent from`;
  return;
};
var reuse = (worker, reason) => ({
  _tag: "Reuse",
  agent_id: worker.agent_id,
  reason
});
var selectWorker = (state, input) => gen2(function* () {
  const next = yield* findAssignment(state, input.assignment_id);
  if (next.state !== "Ready")
    return yield* invalidTransition(next, "select a worker for");
  const candidates = state.workers.filter((worker) => reuseProblem(state, worker, next, input.fingerprint) === undefined);
  const relevant = smallestId(candidates.filter((worker) => hasRelevantContext(state, worker, next)));
  if (relevant !== undefined)
    return reuse(relevant, "RelevantContext");
  const sameRole = smallestId(candidates);
  const selection = sameRole === undefined ? { _tag: "Spawn" } : reuse(sameRole, "SameRole");
  return selection;
});

// ../core/src/transitions/dispatch.ts
var AssignmentRef = Struct({ assignment_id: Id });
var ReserveInput = Struct({
  assignment_id: Id,
  capabilities: ArraySchema(Capability)
});
var BindAgentInput = Struct({
  assignment_id: Id,
  agent_id: Id,
  fingerprint: Text
});
var MUTABILITY_RANK = { ReadOnly: 0, ScopedWrite: 1 };
var reserve = (state, input, context) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  if (assignment.state !== "Ready")
    return yield* invalidTransition(assignment, "reserve");
  const intent = yield* findIntent(state, assignment.intent_id);
  yield* requireOpen(intent);
  yield* requireLiveRevision(intent, assignment.intent_revision);
  const refuse = (reason, detail) => new DispatchRefused({ id: assignment.id, reason, detail });
  const route = routeFor(assignment.role);
  if (MUTABILITY_RANK[assignment.mutability] > MUTABILITY_RANK[route.mutability])
    return yield* refuse("MutabilityCeiling", `${route.role} may only be ${route.mutability}`);
  const missing = route.capabilities.filter((need) => !input.capabilities.includes(need));
  if (missing.length > 0)
    return yield* refuse("MissingCapability", missing.join(", "));
  const { ownership_paths, dependencies } = assignment.metadata;
  const writes = assignment.mutability !== "ReadOnly";
  const outside = ownership_paths.find((path) => !isInsideRoots(path, context.writableRoots, context.projectRoot));
  if (writes && outside !== undefined)
    return yield* refuse("OutsideWritableRoots", outside);
  for (const id of dependencies) {
    const dependency = yield* findAssignment(state, id);
    const accepted = dependency.state === "Succeeded" && dependency.intent_id === assignment.intent_id && dependency.acceptance?.intent_revision === assignment.intent_revision;
    if (!accepted)
      return yield* refuse("DependencyNotAccepted", `${id} is not accepted at revision ${assignment.intent_revision}`);
  }
  const holder = state.assignments.find((other) => writes && other.state === "Running" && (other.clone_id === undefined || other.clone_id === context.cloneId) && (other.worktree === undefined || other.worktree === context.worktree) && other.mutability !== "ReadOnly" && anyOverlap(other.metadata.ownership_paths, ownership_paths));
  if (holder !== undefined)
    return yield* refuse("OwnershipConflict", `paths overlap ${holder.id}`);
  return replaceAssignment(state, { ...assignment, state: "Running", worktree: context.worktree });
});
var bindAgent = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  if (assignment.state !== "Running" || assignment.agent_id !== null)
    return yield* invalidTransition(assignment, "bind an agent to");
  const known = state.workers.find((worker) => worker.agent_id === input.agent_id);
  const problem = known === undefined ? undefined : reuseProblem(state, known, assignment, input.fingerprint);
  if (problem !== undefined)
    return yield* new InvalidRecord({ message: problem });
  const worker = {
    agent_id: input.agent_id,
    preset: assignment.role,
    fingerprint: input.fingerprint,
    history: [...known?.history ?? [], assignment.id]
  };
  const bound = replaceAssignment(state, { ...assignment, agent_id: input.agent_id });
  const workers = [...state.workers.filter((other) => other.agent_id !== worker.agent_id), worker];
  return { ...bound, state: { ...bound.state, workers } };
});
var rollbackReservation = (state, input) => gen2(function* () {
  const assignment = yield* findAssignment(state, input.assignment_id);
  if (assignment.state !== "Running" || assignment.agent_id !== null)
    return yield* invalidTransition(assignment, "roll back");
  return replaceAssignment(state, { ...assignment, state: "Ready" });
});
// ../core/src/transitions/intent.ts
var CreateIntentInput = Struct({
  objective: Text,
  requirements: String4.pipe(withDecodingDefaultKey(succeed5("")))
});
var UpdateIntentInput = Struct({
  id: Id,
  objective: optionalKey2(Text),
  requirements: optionalKey2(String4),
  material: Boolean3
});
var CloseIntentInput = Struct({ id: Id, reason: Text, at: Text });
var replaceIntent = (state, next) => ({
  state: { ...state, intents: state.intents.map((it) => it.id === next.id ? next : it) },
  value: next
});
var createIntent = (state, input) => gen2(function* () {
  const intent = { id: yield* newId("intent"), ...input, revision: 1, state: "open" };
  return { state: { ...state, intents: [...state.intents, intent] }, value: intent };
});
var updateIntent = (state, input) => gen2(function* () {
  const current = yield* findIntent(state, input.id);
  const next = {
    ...current,
    objective: input.objective ?? current.objective,
    requirements: input.requirements ?? current.requirements,
    revision: input.material ? current.revision + 1 : current.revision
  };
  return replaceIntent(state, next);
});
var closeIntent = (state, input) => gen2(function* () {
  const current = yield* findIntent(state, input.id);
  if (current.state === "closed")
    return yield* new InvalidRecord({ message: `Intent ${current.id} is already closed` });
  const running = state.assignments.filter((row) => row.intent_id === current.id && row.state === "Running").map((row) => row.id);
  if (running.length > 0)
    return yield* new IntentBusy({ intent_id: current.id, running });
  return replaceIntent(state, {
    ...current,
    state: "closed",
    close_reason: input.reason,
    closed_at: input.at
  });
});
var reopenIntent = (state, id) => gen2(function* () {
  const { close_reason: _reason, closed_at: _at, ...current } = yield* findIntent(state, id);
  if (current.state === "open")
    return yield* new InvalidRecord({ message: `Intent ${current.id} is already open` });
  return replaceIntent(state, { ...current, state: "open", revision: current.revision + 1 });
});
// src/clock.ts
var nowIso = currentTimeMillis2.pipe(map4((ms) => new Date(ms).toISOString()));

// src/fingerprint.ts
import { join as join5 } from "path";
var PLUGIN_NAME = "holyclaude";
var rootCandidates = () => [
  ...process.env["CLAUDE_PLUGIN_ROOT"] ? [process.env["CLAUDE_PLUGIN_ROOT"]] : [],
  join5(import.meta.dir, ".."),
  join5(import.meta.dir, "..", "..", "..", "plugin")
];
var pluginRoot = gen2(function* () {
  for (const root of rootCandidates()) {
    const found = yield* tryPromise2(() => Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: join5(root, "agents") }))).pipe(orElseSucceed2(() => []));
    if (found.length > 0)
      return root;
  }
  return;
});
var rosterFingerprintAt = (root) => gen2(function* () {
  if (root === undefined)
    return `roster:unknown:${crypto.randomUUID()}`;
  const names = yield* tryPromise2(() => Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: join5(root, "agents") }))).pipe(orElseSucceed2(() => []));
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of names.toSorted()) {
    const text = yield* tryPromise2(() => Bun.file(join5(root, "agents", name)).text()).pipe(orElseSucceed2(() => ""));
    hasher.update(`${name}
${text}
`);
  }
  return `roster:${hasher.digest("hex").slice(0, 16)}`;
});
var rosterFingerprint = pluginRoot.pipe(flatMap2(rosterFingerprintAt));

// src/hook/input.ts
var Envelope = fromJsonString2(Record(String4, Unknown2));
var Effort2 = Union2([
  Struct({ level: optionalKey2(String4) }),
  String4
]);
var lenient = (schema, value) => getOrUndefined(decodeUnknownOption2(schema)(value));
var toolInput = (value) => {
  const fields = lenient(Record(String4, Unknown2), value);
  return fields === undefined ? undefined : {
    command: lenient(String4, fields["command"]),
    file_path: lenient(String4, fields["file_path"]),
    notebook_path: lenient(String4, fields["notebook_path"])
  };
};
var isAgentId = (value) => value !== undefined && value !== null && value !== "";
var fieldsOf = (value) => lenient(Record(String4, Unknown2), value) ?? {};
var agentLaunch = (envelope) => {
  const response = fieldsOf(envelope["tool_response"]);
  return {
    subagent_type: lenient(String4, fieldsOf(envelope["tool_input"])["subagent_type"]),
    agentId: lenient(String4, response["agentId"]),
    resolvedModel: lenient(String4, response["resolvedModel"])
  };
};
var decode2 = decodeUnknownEffect2(Envelope);
var decodeHookInput = (text) => decode2(text).pipe(map4((envelope) => ({
  agent: isAgentId(envelope["agent_id"]) ? { id: lenient(String4, envelope["agent_id"]) } : undefined,
  tool_name: lenient(String4, envelope["tool_name"]),
  tool_input: toolInput(envelope["tool_input"]),
  agent_type: lenient(String4, envelope["agent_type"]),
  transcript_path: lenient(String4, envelope["transcript_path"]),
  agent_transcript_path: lenient(String4, envelope["agent_transcript_path"]),
  effort: lenient(Effort2, envelope["effort"]),
  launch: agentLaunch(envelope)
})));
var effortOf = (input) => {
  const { effort } = input;
  return typeof effort === "string" ? effort : effort?.level;
};
var subagentTranscript = (input) => {
  const { transcript_path: path } = input;
  const agent = input.agent?.id;
  if (path === undefined || agent === undefined)
    return;
  if (path.includes("/subagents/"))
    return path;
  return `${path.replace(/\.jsonl$/, "")}/subagents/agent-${agent}.jsonl`;
};

// src/observations.ts
import { appendFile } from "fs/promises";
var Text2 = String4.check(isPattern2(/\S/));
var Observed = Struct({
  kind: Literal2("observed"),
  agent_id: Text2,
  agent_type: optionalKey2(Text2),
  effort: optionalKey2(Text2),
  transcript: optionalKey2(Text2),
  model: optionalKey2(Text2),
  at: String4
});
var Override = Struct({
  kind: Literal2("override"),
  assignment_id: Text2,
  agent_id: Text2,
  model: optionalKey2(Text2),
  effort: optionalKey2(Text2),
  at: String4
});
var ObservationRecord = Union2([Observed, Override]);
var observationsPath = (directory = stateDirPath()) => observationsFile(directory);
var decodeLine = decodeJsonStrict(ObservationRecord);
var readGeneration = (directory, path) => gen2(function* () {
  yield* refuseSymlinks(directory, path);
  const text = (yield* readTail(path, OBSERVATIONS_READ_BYTES)) ?? "";
  const records = [];
  for (const line of text.split(`
`)) {
    if (line === "")
      continue;
    const record = yield* decodeLine(line).pipe(option2);
    if (record._tag === "Some")
      records.push(record.value);
  }
  return records;
});
var readObservations = (directory = stateDirPath()) => gen2(function* () {
  const current = yield* readGeneration(directory, observationsPath(directory));
  const previous = yield* readGeneration(directory, previousObservationsFile(directory));
  return [...previous, ...current];
});
var appendObservation = (record, directory = stateDirPath()) => {
  const path = observationsPath(directory);
  return refuseSymlinks(directory, path).pipe(andThen2(ensureLocalDirectory(directory)), andThen2(keepLocalFilesOutOfVersionControl(directory)), andThen2(rotateObservations(directory)), andThen2(tryPromise2({
    try: () => appendFile(path, `${JSON.stringify(record)}
`),
    catch: (cause) => new StateIo({ path, cause })
  })));
};
var seenOf = (records, agentId) => {
  const seen = {};
  for (const record of records) {
    if (record.kind !== "observed" || record.agent_id !== agentId)
      continue;
    if (record.agent_type !== undefined)
      seen.agent_type = record.agent_type;
    if (record.effort !== undefined)
      seen.effort = record.effort;
    if (record.transcript !== undefined)
      seen.transcript = record.transcript;
    if (record.model !== undefined)
      seen.model = record.model;
  }
  return seen;
};
var latestOverride = (records, assignmentId, agentId) => records.findLast((record) => record.kind === "override" && record.assignment_id === assignmentId && record.agent_id === agentId);

// src/hook/observe.ts
var OBSERVATION_BUDGET = "750 millis";
var isSpecialist = (agentType) => agentType?.startsWith(`${PLUGIN_NAME}:`);
var observe = (agentId, sighting, directory = stateDirPath()) => gen2(function* () {
  const seen = {
    ...sighting.agent_type ? { agent_type: sighting.agent_type } : {},
    ...sighting.effort ? { effort: sighting.effort } : {},
    ...sighting.transcript ? { transcript: sighting.transcript } : {},
    ...sighting.model ? { model: sighting.model } : {}
  };
  if (sighting.agent_type && !isSpecialist(sighting.agent_type))
    return;
  const known = seenOf(yield* readObservations(directory), agentId);
  if (!isSpecialist(sighting.agent_type || known.agent_type))
    return;
  const keys = Object.keys(seen);
  if (keys.every((key) => seen[key] === known[key]))
    return;
  yield* appendObservation({ kind: "observed", agent_id: agentId, ...seen, at: yield* nowIso }, directory);
}).pipe(timeout2(OBSERVATION_BUDGET), catchCause2(() => void_3));

// src/hook/post-tool-use.ts
var postToolUse = (stdin) => gen2(function* () {
  const input = yield* decodeHookInput(stdin).pipe(orElseSucceed2(() => {
    return;
  }));
  const { subagent_type: type, agentId, resolvedModel } = input?.launch ?? {};
  if (type?.startsWith(`${PLUGIN_NAME}:`) && agentId && resolvedModel)
    yield* observe(agentId, { agent_type: type, model: resolvedModel });
  return "";
});

// src/hook/glob.ts
var SEPARATORS = "/\\=";
var RANGE = /^(-?\d+\.\.-?\d+|[a-z]\.\.[a-z])(\.\.-?\d+)?$/;
var MAX_BRACE_DEPTH = 32;
var bit = (state) => 1 << state;
var through = (mask, steps) => {
  let out = 0;
  for (let state = 0;mask >> state !== 0; state += 1)
    if ((mask & bit(state)) !== 0)
      out |= steps[state] ?? 0;
  return out;
};
var closure = (mask, steps) => {
  let reached = mask;
  for (;; ) {
    const grown = reached | through(reached, steps);
    if (grown === reached)
      return reached;
    reached = grown;
  }
};
var START = 0;
var OTHER = 1;
var NAMED = 2;
var automaton = (name) => {
  const states = 3 + name.length + 1 + 1;
  const next = (state, char) => {
    if (state === NAMED)
      return NAMED;
    const separator = SEPARATORS.includes(char);
    if (state === START || state === OTHER) {
      if (separator)
        return START;
      return state === START && char === name[0] ? 3 + 1 : OTHER;
    }
    const read = state - 3;
    if (read >= name.length) {
      if (separator || char === ":")
        return NAMED;
      return char === "." || char === " " ? 3 + name.length + 1 : OTHER;
    }
    if (separator)
      return START;
    return char === name[read] ? state + 1 : OTHER;
  };
  const all = Array.from({ length: states }, (_, state) => state);
  const representatives = [
    ...new Set([...name.split(""), ".", " ", ":", ...SEPARATORS.split(""), "-", "0", "x"])
  ];
  const wildChars = representatives.filter((char) => !SEPARATORS.includes(char) && char !== ":");
  const table = (chars, wildcard) => all.map((state) => chars.filter((char) => !wildcard || state !== START || char !== ".").reduce((mask, char) => mask | bit(next(state, char)), 0));
  const one = table(wildChars, true);
  return {
    states,
    accepting: all.filter((state) => state === NAMED || state - 3 >= name.length).reduce((mask, state) => mask | bit(state), 0),
    representatives,
    literal: new Map(representatives.map((char) => [char, table([char], false)])),
    wild: new Map(wildChars.map((char) => [char, table([char], true)])),
    one,
    star: all.map((state) => closure(bit(state), one)),
    range: table(wildChars.filter((char) => /[a-z0-9-]/.test(char)), true),
    any: table(representatives, false)
  };
};
var PROTECTED = [".git", ".holyclaude"].map((name) => [name, automaton(name)]);
var classStep = (machine, mask, body) => {
  const negated = body.startsWith("!") || body.startsWith("^");
  const listed = negated ? body.slice(1) : body;
  const ranges = [...listed.matchAll(/(.)-(.)/g)];
  const holds = (char) => negated || listed.includes("[:") || listed.includes(char) || ranges.some(([, low = "", high = ""]) => low <= char && char <= high);
  let out = 0;
  for (const [char, steps] of machine.wild)
    if (holds(char))
      out |= through(mask, steps);
  return out;
};
var bracesOf = (pattern) => {
  const braces = { close: new Map, commas: new Map, nesting: new Set };
  const open = [];
  for (let index = 0;index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "{") {
      const parent = open[open.length - 1];
      if (parent !== undefined)
        braces.nesting.add(parent.at);
      open.push({ at: index, commas: [] });
    } else if (char === ",")
      open[open.length - 1]?.commas.push(index);
    else if (char === "}") {
      const group = open.pop();
      if (group !== undefined) {
        braces.close.set(group.at, index);
        braces.commas.set(group.at, group.commas);
      }
    }
  }
  return braces;
};
var bracketsOf = (text) => {
  const found = new Int32Array(text.length + 1).fill(-1);
  for (let index = text.length - 1;index >= 0; index -= 1)
    found[index] = text[index] === "]" ? index : found[index + 1] ?? -1;
  return found;
};
var canName = (machine, pattern, braces, brackets) => {
  const run = (from, to, start, depth) => {
    let mask = start;
    let index = from;
    while (index < to && mask !== 0) {
      const char = pattern[index] ?? "";
      const end = char === "{" ? braces.close.get(index) ?? -1 : -1;
      const commas = end !== -1 && end < to ? braces.commas.get(index) ?? [] : [];
      const closing = char === "[" ? brackets[index + 2] ?? -1 : -1;
      if (char === "*")
        mask = through(mask, machine.star);
      else if (char === "?")
        mask = through(mask, machine.one);
      else if (closing !== -1 && closing < to) {
        mask = classStep(machine, mask, pattern.slice(index + 1, closing));
        index = closing;
      } else if (commas.length > 0) {
        const bounds = [index, ...commas, end];
        let out = 0;
        if (depth >= MAX_BRACE_DEPTH)
          out = closure(mask, machine.any);
        else
          for (let part = 0;part + 1 < bounds.length; part += 1)
            out |= run((bounds[part] ?? 0) + 1, bounds[part + 1] ?? 0, mask, depth + 1);
        mask = out;
        index = end;
      } else if (end !== -1 && end < to && !braces.nesting.has(index) && RANGE.test(pattern.slice(index + 1, end))) {
        mask = closure(through(mask, machine.range), machine.range);
        index = end;
      } else {
        const key = machine.representatives.includes(char) ? char : "x";
        mask = through(mask, machine.literal.get(key) ?? []);
      }
      index += 1;
    }
    return mask;
  };
  return (run(0, pattern.length, bit(START), 0) & machine.accepting) !== 0;
};
var NO_BRACES = { close: new Map, commas: new Map, nesting: new Set };
var protectedNameOf = (pattern) => {
  const lower = pattern.toLowerCase();
  const braces = lower.includes("{") ? bracesOf(lower) : NO_BRACES;
  const brackets = lower.includes("[") ? bracketsOf(lower) : new Int32Array(0);
  return PROTECTED.find(([, machine]) => canName(machine, lower, braces, brackets))?.[0];
};

// src/hook/shell.ts
var MAX_NESTING = 3;
var KEPT_BACKSLASH = /[A-Za-z0-9_.\-~@+,%=:/\\]/;
var WORD_END = /[\s;&|()<>]/;
var ANSI_ESCAPES = {
  n: `
`,
  t: "\t",
  r: "\r",
  a: "\x07",
  b: "\b",
  e: "\x1B",
  E: "\x1B",
  f: "\f",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"'
};
var MAX_CODE_POINT = 1114111;
var control = (char) => char === "?" ? "\x7F" : String.fromCharCode(char.toUpperCase().charCodeAt(0) & 31);
var decodeAnsi = (body) => body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|c(?:\\\\|[\s\S])|.)/g, (whole, code) => {
  if (code.length > 1 && code[0] === "c")
    return control(code[1] ?? "");
  if (code.length > 1 && /[xuU]/.test(code[0] ?? "")) {
    const point = Number.parseInt(code.slice(1), 16);
    return point <= MAX_CODE_POINT ? String.fromCodePoint(point) : whole;
  }
  return /^[0-7]+$/.test(code) ? String.fromCharCode(Number.parseInt(code, 8)) : ANSI_ESCAPES[code] ?? `\\${code}`;
});
var closingParen = (text, from) => {
  let depth = 0;
  for (let index = from;index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\")
      index += 1;
    else if (char === "(")
      depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0)
        return index;
    }
  }
  return -1;
};
var bodySubstitutions = (body) => {
  const found = [];
  for (let index = 0;index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\")
      index += 1;
    else if (char === "$" && body[index + 1] === "(") {
      const end = closingParen(body, index + 1);
      if (end === -1)
        return [...found, body.slice(index + 2)];
      found.push(body.slice(index + 2, end));
      index = end;
    } else if (char === "`") {
      const end = body.indexOf("`", index + 1);
      if (end === -1)
        return [...found, body.slice(index + 1)];
      found.push(body.slice(index + 1, end));
      index = end;
    }
  }
  return found;
};
var scanScript = (source, nesting = 0) => {
  if (nesting > MAX_NESTING)
    return { ok: false, reason: "substitutions nested too deeply" };
  const commands = [];
  const pending = [];
  let failure;
  let pos = 0;
  let look = { end: -1, separator: -1, close: -1 };
  const lookahead = () => {
    if (pos < look.end)
      return look;
    let end = pos;
    let separator = -1;
    let close = -1;
    while (end < source.length && !WORD_END.test(source[end] ?? " ")) {
      if (source[end] === "," || source[end] === "." && source[end + 1] === ".")
        separator = end;
      if (source[end] === "]")
        close = end;
      end += 1;
    }
    look = { end, separator, close };
    return look;
  };
  const fail = (reason) => {
    failure ??= reason;
  };
  const absorb = (script) => {
    const nested = scanScript(script, nesting + 1);
    if (nested.ok)
      commands.push(...nested.commands);
    else
      fail(nested.reason);
  };
  const consumeHeredocs = () => {
    for (const heredoc of pending.splice(0)) {
      let body = "";
      while (pos < source.length) {
        const end = source.indexOf(`
`, pos);
        const line = end === -1 ? source.slice(pos) : source.slice(pos, end);
        pos = end === -1 ? source.length : end + 1;
        const compared = heredoc.strip ? line.replace(/^\t+/, "") : line;
        if (compared === heredoc.delimiter)
          break;
        body += `${line}
`;
      }
      if (heredoc.expand)
        for (const script of bodySubstitutions(body))
          absorb(script);
    }
  };
  const readHeredocDelimiter = () => {
    const strip = source[pos] === "-";
    if (strip)
      pos += 1;
    while (source[pos] === " " || source[pos] === "\t")
      pos += 1;
    let delimiter = "";
    let expand = true;
    while (pos < source.length && !WORD_END.test(source[pos] ?? " ")) {
      const char = source[pos] ?? "";
      if (char === "'" || char === '"') {
        expand = false;
        const end = source.indexOf(char, pos + 1);
        if (end === -1) {
          fail("unterminated heredoc delimiter");
          break;
        }
        delimiter += source.slice(pos + 1, end);
        pos = end + 1;
      } else if (char === "\\") {
        expand = false;
        delimiter += source[pos + 1] ?? "";
        pos += 2;
      } else {
        delimiter += char;
        pos += 1;
      }
    }
    return { delimiter, strip, expand };
  };
  const skipBrace = () => {
    let depth = 1;
    while (pos < source.length && failure === undefined) {
      const char = source[pos];
      if (char === "\\")
        pos += 2;
      else if (char === "'" || char === '"') {
        const end = source.indexOf(char, pos + 1);
        if (end === -1)
          return fail("unterminated quote");
        pos = end + 1;
      } else if (char === "$" && source[pos + 1] === "(") {
        pos += 2;
        list(true);
      } else if (char === "$" && source[pos + 1] === "{") {
        depth += 1;
        pos += 2;
      } else if (char === "}") {
        depth -= 1;
        pos += 1;
        if (depth === 0)
          return;
      } else
        pos += 1;
    }
    fail("unterminated parameter expansion");
  };
  const list = (nested, arithmetic = false) => {
    let words = [];
    let outputs = [];
    let current = null;
    let literal = "";
    let dynamic = false;
    let redirect = null;
    let parenDepth = 0;
    let arithmeticBase = -1;
    let closed = false;
    const endWord = () => {
      if (current === null)
        return;
      const text = current;
      const windows = literal;
      current = null;
      literal = "";
      const isDynamic = dynamic;
      dynamic = false;
      if (redirect === "out")
        outputs.push(...windows === text ? [text] : [text, windows]);
      else if (redirect === null)
        words.push({ text, dynamic: isDynamic, ...windows === text ? {} : { literal: windows } });
      redirect = null;
    };
    const endCommand = () => {
      endWord();
      if (words.length > 0 || outputs.length > 0)
        commands.push({ words, outputs });
      words = [];
      outputs = [];
      redirect = null;
    };
    const append = (text, computed = false, windows = text) => {
      current = (current ?? "") + text;
      literal += windows;
      if (computed)
        dynamic = true;
    };
    const dollar = (quoted) => {
      const next = source[pos + 1];
      if (next === "(") {
        const shift = source[pos + 2] === "(";
        pos += 2;
        append("$(...)", true);
        list(true, shift);
      } else if (next === "{") {
        pos += 2;
        append("${...}", true);
        skipBrace();
      } else if (next === "'" && !quoted) {
        let end = pos + 2;
        while (end < source.length && source[end] !== "'")
          end += source[end] === "\\" ? 2 : 1;
        if (end >= source.length)
          return fail("unterminated quote");
        append(decodeAnsi(source.slice(pos + 2, end)));
        pos = end + 1;
      } else if (next === '"' && !quoted) {
        pos += 1;
      } else if (next !== undefined && /[A-Za-z_]/.test(next)) {
        let end = pos + 1;
        while (/[A-Za-z0-9_]/.test(source[end] ?? ""))
          end += 1;
        append(source.slice(pos, end), true);
        pos = end;
      } else if (next !== undefined && /[0-9@*#?$!-]/.test(next)) {
        append(source.slice(pos, pos + 2), true);
        pos += 2;
      } else {
        append("$");
        pos += 1;
      }
    };
    const backtick = () => {
      let end = pos + 1;
      while (end < source.length && source[end] !== "`")
        end += source[end] === "\\" ? 2 : 1;
      if (end >= source.length)
        return fail("unterminated backtick");
      absorb(source.slice(pos + 1, end).replace(/\\([`$\\])/g, "$1"));
      append("`...`", true);
      pos = end + 1;
    };
    const doubleQuoted = () => {
      pos += 1;
      append("");
      while (failure === undefined) {
        const char = source[pos];
        if (char === undefined)
          return fail("unterminated quote");
        if (char === '"') {
          pos += 1;
          return;
        }
        if (char === "\\") {
          const next = source[pos + 1];
          if (next !== undefined && '$`"\\\n'.includes(next)) {
            if (next !== `
`)
              append(next);
            pos += 2;
          } else {
            append("\\");
            pos += 1;
          }
        } else if (char === "$")
          dollar(true);
        else if (char === "`")
          backtick();
        else {
          append(char);
          pos += 1;
        }
      }
    };
    const redirection = () => {
      const char = source[pos] ?? "";
      if (current !== null && /^\d+$/.test(current)) {
        current = null;
        literal = "";
        dynamic = false;
      } else
        endWord();
      if (source[pos + 1] === "(") {
        pos += 2;
        append("/dev/fd/0", true);
        list(true);
        endWord();
        return;
      }
      if (char === "<" && source.startsWith("<<<", pos)) {
        pos += 3;
        redirect = "in";
        return;
      }
      if (char === "<" && source.startsWith("<<", pos) && !arithmetic && arithmeticBase === -1) {
        pos += 2;
        pending.push(readHeredocDelimiter());
        return;
      }
      const operator = /^(>>|>\||>&|<&|<>|>|<)/.exec(source.slice(pos))?.[0] ?? char;
      pos += operator.length;
      redirect = operator.startsWith(">") || operator === "<>" ? "out" : "in";
    };
    while (pos < source.length && failure === undefined && !closed) {
      const char = source[pos] ?? "";
      if (char === "\\") {
        const next = source[pos + 1];
        if (next !== undefined && next !== `
`)
          append(next, false, KEPT_BACKSLASH.test(next) ? `\\${next}` : next);
        pos += 2;
      } else if (char === "'") {
        const end = source.indexOf("'", pos + 1);
        if (end === -1)
          fail("unterminated quote");
        else {
          append(source.slice(pos + 1, end));
          pos = end + 1;
        }
      } else if (char === '"')
        doubleQuoted();
      else if (char === "$")
        dollar(false);
      else if (char === "`")
        backtick();
      else if (char === " " || char === "\t") {
        endWord();
        pos += 1;
      } else if (char === `
`) {
        endCommand();
        pos += 1;
        if (pending.length > 0)
          consumeHeredocs();
      } else if (char === "#" && current === null) {
        const end = source.indexOf(`
`, pos);
        pos = end === -1 ? source.length : end;
      } else if (char === ";" || char === "|") {
        endCommand();
        pos += 1;
      } else if (char === "&") {
        endCommand();
        pos += 1;
      } else if (char === "<" || char === ">")
        redirection();
      else if (char === "(") {
        endWord();
        const last = words[words.length - 1];
        if (last !== undefined)
          words[words.length - 1] = { ...last, open: true };
        endCommand();
        const open = source[pos + 1] === "(" ? 2 : 1;
        if (open === 2 && arithmeticBase === -1)
          arithmeticBase = parenDepth;
        parenDepth += open;
        pos += open;
      } else if (char === ")") {
        endCommand();
        pos += 1;
        if (parenDepth > 0) {
          parenDepth -= 1;
          if (parenDepth <= arithmeticBase)
            arithmeticBase = -1;
        } else if (nested)
          closed = true;
      } else {
        const braceList = char === "{" && lookahead().separator > pos;
        const bracket = char === "[" && lookahead().close > pos;
        append(char, char === "*" || char === "?" || braceList || bracket);
        pos += 1;
      }
    }
    if (nested && !closed && failure === undefined)
      fail("unterminated substitution");
    endCommand();
  };
  list(false);
  if (pending.length > 0)
    consumeHeredocs();
  return failure === undefined ? { ok: true, commands } : { ok: false, reason: failure };
};

// src/hook/launchers.ts
var WORK_LIMIT = 8000000;
var newBudget = () => ({ left: WORK_LIMIT });
var overBudget = (budget, units) => {
  budget.left -= units;
  return budget.left < 0;
};
var TOO_LARGE_WHY = "it is too large to read";
var CUT_SHORT = { text: "$(...)", dynamic: true };
var CUT_OPEN = { ...CUT_SHORT, open: true };
var isCut = (words) => words[words.length - 1]?.open === true;
var START_VALUED = [
  "workingdirectory",
  "verb",
  "windowstyle",
  "credential",
  "environment",
  "redirectstandardinput",
  "erroraction",
  "ea",
  "warningaction",
  "wa",
  "informationaction",
  "infa",
  "errorvariable",
  "ev",
  "warningvariable",
  "wv",
  "informationvariable",
  "iv",
  "outvariable",
  "ov",
  "outbuffer",
  "ob",
  "pipelinevariable",
  "pv",
  "progressaction"
];
var START_OUTPUTS = ["redirectstandardoutput", "redirectstandarderror"];
var START_SWITCHES = ["wait", "nonewwindow", "passthru", "loaduserprofile", "usenewenvironment"];
var CMD_START_SWITCH = /^\/(\?|b|i|min|max|wait|separate|shared|low|normal|high|realtime|abovenormal|belownormal)$/i;
var CMD_START_VALUED = /^\/(d|node|affinity|machine)$/i;
var START_WORD = { text: "start", dynamic: false };
var FILE_FLAGS = ["filepath"];
var FILE_FLAGS_FIRST = ["filepath", "f"];
var LIST_FLAGS = ["argumentlist", "args"];
var LIST_FLAGS_FIRST = ["argumentlist", "args", "a"];
var NO_ARGUMENTS = { words: [], outputs: [] };
var isStartFlag = (text, names) => {
  if (text.charCodeAt(0) !== 45 || !/^-[A-Za-z]+$/.test(text))
    return false;
  const spelled = text.slice(1).toLowerCase();
  return names.some((full) => full.startsWith(spelled) && (spelled.length > 1 || spelled === full));
};
var attachedValue = (word) => {
  const colon = word.text.startsWith("-") ? word.text.indexOf(":") : -1;
  if (colon <= 1)
    return [word.text, undefined];
  const literal = word.literal?.slice(word.literal.indexOf(":") + 1);
  return [
    word.text.slice(0, colon),
    {
      text: word.text.slice(colon + 1),
      dynamic: word.dynamic,
      ...literal === undefined ? {} : { literal }
    }
  ];
};
var listFrom = (words, from, first) => {
  const list = first === undefined ? [] : [first];
  for (let index = from;index < words.length; index += 1) {
    const word = words[index];
    if (word === undefined)
      break;
    const previous = list[list.length - 1];
    if (previous !== undefined && !previous.text.endsWith(",") && !word.text.startsWith(","))
      break;
    list.push(word);
  }
  return list;
};
var argumentText = (elements) => elements.map((element) => {
  if (element.dynamic)
    return element.text;
  const text = element.literal ?? element.text;
  return text === "@" ? CUT_SHORT.text : text.replaceAll(",", " ");
}).join(" ").replaceAll(/\$\(\.\.\.\)|\$\{\.\.\.\}|`\.\.\.`/g, "$_");
var argumentCommands = (text) => {
  const scan = scanScript(text);
  if (scan.ok)
    return scan.commands;
  const words = text.split(/\s+/).filter((part) => part !== "");
  return [{ words: words.map((part) => ({ text: part, dynamic: false })), outputs: [] }];
};
var afterHashtable = (judge, words, flagAt, valueAt, depth, budget) => {
  const before = words.slice(0, flagAt);
  const judgeAfter = (after) => judge.words([...before, ...after.length === 0 ? [CUT_OPEN] : after], depth + 1, budget);
  let closed = false;
  for (let end = valueAt;end < words.length; end += 1) {
    if (words[end]?.text.includes("}") !== true)
      continue;
    closed = true;
    const verdict = judgeAfter(words.slice(end + 1));
    if (verdict !== undefined)
      return verdict;
  }
  return closed ? undefined : judgeAfter([]);
};
var environmentOf = (judge, words, valueAt, inline) => {
  const value = inline ?? words[valueAt];
  if (value === undefined)
    return;
  let end = valueAt;
  if (value.text.startsWith("@{")) {
    for (let index = valueAt;index < words.length; index += 1)
      if (words[index]?.text.includes("}") === true)
        end = index;
  }
  const texts = [value.text, ...words.slice(valueAt + 1, end + 1).map((word) => word.text)];
  for (const text of texts)
    for (const [name] of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const verdict = judge.variable(name);
      if (verdict !== undefined)
        return verdict;
    }
  return;
};
var classifyStartProcess = (judge, words, depth, budget, speculative = false) => {
  if (depth > judge.maxDepth)
    return judge.unsure("commands nested too deeply");
  if (overBudget(budget, words.length))
    return judge.unsure(TOO_LARGE_WHY);
  const head = words[0] ?? START_WORD;
  let file;
  let fileAt = -1;
  const elements = [];
  const written = [];
  for (let index = 1;index < words.length; index += 1) {
    const word = words[index];
    if (word === undefined)
      break;
    const [name, inline] = attachedValue(word);
    if (word.text.charCodeAt(0) === 64 && /^@[A-Za-z_]\w*$/.test(word.text)) {
      if (file === undefined && !speculative)
        file = CUT_SHORT;
      else
        elements.push(CUT_SHORT);
    } else if (isStartFlag(name, file === undefined ? FILE_FLAGS_FIRST : FILE_FLAGS)) {
      file = inline ?? words[index + 1] ?? CUT_SHORT;
      fileAt = -1;
      if (inline === undefined)
        index += 1;
    } else if (isStartFlag(name, file === undefined ? LIST_FLAGS_FIRST : LIST_FLAGS)) {
      const list = listFrom(words, index + 1, inline);
      elements.push(...list.length === 0 ? [CUT_SHORT] : list);
      index += list.length - (inline === undefined ? 0 : 1);
    } else if (isStartFlag(name, START_OUTPUTS)) {
      const target = inline ?? words[index + 1];
      if (target !== undefined)
        written.push(target.text, ...target.literal ? [target.literal] : []);
      if (inline === undefined)
        index += 1;
    } else if (isStartFlag(name, START_VALUED)) {
      const valueAt = inline === undefined ? index + 1 : index;
      if (isStartFlag(name, ["environment"])) {
        const verdict = environmentOf(judge, words, valueAt, inline);
        if (verdict !== undefined)
          return verdict;
      }
      if ((inline ?? words[index + 1])?.text.startsWith("@{") === true)
        return afterHashtable(judge, words, index, valueAt, depth, budget);
      if (inline === undefined)
        index += 1;
    } else if (isStartFlag(name, START_SWITCHES))
      continue;
    else if (file === undefined) {
      if (CMD_START_VALUED.test(word.text))
        index += 1;
      else if (word.text.startsWith("-")) {
        const without = (count) => [...words.slice(0, index), ...words.slice(index + count)];
        return classifyStartProcess(judge, without(1), depth + 1, budget, speculative) ?? classifyStartProcess(judge, without(2), depth + 1, budget, true);
      } else if (!CMD_START_SWITCH.test(word.text)) {
        file = word;
        fileAt = index;
      }
    } else {
      const list = listFrom(words, index + 1, word);
      elements.push(...list);
      index += list.length - 1;
    }
  }
  if (isCut(words)) {
    if (file === undefined)
      file = speculative ? undefined : CUT_SHORT;
    else if (elements.length === 0 || elements[elements.length - 1]?.open === true)
      elements.push(CUT_SHORT);
  }
  if (file === undefined)
    return;
  const text = argumentText(elements);
  const large = judge.oversize(text);
  if (large !== undefined)
    return large;
  if (overBudget(budget, text.length >> 1))
    return judge.unsure(TOO_LARGE_WHY);
  const [first = NO_ARGUMENTS, ...others] = argumentCommands(text);
  const launched = {
    words: [file, ...first.words],
    outputs: [...first.outputs, ...written]
  };
  let verdict = judge.simple(launched, depth + 1, budget);
  for (const other of others)
    verdict ??= judge.simple(other, depth + 1, budget);
  if (verdict !== undefined || speculative || fileAt === -1)
    return verdict;
  return classifyStartProcess(judge, [head, ...words.slice(fileAt + 1)], depth + 1, budget, true);
};
var HOSTS = {
  wsl: {
    valued: ["-d", "--distribution", "--distribution-id", "-u", "--user", "--cd", "--shell-type"],
    switches: ["-e", "--exec", "--system"]
  },
  conhost: { valued: ["--width", "--height", "--signal", "--server"], switches: ["--headless"] },
  wt: {
    valued: [
      "-w",
      "--window",
      "-d",
      "--startingDirectory",
      "-p",
      "--profile",
      "--title",
      "--tabColor",
      "--colorScheme",
      "--pos",
      "--size",
      "-s"
    ],
    switches: [
      "-M",
      "--maximized",
      "-F",
      "--fullscreen",
      "-f",
      "--focus",
      "-H",
      "-V",
      "-D",
      "--duplicate",
      "--suppressApplicationTitle"
    ]
  }
};
var NO_HOST = { valued: [], switches: [] };
var TERMINAL_SUBCOMMANDS = new Set(["new-tab", "nt", "split-pane", "sp"]);
var terminalCommands = (words) => {
  let current = [];
  const commands = [current];
  for (const word of words) {
    if (word.dynamic || !word.text.endsWith(";"))
      current.push(word);
    else {
      if (word.text !== ";")
        current.push({
          ...word,
          text: word.text.slice(0, -1),
          ...word.literal === undefined ? {} : { literal: word.literal.slice(0, -1) }
        });
      current = [];
      commands.push(current);
    }
  }
  return commands;
};
var isHostLeader = (name, text) => name === "wsl" ? text === "~" : name === "wt" && TERMINAL_SUBCOMMANDS.has(text.toLowerCase());
var readOptions = (host, command, from) => {
  for (let index = from;index < command.length; index += 1) {
    const text = command[index]?.text ?? "";
    if (text === "--")
      return { start: index + 1 };
    if (!text.startsWith("-") || text === "-")
      return { start: index };
    if (host.valued.includes(text))
      index += 1;
    else if (!host.switches.includes(text))
      return { start: index, unknown: index };
  }
  return { start: command.length };
};
var hostedCommand = (judge, name, head, command, cut, depth, budget) => {
  const host = HOSTS[name] ?? NO_HOST;
  let options = readOptions(host, command, 0);
  if (options.unknown === undefined && isHostLeader(name, command[options.start]?.text ?? ""))
    options = readOptions(host, command, options.start + 1);
  if (options.unknown !== undefined) {
    const at = options.unknown;
    const without = (count) => [head, ...command.slice(0, at), ...command.slice(at + count)];
    return judge.words(without(1), depth + 1, budget) ?? judge.words(without(2), depth + 1, budget);
  }
  const inner = command.slice(options.start);
  const run = cut ? [...inner, CUT_SHORT] : inner;
  if (run.length > 1)
    return judge.line(run, depth, budget);
  return judge.words(run, depth + 1, budget) ?? judge.line(run, depth, budget);
};
var hosted = (name) => (judge, words, depth, budget) => {
  if (overBudget(budget, words.length))
    return judge.unsure(TOO_LARGE_WHY);
  const head = words[0] ?? { text: name, dynamic: false };
  const rest = words.slice(1);
  const commands = name === "wt" ? terminalCommands(rest) : [rest];
  for (const [position, command] of commands.entries()) {
    const cut = isCut(words) && position === commands.length - 1;
    const verdict = hostedCommand(judge, name, head, command, cut, depth, budget);
    if (verdict !== undefined)
      return verdict;
  }
  return;
};
var NEEDS_QUOTES = /[\s'"\\$`;&|<>()#*?[]/;
var blockWord = (word) => {
  const text = word.literal ?? word.text;
  if (word.dynamic && /[\s#]/.test(text))
    return `"${text.replaceAll("\\", "\\\\").replaceAll('"', "\\\"")}"`;
  if (!word.dynamic && (text === "" || NEEDS_QUOTES.test(text)))
    return `'${text.replaceAll("'", "'\\''")}'`;
  return text.replaceAll(/[{}]/g, ";");
};
var classifyScriptBlock = (judge, words, depth, budget) => judge.script(`: ${words.slice(1).map(blockWord).join(" ")}`, depth + 1, budget);
var startProcess = (judge, words, depth, budget) => classifyStartProcess(judge, words, depth, budget);
var launchersNamed = (names, launcher) => names.map((name) => [name, launcher]);
var LAUNCHERS = Object.fromEntries([
  ...launchersNamed(["start-process", "saps", "start"], startProcess),
  ...["wsl", "conhost", "wt"].map((name) => [name, hosted(name)]),
  ...launchersNamed([...TERMINAL_SUBCOMMANDS], hosted("wt")),
  ...launchersNamed(["invoke-command", "icm", "start-job", "sajb", "start-threadjob"], classifyScriptBlock)
]);

// src/hook/policy.ts
var MAX_DEPTH = 6;
var MAX_JUDGED_BYTES = 1024 * 1024;
var REASONS = {
  git: (sub) => `git ${sub} writes VCS state, and VCS writes belong to the root. Describe the change in your report (files and intent) and the root commits it. git status, diff, log, show, blame and fetch are open to you.`,
  gh: (sub) => `gh ${sub} is a write or an unlisted gh command, and gh writes belong to the root. Put the finding in your report. Open to you: gh pr view|checks|diff|list|status, run view|list, issue view|list, repo view, and gh api for plain reads.`,
  holyclaude: (sub) => `holyclaude ${sub} changes Intent and Assignment state, which the root owns. Read it with holyclaude intent show, assignment show, assignment list, assignment verify, routes and reconcile.`,
  state: `The .holyclaude state files are written by the root through the holyclaude CLI. Describe the state you need in your report.`,
  gitDir: `The .git directory holds the hooks and settings that run at the root's next commit, so only the root changes it. Reading it is open to you; describe the change you need in your report.`,
  config: (key) => `git -c ${key} can run programs. A git read accepts display settings with -c (color.*, core.quotepath, diff.renames and similar); drop the setting or use one of those.`,
  env: (name) => `${name} makes git run a program or read configuration the guard cannot check, as git -c does for most keys. Drop the variable; to change how a git read looks, use git -c with a display setting (color.*, core.quotepath, diff.renames and similar).`,
  unsure: (why) => `This command cannot be verified (${why}). Write it as plain commands with literal program names, for example one git read per command, so it can run.`,
  oversized: (what, bytes) => `This ${what} is ${bytes} bytes and the guard reads at most ${MAX_JUDGED_BYTES}, so it cannot be checked. Shorten it, or send the work in smaller calls, for example one shorter command at a time.`,
  noTool: `This tool call names no tool that can be read, so it cannot be checked. Retry the call, and report it to the root if it recurs.`,
  noPath: (tool) => `This ${tool} call names no file path that can be read, so it cannot be checked. Send the path as a plain string.`
};
var TOO_LARGE = REASONS.unsure(TOO_LARGE_WHY);
var oversize = (what, text) => {
  if (text.length * 3 <= MAX_JUDGED_BYTES)
    return;
  const bytes = Buffer.byteLength(text);
  return bytes > MAX_JUDGED_BYTES ? REASONS.oversized(what, bytes) : undefined;
};
var GIT_READS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "blame",
  "rev-parse",
  "ls-files",
  "grep",
  "cat-file",
  "describe",
  "archive",
  "ls-tree",
  "rev-list",
  "show-ref",
  "merge-base",
  "for-each-ref",
  "shortlog",
  "diff-tree",
  "name-rev",
  "ls-remote",
  "check-ignore",
  "version",
  "help"
]);
var GIT_PATHLESS_GLOBALS = new Set([
  "-p",
  "--paginate",
  "-P",
  "--no-pager",
  "--bare",
  "--no-replace-objects",
  "--literal-pathspecs",
  "--glob-pathspecs",
  "--noglob-pathspecs",
  "--icase-pathspecs",
  "--no-optional-locks",
  "--no-lazy-fetch",
  "--no-advice"
]);
var GIT_VALUE_GLOBALS = new Set([
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix"
]);
var GIT_INLINE_GLOBALS = /^--(git-dir|work-tree|namespace|super-prefix|attr-source)=/;
var GIT_INFO_GLOBALS = new Set(["--version", "--help", "-h", "--html-path", "--man-path"]);
var GIT_DISPLAY_CONFIG = /^(color\.|column\.|advice\.|core\.(quotepath|abbrev|whitespace|autocrlf|safecrlf|filemode|ignorecase|precomposeunicode|longpaths|symlinks)$|diff\.(algorithm|context|renames|colormoved|colormovedws|noprefix|mnemonicprefix|ignoresubmodules|interhunkcontext|wserrorhighlight)$|log\.(abbrevcommit|date|decorate|follow|showroot)$|status\.(short|branch|showuntrackedfiles|renames|aheadbehind)$)/;
var GIT_EXEC_FLAGS = /^--(upload-pack|receive-pack|exec|ext-diff|open-files-in-pager|config-env)(=|$)/;
var GIT_EXEC_ENV = /^(git_(external_diff|pager|ssh|ssh_command|askpass|proxy_command|exec_path|allow_protocol|config(_(count|parameters|global|system|(key|value)_\d+))?)|pager|ssh_askpass)$/i;
var ENV_SETTERS = new Set(["export", "declare", "typeset", "readonly", "local", "set"]);
var ENV_NAMERS = new Set(["setenv", "setx"]);
var ITEM_WRITERS = new Set([
  "set-item",
  "si",
  "new-item",
  "ni",
  "copy-item",
  "cpi",
  "rename-item",
  "rni",
  "set-content",
  "sc",
  "add-content",
  "ac"
]);
var BRANCH_FLAGS = new Set([
  "-l",
  "--list",
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-v",
  "-vv",
  "--verbose",
  "--show-current",
  "-i",
  "--ignore-case",
  "--no-abbrev",
  "--column",
  "--no-column",
  "--color",
  "--no-color"
]);
var BRANCH_VALUE_FLAGS = new Set([
  "--merged",
  "--no-merged",
  "--contains",
  "--no-contains",
  "--sort",
  "--format",
  "--points-at",
  "--abbrev"
]);
var TAG_FLAGS = new Set([
  "-l",
  "--list",
  "-v",
  "--verify",
  "-i",
  "--ignore-case",
  "--column",
  "--no-column",
  "--color",
  "--no-color"
]);
var CONFIG_READ_ACTIONS = new Set([
  "-l",
  "--list",
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "get",
  "list"
]);
var CONFIG_NEUTRAL = new Set([
  "--global",
  "--local",
  "--system",
  "--worktree",
  "--show-origin",
  "--show-scope",
  "--name-only",
  "-z",
  "--null",
  "--includes",
  "--no-includes",
  "--bool",
  "--int",
  "--path",
  "--expiry-date",
  "--bool-or-int"
]);
var WRAPPERS = {
  env: { values: ["-u", "-C", "--unset", "--chdir"], leading: 0, script: ["-S", "--split-string"] },
  command: { values: [], leading: 0 },
  exec: { values: ["-a"], leading: 0 },
  builtin: { values: [], leading: 0 },
  nohup: { values: [], leading: 0 },
  setsid: { values: [], leading: 0 },
  time: { values: ["-f", "-o", "--format", "--output"], leading: 0 },
  nice: { values: ["-n", "--adjustment"], leading: 0 },
  ionice: { values: ["-c", "-n", "-p", "-P", "-u"], leading: 0 },
  stdbuf: { values: ["-i", "-o", "-e"], leading: 0 },
  timeout: { values: ["-s", "-k", "--signal", "--kill-after"], leading: 1 },
  sudo: { values: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"], leading: 0 },
  doas: { values: ["-u", "-C"], leading: 0 },
  xargs: {
    values: ["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a", "-l", "-i"],
    leading: 0
  },
  watch: { values: ["-n", "-d", "--interval"], leading: 0, line: true },
  unbuffer: { values: [], leading: 0 },
  chronic: { values: [], leading: 0 },
  taskset: { values: [], leading: 1 },
  flock: { values: ["-w", "-E"], leading: 1, script: ["-c", "--command"] },
  busybox: { values: [], leading: 0 },
  call: { values: [], leading: 0 },
  ".": { values: [], leading: 0 }
};
var XARGS_INPUT = [
  { text: "x", dynamic: false },
  { text: "x:x", dynamic: false }
];
var PLAIN_WORD = /^[\w./:=@%+,-]+$/;
var SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh"]);
var RUNTIMES = new Set(["bun", "bunx", "node", "npx", "deno", "tsx", "ts-node", "pnpm", "yarn"]);
var BREAKS = new Set(["for", "select", "case", "fi", "done", "esac", "}", "[["]);
var OPENERS = new Set(["if", "then", "elif", "else", "while", "until", "do", "!", "{", "coproc"]);
var FILE_WRITERS = new Set([
  "rm",
  "mv",
  "cp",
  "tee",
  "dd",
  "truncate",
  "install",
  "ln",
  "rsync",
  "unlink",
  "shred",
  "touch",
  "remove-item",
  "ri",
  "del",
  "erase",
  "rd",
  "rmdir",
  "move-item",
  "mi",
  "move",
  "copy-item",
  "copy",
  "cpi",
  "set-content",
  "sc",
  "add-content",
  "ac",
  "clear-content",
  "clc",
  "out-file",
  "new-item",
  "ni",
  "rename-item",
  "rni",
  "tee-object",
  "mkdir",
  "md",
  "chmod",
  "chown",
  "patch",
  "curl",
  "wget",
  "invoke-webrequest",
  "iwr",
  "invoke-restmethod",
  "irm",
  "tar",
  "unzip",
  "expand-archive",
  "mklink",
  "xcopy",
  "robocopy",
  "ren",
  "rename"
]);
var HOLYCLAUDE = /^holyclaude(\.js)?$/;
var RUNTIME_VALUE_FLAGS = new Set([
  "--cwd",
  "-c",
  "--config",
  "--env-file",
  "--preload",
  "-r",
  "--require",
  "--import",
  "--filter",
  "--port",
  "--tsconfig-override",
  "-d",
  "--define",
  "--conditions",
  "--loader"
]);
var PACKAGE_RUNNERS = new Set(["bunx", "npx"]);
var RUNNER_SUBCOMMANDS = new Set(["x", "dlx", "exec"]);
var partStart = (path) => Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
var program = (path) => path.slice(partStart(path)).toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
var isAssignment = (text) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(text);
var classifyAssignment = (text) => {
  if (!isAssignment(text))
    return;
  const name = text.slice(0, text.indexOf("=")).replace(/\+$/, "");
  return GIT_EXEC_ENV.test(name) ? REASONS.env(name) : undefined;
};
var texts = (words) => words.map((word) => word.text);
var GIT_DIR_PART = /^(\.git|git~\d+)[. ]*(:|$)/;
var STATE_SHORT_PART = /^holycl~\d+[. ]*(:|$)/;
var PATH_PART_END = /[\\/=]/;
var PATTERN = /[*?[{]/;
var protectedReason = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes(".holyclaude"))
    return REASONS.state;
  const parts = lower.split(PATH_PART_END);
  if (parts.some((part) => STATE_SHORT_PART.test(part)))
    return REASONS.state;
  return parts.some((part) => GIT_DIR_PART.test(part)) ? REASONS.gitDir : undefined;
};
var writtenReason = (text) => {
  const named = protectedReason(text);
  if (named !== undefined || !PATTERN.test(text))
    return named;
  const name = protectedNameOf(text);
  if (name === undefined)
    return;
  return name === ".git" ? REASONS.gitDir : REASONS.state;
};
var firstReason = (reasons) => reasons.find((reason) => reason !== undefined);
var pathsOf = (text) => {
  if (!text.startsWith("-"))
    return [text];
  const colon = text.indexOf(":");
  return [
    text,
    ...text.startsWith("--") ? [] : [text.slice(2)],
    ...colon === -1 ? [] : [text.slice(colon + 1)]
  ];
};
var wordReason = (word) => firstReason([word.text, ...word.literal === undefined ? [] : [word.literal]].flatMap(pathsOf).map(writtenReason));
var isHolyclaude = (path) => HOLYCLAUDE.test(program(path));
var isEntry = (path) => isHolyclaude(path) || /packages\/cli\/(src\/)?main\.(ts|js)$/.test(path.replaceAll("\\", "/").toLowerCase());
var readsAs = (word, test) => test(word.text) || word.literal !== undefined && test(word.literal);
var programOf = (word) => word.dynamic && /[$`*?[{]/.test(word.text.slice(partStart(word.text))) ? undefined : program(word.text);
var classifyGitBranch = (args) => {
  let listing = false;
  const positionals = [];
  for (let index = 0;index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "-l" || arg === "--list")
      listing = true;
    if (BRANCH_FLAGS.has(arg))
      continue;
    if (/^-[larvi]{2,}$/.test(arg)) {
      if (arg.includes("l"))
        listing = true;
      continue;
    }
    if (BRANCH_VALUE_FLAGS.has(arg))
      index += 1;
    else if (/^--(merged|no-merged|contains|no-contains|sort|format|points-at|abbrev)=/.test(arg))
      continue;
    else if (arg.startsWith("-"))
      return false;
    else
      positionals.push(arg);
  }
  return positionals.length === 0 || listing;
};
var classifyGitTag = (args) => {
  let listing = false;
  const positionals = [];
  for (let index = 0;index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "-l" || arg === "--list" || arg === "-v" || arg === "--verify")
      listing = true;
    if (TAG_FLAGS.has(arg) || /^-n\d*$/.test(arg)) {
      if (/^-n\d*$/.test(arg))
        listing = true;
      continue;
    }
    if (/^-(?:[liv]|n\d*){2,}$/.test(arg)) {
      if (/[lvn]/.test(arg))
        listing = true;
      continue;
    }
    if ([
      "--contains",
      "--no-contains",
      "--points-at",
      "--merged",
      "--no-merged",
      "--sort",
      "--format"
    ].includes(arg))
      index += 1;
    else if (/^--(contains|no-contains|points-at|merged|no-merged|sort|format)=/.test(arg))
      continue;
    else if (arg.startsWith("-"))
      return false;
    else
      positionals.push(arg);
  }
  return positionals.length === 0 || listing;
};
var classifyGitConfig = (args) => {
  let reading = false;
  const positionals = [];
  for (let index = 0;index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (CONFIG_READ_ACTIONS.has(arg))
      reading = true;
    else if (CONFIG_NEUTRAL.has(arg))
      continue;
    else if (arg === "--file" || arg === "-f" || arg === "--blob" || arg === "--type" || arg === "-t")
      index += 1;
    else if (arg === "--default")
      index += 1;
    else if (arg.startsWith("-"))
      return false;
    else
      positionals.push(arg);
  }
  return reading || positionals.length === 1;
};
var classifyGitFetch = (args) => {
  const positionals = args.filter((arg) => !arg.startsWith("-"));
  const flagsOk = args.every((arg) => !/^(-u|--update-head-ok|--refmap=.*)$/.test(arg) && !GIT_EXEC_FLAGS.test(arg));
  return flagsOk && positionals.slice(1).every((spec) => !spec.includes(":"));
};
var classifyGitSub = (sub, rest) => {
  const args = texts(rest);
  const deny = REASONS.git(sub);
  if (GIT_READS.has(sub)) {
    if (args.some((arg) => GIT_EXEC_FLAGS.test(arg)))
      return deny;
    if (sub === "grep" && args.some((arg) => arg.startsWith("-O")))
      return deny;
    return;
  }
  switch (sub) {
    case "fetch":
      return classifyGitFetch(args) ? undefined : deny;
    case "branch":
      return classifyGitBranch(args) ? undefined : deny;
    case "tag":
      return classifyGitTag(args) ? undefined : deny;
    case "config":
      return classifyGitConfig(args) ? undefined : deny;
    case "remote": {
      const [first, ...others] = args.filter((arg) => !/^-v+$/.test(arg) && arg !== "--verbose");
      if (first === undefined)
        return;
      if (first === "show" || first === "get-url")
        return others.every((a) => !a.startsWith("-") || ["-n", "--push", "--all"].includes(a)) ? undefined : deny;
      return deny;
    }
    case "stash":
      return args[0] === "list" || args[0] === "show" ? undefined : deny;
    case "worktree":
      return args[0] === "list" ? undefined : deny;
    default:
      return deny;
  }
};
var classifyGit = (args) => {
  let index = 0;
  while (index < args.length) {
    const word = args[index];
    if (word === undefined || !word.text.startsWith("-"))
      break;
    const flag = word.text;
    if (flag === "-c" || flag === "--config-env" || flag.startsWith("--config-env=")) {
      const attached = flag.startsWith("--config-env=") ? flag.slice("--config-env=".length) : undefined;
      const setting = attached ?? args[index + 1]?.text;
      if (setting === undefined)
        return REASONS.unsure(`git ${flag} without a value`);
      const key = setting.split("=")[0] ?? "";
      if (!GIT_DISPLAY_CONFIG.test(key.toLowerCase()))
        return REASONS.config(key);
      index += attached === undefined ? 2 : 1;
    } else if (GIT_VALUE_GLOBALS.has(flag)) {
      if (args[index + 1] === undefined)
        return REASONS.unsure(`git ${flag} without a value`);
      index += 2;
    } else if (GIT_INLINE_GLOBALS.test(flag) || GIT_PATHLESS_GLOBALS.has(flag))
      index += 1;
    else if (GIT_INFO_GLOBALS.has(flag) || flag === "--exec-path")
      return;
    else
      return REASONS.git(flag);
  }
  const sub = args[index];
  if (sub === undefined)
    return;
  if (sub.dynamic)
    return REASONS.unsure("the git subcommand is computed");
  return classifyGitSub(sub.text, args.slice(index + 1));
};
var GH_READS = {
  pr: ["view", "checks", "diff", "list", "status"],
  run: ["view", "list"],
  issue: ["view", "list", "status"],
  repo: ["view"]
};
var GH_API_FIELDS = new Set(["-f", "-F", "--field", "--raw-field"]);
var GH_API_VALUE_FLAGS = new Set([
  "-H",
  "--header",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
  "-p",
  "--preview"
]);
var attached = (arg) => {
  if (arg.startsWith("--")) {
    const at = arg.indexOf("=");
    return at === -1 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
  }
  return /^-[XfF]./.test(arg) ? [arg.slice(0, 2), arg.slice(2)] : [arg, undefined];
};
var classifyGhApi = (args) => {
  const deny = REASONS.gh("api with a write method, fields, a body or a GraphQL mutation");
  let method = "";
  let endpoint;
  let body = false;
  const fields = [];
  for (let index = 0;index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const [flag, inline] = attached(arg);
    const isMethod = flag === "-X" || flag === "--method";
    const valued = isMethod || GH_API_FIELDS.has(flag) || flag === "--input" || GH_API_VALUE_FLAGS.has(flag);
    const value = valued ? inline ?? args[++index] ?? "" : undefined;
    if (isMethod)
      method = (value ?? "").toUpperCase();
    else if (GH_API_FIELDS.has(flag))
      fields.push(value ?? "");
    else if (flag === "--input")
      body = true;
    else if (!valued && /^-[A-Za-z]*[XfF]/.test(arg) && !arg.startsWith("--"))
      return deny;
    else if (!valued && !arg.startsWith("-") && endpoint === undefined)
      endpoint = arg;
  }
  if (body)
    return deny;
  if (endpoint === "graphql") {
    const queries = fields.filter((field) => field.startsWith("query="));
    const reads = queries.length > 0 && queries.every((query) => !/mutation/i.test(query) && !query.startsWith("query=@"));
    return reads && ["", "GET", "POST"].includes(method) ? undefined : deny;
  }
  if (method === "" ? fields.length > 0 : method !== "GET" && method !== "HEAD")
    return deny;
  return;
};
var classifyGh = (input) => {
  let from = 0;
  for (;; ) {
    const text = input[from]?.text ?? "";
    if (text === "-R" || text === "--repo")
      from += 2;
    else if (text.startsWith("--repo=") || /^-R./.test(text))
      from += 1;
    else
      break;
  }
  const args = input.slice(from);
  const [group, action] = args;
  if (group === undefined)
    return;
  if (group.dynamic || action?.dynamic === true)
    return REASONS.unsure("the gh subcommand is computed");
  if (["--version", "--help", "-h"].includes(group.text))
    return;
  if (group.text === "api")
    return classifyGhApi(texts(args.slice(1)));
  const allowed = GH_READS[group.text];
  if (allowed !== undefined && action !== undefined && allowed.includes(action.text))
    return;
  return REASONS.gh(args.slice(0, 2).map((word) => word.text).join(" "));
};
var HOLYCLAUDE_READS = new Set([
  "intent show",
  "assignment show",
  "assignment list",
  "assignment verify",
  "routes"
]);
var classifyHolyclaude = (args) => {
  const [first, second] = texts(args);
  if (first === undefined)
    return;
  if (args.slice(0, 2).some((word) => word.dynamic))
    return REASONS.unsure("the holyclaude subcommand is computed");
  if (args.some((word) => word.text === "--help" || word.text === "-h"))
    return;
  if (first === "--version" || first === "-V" || first === "help")
    return;
  if (first === "reconcile" && (second === undefined || second.startsWith("-")))
    return;
  if (first === "routes")
    return;
  return HOLYCLAUDE_READS.has(`${first} ${second ?? ""}`) ? undefined : REASONS.holyclaude(second === undefined || second.startsWith("-") ? first : `${first} ${second}`);
};
var classifyLine = (words, depth, budget) => {
  const [first] = words;
  if (first === undefined)
    return;
  if (first.dynamic)
    return REASONS.unsure("the command text is computed");
  const asWords = words.length > 1 ? classifyWords(words, depth + 1, budget) : undefined;
  if (words.length > 1 && words.every((word) => !word.dynamic && PLAIN_WORD.test(word.text)))
    return asWords;
  const line = words.map((word) => word.literal ?? word.text).join(" ");
  return asWords ?? classifyScript(line, depth + 1, budget);
};
var carriedScript = (wrapper, rest, index) => {
  const word = rest[index];
  if (word === undefined)
    return;
  for (const flag of wrapper.script ?? []) {
    if (word.text === flag) {
      const value = rest[index + 1];
      return { text: value?.text, dynamic: value?.dynamic ?? false, width: 2 };
    }
    const prefix = flag.startsWith("--") ? `${flag}=` : flag;
    if (word.text.startsWith(prefix))
      return { text: word.text.slice(prefix.length), dynamic: word.dynamic, width: 1 };
  }
  return;
};
var unwrap2 = (name, rest, depth, budget) => {
  const wrapper = WRAPPERS[name];
  if (wrapper === undefined)
    return rest;
  let index = 0;
  let leading = 0;
  while (index < rest.length) {
    const word = rest[index];
    if (word === undefined)
      break;
    const text = word.text;
    if (text === "--") {
      index += 1;
      break;
    }
    if (name === "command" && (text === "-v" || text === "-V"))
      return [];
    const carried = carriedScript(wrapper, rest, index);
    if (carried !== undefined) {
      if (carried.text === undefined || carried.dynamic)
        return REASONS.unsure(`the ${name} command text is computed`);
      const verdict = classifyScript(carried.text, depth + 1, budget);
      if (verdict !== undefined)
        return verdict;
      index += carried.width;
      continue;
    }
    if (text.startsWith("-") && text.length > 1) {
      index += wrapper.values.includes(text) ? 2 : 1;
      continue;
    }
    if (name === "env" && isAssignment(text)) {
      const verdict = classifyAssignment(text);
      if (verdict !== undefined)
        return verdict;
      index += 1;
      continue;
    }
    if (leading < wrapper.leading) {
      leading += 1;
      index += 1;
      continue;
    }
    break;
  }
  const tail = rest.slice(index);
  return wrapper.line === true ? classifyLine(tail, depth, budget) ?? [] : tail;
};
var findAfter = (words, markers) => {
  const start = words.findIndex((word) => markers.includes(word.text));
  if (start === -1)
    return;
  const tail = words.slice(start + 1);
  const end = tail.findIndex((word) => word.text === ";" || word.text === "+");
  return end === -1 ? tail : tail.slice(0, end);
};
var isCommandFlag = (text) => /^-[A-Za-z]+$/.test(text) && text.includes("c");
var classifyShell = (rest, depth, budget) => {
  const flagged = rest.findIndex((word) => isCommandFlag(word.text));
  if (flagged !== -1) {
    const script = rest.slice(flagged + 1).find((word) => !word.text.startsWith("-"));
    if (script === undefined)
      return;
    if (script.dynamic)
      return REASONS.unsure("the shell script text is computed");
    return classifyScript(script.text, depth + 1, budget);
  }
  if (rest.some((word) => ["--version", "--help", "-V"].includes(word.text)))
    return;
  const file = rest.find((word) => !word.text.startsWith("-") || word.text === "-");
  if (file === undefined || file.text === "-" || rest.some((word) => word.text === "-s"))
    return REASONS.unsure("a shell reading commands from input");
  if (readsAs(file, isHolyclaude))
    return classifyHolyclaude(rest.slice(rest.indexOf(file) + 1));
  return;
};
var isFlagFor = (text, full) => /^[-/][A-Za-z]+$/.test(text) && full.startsWith(text.slice(1).toLowerCase());
var POWERSHELL_SWITCHES = [
  "noprofile",
  "nologo",
  "noninteractive",
  "noexit",
  "sta",
  "mta",
  "login",
  "interactive"
];
var POWERSHELL_VALUED = [
  "executionpolicy",
  "ep",
  "windowstyle",
  "outputformat",
  "inputformat",
  "version",
  "psconsolefile",
  "configurationname",
  "workingdirectory",
  "wd",
  "custompipename",
  "settingsfile"
];
var POWERSHELL_OTHER = ["encodedcommand", "file"];
var classifyPowerShell = (rest, depth, budget) => {
  if (depth > MAX_DEPTH)
    return REASONS.unsure("commands nested too deeply");
  if (overBudget(budget, rest.length))
    return TOO_LARGE;
  const flagged = rest.findIndex((word) => isFlagFor(word.text, "command"));
  let start = flagged === -1 ? -1 : flagged + 1;
  for (let index = 0;flagged === -1 && index < rest.length; index += 1) {
    const text = rest[index]?.text ?? "";
    const named = (names) => names.some((full) => isFlagFor(text, full));
    if (!text.startsWith("-")) {
      start = index;
      break;
    }
    if (named(POWERSHELL_VALUED))
      index += 1;
    else if (!named(POWERSHELL_SWITCHES) && !named(POWERSHELL_OTHER)) {
      const without = (count) => [...rest.slice(0, index), ...rest.slice(index + count)];
      return classifyPowerShell(without(1), depth + 1, budget) ?? classifyPowerShell(without(2), depth + 1, budget);
    }
  }
  const flags = start === -1 ? rest : rest.slice(0, start);
  if (flags.some((word) => isFlagFor(word.text, "encodedcommand")))
    return REASONS.unsure("an encoded PowerShell command");
  if (start === -1 || flags.some((word) => isFlagFor(word.text, "file")))
    return;
  return classifyLine(rest.slice(start), depth, budget);
};
var CMD_RUN = /^(?:\/+(?:[adqsuxy]|[eftv]:\w*))*\/+[ckr]|^-[ckr]$/i;
var classifyCmd = (rest, depth, budget) => {
  for (const [index, word] of rest.entries()) {
    const run = CMD_RUN.exec(word.text)?.[0];
    if (run === undefined)
      continue;
    const glued = word.text.slice(run.length);
    const literal = word.literal?.slice(run.length);
    const line = glued === "" ? [] : [{ text: glued, dynamic: word.dynamic, ...literal === undefined ? {} : { literal } }];
    return classifyLine([...line, ...rest.slice(index + 1)], depth, budget);
  }
  return;
};
var operandFrom = (rest, from) => {
  let index = from;
  for (;; ) {
    const text = rest[index]?.text ?? "";
    if (!text.startsWith("-") || text === "-")
      return index;
    index += RUNTIME_VALUE_FLAGS.has(text) ? 2 : 1;
  }
};
var classifyRuntime = (name, rest, depth, budget) => {
  let at = operandFrom(rest, 0);
  if (name === "node" && rest.slice(0, at).some((word) => word.text === "--check"))
    return;
  const subcommand = rest[at]?.text ?? "";
  const runner = PACKAGE_RUNNERS.has(name) || RUNNER_SUBCOMMANDS.has(subcommand);
  if (subcommand === "run" || RUNNER_SUBCOMMANDS.has(subcommand))
    at = operandFrom(rest, at + 1);
  const operand = rest[at];
  if (operand === undefined)
    return;
  if (readsAs(operand, isEntry))
    return classifyHolyclaude(rest.slice(at + 1));
  return runner ? classifyWords(rest.slice(at), depth + 1, budget) : undefined;
};
var environmentReason = (name, rest) => {
  for (const word of rest) {
    const text = word.text;
    const at = ITEM_WRITERS.has(name) ? text.toLowerCase().lastIndexOf("env:") : -1;
    const variable = at === -1 ? text : text.slice(at + "env:".length).replace(/^[\\/]/, "");
    if (ENV_SETTERS.has(name)) {
      const verdict = classifyAssignment(text);
      if (verdict !== undefined)
        return verdict;
    } else if ((ENV_NAMERS.has(name) || at !== -1) && GIT_EXEC_ENV.test(variable))
      return REASONS.env(variable);
  }
  return;
};
var classifyWords = (input, depth, budget) => {
  if (depth > MAX_DEPTH)
    return REASONS.unsure("commands nested too deeply");
  if (overBudget(budget, input.length))
    return TOO_LARGE;
  let start = 0;
  for (;; ) {
    const head = input[start];
    if (head === undefined)
      return;
    if (!head.dynamic && BREAKS.has(head.text))
      return;
    if (!head.dynamic && head.text === "function")
      start += 2;
    else if (!head.dynamic && OPENERS.has(head.text))
      start += 1;
    else if (isAssignment(head.text)) {
      const verdict = classifyAssignment(head.text);
      if (verdict !== undefined)
        return verdict;
      start += 1;
    } else
      break;
  }
  const [head, ...rest] = input.slice(start);
  if (head === undefined)
    return;
  if (head.literal !== undefined) {
    const windows = { text: head.literal, dynamic: head.dynamic };
    const verdict = classifyWords([windows, ...rest], depth, budget);
    if (verdict !== undefined)
      return verdict;
  }
  if (!head.dynamic && /^[.&]?\{/.test(head.text)) {
    const block = { text: head.text.replace(/^[.&]/, ""), dynamic: false };
    return LAUNCHERS["invoke-command"]?.(judge, [head, block, ...rest], depth, budget);
  }
  const name = programOf(head);
  if (name === undefined)
    return REASONS.unsure("the program name is computed");
  const variable = environmentReason(name, rest);
  if (variable !== undefined)
    return variable;
  if (name === "git")
    return classifyGit(rest);
  if (name.startsWith("git-"))
    return classifyGitSub(name.slice(4), rest);
  if (name === "gh")
    return classifyGh(rest);
  if (HOLYCLAUDE.test(name))
    return classifyHolyclaude(rest);
  const launcher = Object.hasOwn(LAUNCHERS, name) ? LAUNCHERS[name] : undefined;
  if (launcher !== undefined)
    return launcher(judge, [head, ...rest], depth, budget);
  if (Object.hasOwn(WRAPPERS, name)) {
    const inner = unwrap2(name, rest, depth, budget);
    if (typeof inner === "string")
      return inner;
    return classifyWords(name === "xargs" ? [...inner, ...XARGS_INPUT] : inner, depth + 1, budget);
  }
  if (SHELLS.has(name))
    return classifyShell(rest, depth, budget);
  if (name === "powershell" || name === "pwsh")
    return classifyPowerShell(rest, depth, budget);
  if (name === "cmd")
    return classifyCmd(rest, depth, budget);
  if (name === "eval" || name === "iex" || name === "invoke-expression") {
    if (rest.some((word) => word.dynamic))
      return REASONS.unsure(`${name} text is computed`);
    return classifyScript(texts(rest).join(" "), depth + 1, budget);
  }
  if (RUNTIMES.has(name))
    return classifyRuntime(name, rest, depth, budget);
  if (name === "find") {
    const inner = findAfter(rest, ["-exec", "-execdir", "-ok", "-okdir"]);
    if (inner !== undefined)
      return classifyWords(inner, depth + 1, budget);
  }
  if (name === "fd" || name === "fdfind") {
    const inner = findAfter(rest, ["-x", "-X", "--exec", "--exec-batch"]);
    if (inner !== undefined)
      return classifyWords(inner, depth + 1, budget);
  }
  const writesInPlace = FILE_WRITERS.has(name) || (name === "sed" || name === "perl") && rest.some((word) => /^(-[A-Za-z]*i|--in-place)/.test(word.text));
  return writesInPlace ? firstReason(rest.map(wordReason)) : undefined;
};
var classifySimple = (simple, depth, budget) => {
  const written = firstReason(simple.outputs.map(writtenReason));
  return written ?? classifyWords(simple.words, depth, budget);
};
var classifyScript = (source, depth, budget) => {
  if (depth > MAX_DEPTH)
    return REASONS.unsure("commands nested too deeply");
  const large = oversize("command", source);
  if (large !== undefined)
    return large;
  if (overBudget(budget, source.length >> 1))
    return TOO_LARGE;
  const scan = scanScript(source);
  if (!scan.ok)
    return REASONS.unsure(scan.reason);
  for (const simple of scan.commands) {
    const verdict = classifySimple(simple, depth, budget);
    if (verdict !== undefined)
      return verdict;
  }
  return;
};
var judge = {
  maxDepth: MAX_DEPTH,
  unsure: REASONS.unsure,
  oversize: (text) => oversize("command", text),
  variable: (name) => GIT_EXEC_ENV.test(name) ? REASONS.env(name) : undefined,
  words: classifyWords,
  script: classifyScript,
  simple: classifySimple,
  line: classifyLine
};
var denyReason = (command) => classifyScript(command, 0, newBudget());
var UNREADABLE = REASONS.unsure("it is nested too deeply to read");
var SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);
var FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var JUDGED_TOOLS = new Set([...SHELL_TOOLS, ...FILE_TOOLS]);
var denyToolReason = (toolName, input) => {
  if (toolName === undefined)
    return REASONS.noTool;
  if (SHELL_TOOLS.has(toolName)) {
    const command = input?.command;
    return command === undefined ? `This ${toolName} call carries no command text that can be checked. Send the command as a plain string.` : oversize("command", command) ?? denyReason(command);
  }
  if (FILE_TOOLS.has(toolName)) {
    const targets = [input?.file_path, input?.notebook_path].filter((path) => path !== undefined);
    if (targets.length === 0)
      return REASONS.noPath(toolName);
    for (const target of targets) {
      const verdict = oversize("file path", target) ?? protectedReason(target);
      if (verdict !== undefined)
        return verdict;
    }
    return;
  }
  return;
};

// src/hook/pre-tool-use.ts
var MAX_HOOK_BYTES = 1024 * 1024;
var REFUSALS = {
  oversized: `This call's payload is over ${MAX_HOOK_BYTES} bytes, so the guard cannot check it. Send the work in smaller calls, for example one shorter command or a smaller write at a time.`,
  unreadable: `This call's payload is empty or not valid JSON, so the guard cannot check it. Send the call again; if it is refused again, say so in your report.`
};
var deny = (reason) => JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason
  }
});
var preToolUse = (stdin) => gen2(function* () {
  if (Buffer.byteLength(stdin) > MAX_HOOK_BYTES)
    return deny(REFUSALS.oversized);
  const input = yield* decodeHookInput(stdin).pipe(orElseSucceed2(() => {
    return;
  }));
  if (input === undefined)
    return deny(REFUSALS.unreadable);
  const agent = input.agent;
  if (agent === undefined)
    return "";
  const reason = yield* try_2(() => denyToolReason(input.tool_name, input.tool_input)).pipe(orElseSucceed2(() => UNREADABLE));
  if (agent.id !== undefined) {
    const directory = stateDirPath();
    yield* forkDetach2(observe(agent.id, {
      agent_type: input.agent_type,
      effort: effortOf(input),
      transcript: subagentTranscript(input)
    }, directory));
  }
  return reason === undefined ? "" : deny(reason);
});

// src/hook/session-start.ts
import { join as join6 } from "path";

// ../../node_modules/.bun/@toon-format+toon@4.4.0/node_modules/@toon-format/toon/dist/index.mjs
var NULL_LITERAL = "null";
var DELIMITERS = {
  comma: ",",
  tab: "\t",
  pipe: "|"
};
var DEFAULT_DELIMITER = DELIMITERS.comma;
function escapeString(value) {
  return value.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`).replace(/\n/g, `\\n`).replace(/\r/g, `\\r`).replace(/\t/g, `\\t`).replace(/[\u0000-\u001F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
var FETCH_LINE = Symbol("fetch-line");
function isBooleanOrNullLiteral(token) {
  return token === "true" || token === "false" || token === "null";
}
function setOwnProperty(target, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true
    });
    return;
  }
  target[key] = value;
}
var COMMENT_LINE_PATTERN = new RegExp(`(?:^\uFEFF?|\\n) *#`);
var RawString = class {
  constructor(value) {
    if (COMMENT_LINE_PATTERN.test(value))
      throw new TypeError(`Raw string must not contain a line starting with "#": ${JSON.stringify(value)}`);
    this.value = value;
  }
};
function isRawString(value) {
  return value instanceof RawString;
}
var SURROGATE_PATTERN = /[\uD800-\uDFFF]/;
function normalizeValue(value) {
  if (value === null)
    return null;
  if (isRawString(value))
    return value;
  if (typeof value === "object" && value !== null && "toJSON" in value && typeof value.toJSON === "function") {
    const next = value.toJSON();
    if (next !== value)
      return normalizeValue(next);
  }
  if (typeof value === "string") {
    assertNoLoneSurrogate(value, "string value");
    return value;
  }
  if (typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (Object.is(value, -0))
      return 0;
    if (!Number.isFinite(value))
      return null;
    return value;
  }
  if (typeof value === "bigint") {
    if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER)
      return Number(value);
    return value.toString();
  }
  if (value instanceof Date)
    return value.toISOString();
  if (Array.isArray(value))
    return Array.from(value, normalizeValue);
  if (value instanceof Set)
    return Array.from(value).map(normalizeValue);
  if (value instanceof Map)
    return Object.fromEntries(Array.from(value, ([k, v]) => [String(k), normalizeValue(v)]));
  if (isPlainObject(value)) {
    const encodedValues = {};
    for (const key in value)
      if (Object.hasOwn(value, key)) {
        assertNoLoneSurrogate(key, "object key");
        setOwnProperty(encodedValues, key, normalizeValue(value[key]));
      }
    return encodedValues;
  }
  return null;
}
function assertNoLoneSurrogate(value, context) {
  if (!SURROGATE_PATTERN.test(value))
    return;
  for (let index = 0;index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 55296 || code > 57343)
      continue;
    const isHighSurrogate = code <= 56319;
    const next = value.charCodeAt(index + 1);
    if (isHighSurrogate && next >= 56320 && next <= 57343) {
      index++;
      continue;
    }
    throw new TypeError(`Cannot encode ${context} containing an unpaired surrogate U+${code.toString(16).toUpperCase()} at index ${index}`);
  }
}
function isJsonPrimitive(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function isEncodablePrimitive(value) {
  return isJsonPrimitive(value) || isRawString(value);
}
function isJsonArray(value) {
  return Array.isArray(value);
}
function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isRawString(value);
}
function isEmptyObject(value) {
  return Object.keys(value).length === 0;
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object")
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
function isArrayOfPrimitives(value) {
  return value.length === 0 || value.every((item) => isEncodablePrimitive(item));
}
function isArrayOfArrays(value) {
  return value.length === 0 || value.every((item) => isJsonArray(item));
}
function isArrayOfObjects(value) {
  return value.length === 0 || value.every((item) => isJsonObject(item));
}
var NUMERIC_LIKE_PATTERN = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
function assertValidDelimiter(delimiter) {
  if (!Object.values(DELIMITERS).includes(delimiter))
    throw new TypeError(`Invalid delimiter ${JSON.stringify(delimiter)}. Valid delimiters are: comma (,), tab (\\t), pipe (|)`);
}
function isValidUnquotedKey(key) {
  return /^[A-Z_][\w.]*$/i.test(key);
}
function isSafeUnquoted(value, delimiter = DEFAULT_DELIMITER) {
  if (!value)
    return false;
  if (/^[ \t]|[ \t]$/.test(value))
    return false;
  if (isBooleanOrNullLiteral(value) || isNumericLike(value))
    return false;
  if (value.includes(":"))
    return false;
  if (value.includes('"') || value.includes("\\"))
    return false;
  if (/[[\]{}]/.test(value))
    return false;
  if (/[\u0000-\u001F]/.test(value))
    return false;
  if (value.includes(delimiter))
    return false;
  if (value.startsWith("-"))
    return false;
  if (value.startsWith("#"))
    return false;
  return true;
}
function isNumericLike(value) {
  return NUMERIC_LIKE_PATTERN.test(value);
}
function encodePrimitive(value, delimiter) {
  if (isRawString(value))
    return value.value;
  if (value === null)
    return NULL_LITERAL;
  if (typeof value === "boolean")
    return String(value);
  if (typeof value === "number")
    return String(value);
  return encodeStringLiteral(value, delimiter);
}
function encodeStringLiteral(value, delimiter = DEFAULT_DELIMITER) {
  if (isSafeUnquoted(value, delimiter))
    return value;
  return `"${escapeString(value)}"`;
}
function encodeKey(key) {
  if (isValidUnquotedKey(key))
    return key;
  return `"${escapeString(key)}"`;
}
function encodeAndJoinPrimitives(values, delimiter = DEFAULT_DELIMITER) {
  return values.map((v) => encodePrimitive(v, delimiter)).join(delimiter);
}
function formatHeader(length, options) {
  const key = options?.key;
  const fields = options?.fields;
  const delimiter = options?.delimiter ?? ",";
  let header = "";
  if (key != null)
    header += encodeKey(key);
  header += `[${length}${options?.keyed ? ":" : ""}${delimiter !== DEFAULT_DELIMITER ? delimiter : ""}]`;
  if (fields)
    header += `{${formatFieldSegment(fields, delimiter)}}`;
  header += ":";
  return header;
}
function formatFieldSegment(fields, delimiter) {
  return fields.map((field) => encodeKey(field.name) + (field.children ? `{${formatFieldSegment(field.children, delimiter)}}` : "")).join(delimiter);
}
function extractTabularFields(rows) {
  if (rows.length === 0)
    return;
  const firstKeys = Object.keys(rows[0]);
  if (firstKeys.length === 0)
    return;
  for (const row of rows) {
    if (Object.keys(row).length !== firstKeys.length)
      return;
    for (const key of firstKeys)
      if (!Object.hasOwn(row, key))
        return;
  }
  const fieldNodes = [];
  for (const key of firstKeys) {
    const fieldNode = classifyColumn(key, rows.map((row) => row[key]));
    if (!fieldNode)
      return;
    fieldNodes.push(fieldNode);
  }
  return fieldNodes;
}
function extractKeyedTabularFields(value) {
  const entryValues = Object.values(value);
  if (entryValues.length < 2)
    return;
  if (!entryValues.every((entryValue) => isJsonObject(entryValue) && !isEmptyObject(entryValue)))
    return;
  return extractTabularFields(entryValues);
}
function collectRowLeaves(row, fields) {
  const leaves = [];
  collectLeafValues(row, fields, leaves);
  return leaves;
}
function classifyColumn(name, values) {
  if (values.every((value) => isEncodablePrimitive(value)))
    return { name };
  if (!values.every((value) => isJsonObject(value) && !isEmptyObject(value)))
    return;
  const children = extractTabularFields(values);
  if (!children)
    return;
  return {
    name,
    children
  };
}
function collectLeafValues(row, fields, leaves) {
  for (const field of fields) {
    const value = row[field.name];
    if (field.children)
      collectLeafValues(value, field.children, leaves);
    else
      leaves.push(value);
  }
}
function* encodeJsonValue(value, options, depth) {
  if (isEncodablePrimitive(value)) {
    const encodedPrimitive = typeof value === "string" && value.startsWith("\uFEFF") ? `"${escapeString(value)}"` : encodePrimitive(value, options.delimiter);
    if (encodedPrimitive !== "")
      yield encodedPrimitive;
    return;
  }
  if (isJsonArray(value))
    yield* encodeArrayLines(undefined, value, depth, options);
  else if (isJsonObject(value)) {
    const keyedFields = extractKeyedTabularFields(value);
    if (keyedFields) {
      yield* encodeKeyedObjectLines(undefined, value, keyedFields, depth, options);
      return;
    }
    yield* encodeObjectLines(value, depth, options);
  }
}
function* encodeObjectLines(value, depth, options) {
  for (const [key, val] of Object.entries(value))
    yield* encodeKeyValuePairLines(key, val, depth, options);
}
function* encodeKeyValuePairLines(key, value, depth, options) {
  const encodedKey = encodeKey(key);
  if (isEncodablePrimitive(value))
    yield indentedLine(depth, `${encodedKey}: ${encodePrimitive(value, options.delimiter)}`, options.indentSize);
  else if (isJsonArray(value))
    yield* encodeArrayLines(key, value, depth, options);
  else if (isJsonObject(value)) {
    const keyedFields = extractKeyedTabularFields(value);
    if (keyedFields) {
      yield* encodeKeyedObjectLines(key, value, keyedFields, depth, options);
      return;
    }
    yield indentedLine(depth, `${encodedKey}:`, options.indentSize);
    if (!isEmptyObject(value))
      yield* encodeObjectLines(value, depth + 1, options);
  }
}
function* encodeKeyedObjectLines(key, value, fields, depth, options) {
  const entries = Object.entries(value);
  yield indentedLine(depth, formatHeader(entries.length, {
    key,
    fields,
    delimiter: options.delimiter,
    keyed: true
  }), options.indentSize);
  yield* encodeKeyedEntryRowsLines(entries, fields, depth + 1, options);
}
function* encodeKeyedEntryRowsLines(entries, fields, depth, options) {
  for (const [entryKey, entryValue] of entries) {
    const leaves = collectRowLeaves(entryValue, fields);
    yield indentedLine(depth, `${encodeKey(entryKey)}: ${encodeAndJoinPrimitives(leaves, options.delimiter)}`, options.indentSize);
  }
}
function* encodeArrayLines(key, value, depth, options) {
  if (value.length === 0) {
    yield indentedLine(depth, key != null ? `${encodeKey(key)}: []` : "[]", options.indentSize);
    return;
  }
  if (isArrayOfPrimitives(value)) {
    yield indentedLine(depth, encodeInlineArrayLine(value, options.delimiter, key), options.indentSize);
    return;
  }
  if (isArrayOfArrays(value)) {
    if (value.every((arr) => isArrayOfPrimitives(arr))) {
      yield* encodeArrayOfArraysAsListItemsLines(key, value, depth, options);
      return;
    }
  }
  if (isArrayOfObjects(value)) {
    const fields = extractTabularFields(value);
    if (fields)
      yield* encodeArrayOfObjectsAsTabularLines(key, value, fields, depth, options);
    else
      yield* encodeMixedArrayAsListItemsLines(key, value, depth, options);
    return;
  }
  yield* encodeMixedArrayAsListItemsLines(key, value, depth, options);
}
function* encodeArrayOfArraysAsListItemsLines(prefix, values, depth, options) {
  yield indentedLine(depth, formatHeader(values.length, {
    key: prefix,
    delimiter: options.delimiter
  }), options.indentSize);
  for (const arr of values)
    if (isArrayOfPrimitives(arr)) {
      const arrayLine = encodeInlineArrayLine(arr, options.delimiter);
      yield indentedListItem(depth + 1, arrayLine, options.indentSize);
    }
}
function encodeInlineArrayLine(values, delimiter, prefix) {
  const header = formatHeader(values.length, {
    key: prefix,
    delimiter
  });
  const joinedValue = encodeAndJoinPrimitives(values, delimiter);
  if (values.length === 0)
    return header;
  return `${header} ${joinedValue}`;
}
function* encodeArrayOfObjectsAsTabularLines(prefix, rows, fields, depth, options) {
  yield indentedLine(depth, formatHeader(rows.length, {
    key: prefix,
    fields,
    delimiter: options.delimiter
  }), options.indentSize);
  yield* writeTabularRowsLines(rows, fields, depth + 1, options);
}
function* writeTabularRowsLines(rows, fields, depth, options) {
  for (const row of rows)
    yield indentedLine(depth, encodeAndJoinPrimitives(collectRowLeaves(row, fields), options.delimiter), options.indentSize);
}
function* encodeMixedArrayAsListItemsLines(prefix, items, depth, options) {
  yield indentedLine(depth, formatHeader(items.length, {
    key: prefix,
    delimiter: options.delimiter
  }), options.indentSize);
  for (const item of items)
    yield* encodeListItemValueLines(item, depth + 1, options);
}
function* encodeObjectAsListItemLines(obj, depth, options) {
  if (isEmptyObject(obj)) {
    yield indentedLine(depth, "-", options.indentSize);
    return;
  }
  const entries = Object.entries(obj);
  const [firstKey, firstValue] = entries[0];
  const restEntries = entries.slice(1);
  if (isJsonArray(firstValue) && isArrayOfObjects(firstValue)) {
    const fields = extractTabularFields(firstValue);
    if (fields) {
      yield indentedListItem(depth, formatHeader(firstValue.length, {
        key: firstKey,
        fields,
        delimiter: options.delimiter
      }), options.indentSize);
      yield* writeTabularRowsLines(firstValue, fields, depth + 2, options);
      if (restEntries.length > 0)
        yield* encodeObjectLines(Object.fromEntries(restEntries), depth + 1, options);
      return;
    }
  }
  if (isJsonObject(firstValue)) {
    const keyedFields = extractKeyedTabularFields(firstValue);
    if (keyedFields) {
      const keyedEntries = Object.entries(firstValue);
      yield indentedListItem(depth, formatHeader(keyedEntries.length, {
        key: firstKey,
        fields: keyedFields,
        delimiter: options.delimiter,
        keyed: true
      }), options.indentSize);
      yield* encodeKeyedEntryRowsLines(keyedEntries, keyedFields, depth + 2, options);
      if (restEntries.length > 0)
        yield* encodeObjectLines(Object.fromEntries(restEntries), depth + 1, options);
      return;
    }
  }
  const encodedKey = encodeKey(firstKey);
  if (isEncodablePrimitive(firstValue))
    yield indentedListItem(depth, `${encodedKey}: ${encodePrimitive(firstValue, options.delimiter)}`, options.indentSize);
  else if (isJsonArray(firstValue)) {
    if (firstValue.length === 0)
      yield indentedListItem(depth, `${encodedKey}: []`, options.indentSize);
    else if (isArrayOfPrimitives(firstValue))
      yield indentedListItem(depth, `${encodedKey}${encodeInlineArrayLine(firstValue, options.delimiter)}`, options.indentSize);
    else {
      yield indentedListItem(depth, `${encodedKey}${formatHeader(firstValue.length, { delimiter: options.delimiter })}`, options.indentSize);
      for (const item of firstValue)
        yield* encodeListItemValueLines(item, depth + 2, options);
    }
  } else if (isJsonObject(firstValue)) {
    yield indentedListItem(depth, `${encodedKey}:`, options.indentSize);
    if (!isEmptyObject(firstValue))
      yield* encodeObjectLines(firstValue, depth + 2, options);
  }
  if (restEntries.length > 0)
    yield* encodeObjectLines(Object.fromEntries(restEntries), depth + 1, options);
}
function* encodeListItemValueLines(value, depth, options) {
  if (isEncodablePrimitive(value))
    yield indentedListItem(depth, encodePrimitive(value, options.delimiter), options.indentSize);
  else if (isJsonArray(value)) {
    if (isArrayOfPrimitives(value))
      yield indentedListItem(depth, encodeInlineArrayLine(value, options.delimiter), options.indentSize);
    else {
      yield indentedListItem(depth, formatHeader(value.length, { delimiter: options.delimiter }), options.indentSize);
      for (const item of value)
        yield* encodeListItemValueLines(item, depth + 1, options);
    }
  } else if (isJsonObject(value))
    yield* encodeObjectAsListItemLines(value, depth, options);
}
function indentedLine(depth, content, indentSize) {
  return " ".repeat(indentSize * depth) + content;
}
function indentedListItem(depth, content, indentSize) {
  return indentedLine(depth, "- " + content, indentSize);
}
function applyReplacer(root, replacer) {
  const replacedRoot = replacer("", root, []);
  if (replacedRoot === undefined)
    return transformChildren(root, replacer, []);
  return transformReplaced(root, replacedRoot, replacer, []);
}
function transformReplaced(original, replaced, replacer, path) {
  if (isRawString(replaced) && !isEncodablePrimitive(original))
    return transformChildren(original, replacer, path);
  return transformChildren(normalizeValue(replaced), replacer, path);
}
function transformChildren(value, replacer, path) {
  if (isJsonObject(value))
    return transformObject(value, replacer, path);
  if (isJsonArray(value))
    return transformArray(value, replacer, path);
  return value;
}
function transformObject(obj, replacer, path) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const childPath = [...path, key];
    const replacedValue = replacer(key, value, childPath);
    if (replacedValue === undefined)
      continue;
    setOwnProperty(result, key, transformReplaced(value, replacedValue, replacer, childPath));
  }
  return result;
}
function transformArray(arr, replacer, path) {
  const result = [];
  for (let i = 0;i < arr.length; i++) {
    const value = arr[i];
    const childPath = [...path, i];
    const replacedValue = replacer(String(i), value, childPath);
    if (replacedValue === undefined)
      continue;
    result.push(transformReplaced(value, replacedValue, replacer, childPath));
  }
  return result;
}
function encode2(input, options) {
  return Array.from(encodeLines(input, options)).join(`
`);
}
function encodeLines(input, options) {
  const normalizedValue = normalizeValue(input);
  const resolvedOptions = resolveOptions(options);
  return encodeJsonValue(resolvedOptions.replacer ? applyReplacer(normalizedValue, resolvedOptions.replacer) : normalizedValue, resolvedOptions, 0);
}
function resolveOptions(options) {
  const delimiter = options?.delimiter ?? DEFAULT_DELIMITER;
  assertValidDelimiter(delimiter);
  return {
    indentSize: options?.indentSize ?? options?.indent ?? 2,
    delimiter,
    replacer: options?.replacer
  };
}

// src/toon.ts
var toon = (value) => `${encode2(value)}
`;

// src/hook/session-start.ts
var MAIN_AGENT_TYPES = [`${PLUGIN_NAME}:${PLUGIN_NAME}`, PLUGIN_NAME];
var CAP = 1e4;
var RULES_START = "<!-- holyclaude:core-rules:start -->";
var RULES_END = "<!-- holyclaude:core-rules:end -->";
var PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";
var pointer = (cli) => `Full state: ${cli} intent list; ${cli} assignment list --all`;
var RULES_CUT = `
[core rules cut to fit; full text in agents/holyclaude.md]`;
var WHOLE = Number.POSITIVE_INFINITY;
var TEXT_LIMITS = [WHOLE, 2000, 400, 120, 0];
var ROWS_DROP_AT = 120;
var MAX_STATE_FILE_BYTES = 64 * 1024 * 1024;
var STATE_LOAD_BUDGET = "10 seconds";
var clip = (text, max) => max <= 0 ? "" : text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`;
var cutRules = (rules, room) => {
  const cut = rules.slice(0, room);
  const newline = cut.lastIndexOf(`
`);
  return newline > 0 ? cut.slice(0, newline) : cut;
};
var row = (assignment, textLimit) => ({
  id: assignment.id,
  role: assignment.role,
  state: assignment.state,
  agent_id: assignment.agent_id,
  rev: assignment.intent_revision,
  objective: clip(assignment.objective.replace(/\s+/g, " "), textLimit)
});
var open2 = (state) => sortedById(state.assignments).filter(isOpenAssignment);
var summaryOf = (state, chosen) => {
  const rows = open2(state);
  const intents = openIntents(state);
  const inUse = intentInUse(state, chosen);
  const openCounts = Map.groupBy(rows, (assignment) => assignment.intent_id);
  return {
    rows: rows.length,
    render: (limit, textLimit) => toon({
      intents: intents.map((intent) => ({
        id: intent.id,
        revision: intent.revision,
        objective: clip(intent.objective, textLimit),
        open_assignments: openCounts.get(intent.id)?.length ?? 0
      })),
      in_use: inUse === undefined ? null : { id: inUse.id, requirements: clip(inUse.requirements, textLimit) },
      assignments: rows.slice(0, limit).map((assignment) => row(assignment, textLimit)),
      ...rows.length > limit ? { more_assignments: rows.length - limit } : {}
    }).trimEnd()
  };
};
var brokenSummary = (message) => ({
  rows: 0,
  render: (_rows, textLimit) => toon({ state_error: clip(message, textLimit) }).trimEnd()
});
var block = (text) => `State:
${text}`;
var fitSummary = (summary, budget) => {
  for (const textLimit of TEXT_LIMITS) {
    let rows = summary.rows;
    for (;; ) {
      const text = summary.render(rows, textLimit);
      if (block(text).length <= budget)
        return block(text);
      if (rows === 0 || textLimit > ROWS_DROP_AT)
        break;
      rows = Math.min(rows - 1, Math.floor(rows * 0.8));
    }
  }
  return "";
};
var composeContext = (rules, summary, cli) => {
  const state = block(summary.render(summary.rows, WHOLE));
  const full = [rules, state].filter((part) => part !== undefined).join(`

`);
  if (full.length <= CAP)
    return full;
  const tail = `

${pointer(cli)}`;
  if (rules !== undefined && rules.length + tail.length > CAP)
    return `${cutRules(rules, CAP - tail.length - RULES_CUT.length)}${RULES_CUT}${tail}`;
  const roomForState = CAP - tail.length - (rules === undefined ? 0 : rules.length + 2);
  const body = [rules, fitSummary(summary, roomForState)].filter((part) => part);
  return `${body.join(`

`)}${tail}`.trimStart();
};
var extractRules = (agentFile, root) => {
  const start = agentFile.indexOf(RULES_START);
  const end = agentFile.indexOf(RULES_END);
  if (start === -1 || end === -1 || end < start)
    return;
  const rules = agentFile.slice(start + RULES_START.length, end).trim();
  return root === undefined ? rules : rules.replaceAll(PLUGIN_ROOT_VAR, () => root);
};
var sessionStart = (stdin, { load = loadState, budget = STATE_LOAD_BUDGET } = {}) => gen2(function* () {
  const root = yield* pluginRoot;
  if (root === undefined)
    return "";
  const file = Bun.file(join6(root, "agents", "holyclaude.md"));
  if (!(yield* tryPromise2(() => file.exists())))
    return "";
  const input = yield* decodeHookInput(stdin).pipe(orElseSucceed2(() => {
    return;
  }));
  const runsAsMainAgent = MAIN_AGENT_TYPES.includes(input?.agent_type ?? "");
  const rules = runsAsMainAgent ? undefined : extractRules(yield* tryPromise2(() => file.text()), root);
  const summary = yield* load(stateDirPath(), MAX_STATE_FILE_BYTES).pipe(flatMap2((state) => readActiveIntent(stateDirPath(), MAX_STATE_FILE_BYTES).pipe(orElseSucceed2(() => {
    return;
  }), map4((id) => summaryOf(state, id)))), timeoutOption2(budget), map4(getOrElse(() => brokenSummary("the state did not load within the time the hook allows it"))), catch_2((error) => succeed5(brokenSummary(error.message))));
  const additionalContext = composeContext(rules, summary, `"${root}/scripts/holyclaude"`);
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext }
  });
});

// src/hook/subagent.ts
var record2 = (stdin, sighting) => gen2(function* () {
  const input = yield* decodeHookInput(stdin).pipe(orElseSucceed2(() => {
    return;
  }));
  const agentId = input?.agent?.id;
  if (input !== undefined && agentId !== undefined)
    yield* observe(agentId, sighting(input));
  return "";
});
var subagentStart = (stdin) => record2(stdin, (input) => ({ agent_type: input.agent_type }));
var subagentStop = (stdin) => record2(stdin, (input) => ({
  agent_type: input.agent_type,
  effort: effortOf(input),
  transcript: input.agent_transcript_path
}));

// src/state.ts
var loadStateFile = suspend2(() => loadState(stateDirPath()));

// src/verify.ts
var TranscriptLine = Struct({
  message: optionalKey2(Struct({ model: optionalKey2(String4) }))
});
var decodeLine2 = decodeUnknownEffect2(fromJsonString2(TranscriptLine));
var MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
var transcriptModels = (path) => gen2(function* () {
  const text = yield* readText(path, MAX_TRANSCRIPT_BYTES).pipe(map4((read) => read ?? ""), catchTag2("StateIo", () => succeed5("")));
  const models = new Set;
  for (const line of text.split(`
`)) {
    if (!line.includes('"model"'))
      continue;
    const decoded = yield* decodeLine2(line).pipe(option2);
    const model = decoded._tag === "Some" ? decoded.value.message?.model : undefined;
    if (model !== undefined && !model.startsWith("<"))
      models.add(model);
  }
  return [...models];
});
var compare = (expected, observed, matches = (e, o) => e === o) => observed === undefined ? "unobserved" : matches(expected, observed) ? "match" : "mismatch";
var verifyAssignment = (id) => gen2(function* () {
  const state = yield* loadStateFile;
  const assignment = yield* findAssignment(state, id);
  const agentId = assignment.agent_id;
  if (agentId === null)
    return yield* new NotBound({ id });
  const route = routeFor(assignment.role);
  const records = yield* readObservations();
  const override = latestOverride(records, id, agentId);
  const expected = {
    model: override?.model ?? route.model,
    effort: override?.effort ?? route.effort,
    agent_type: `${PLUGIN_NAME}:${assignment.role}`
  };
  const seen = seenOf(records, agentId);
  const models = seen.model !== undefined || seen.transcript === undefined ? [] : yield* transcriptModels(seen.transcript);
  const observedModel = seen.model ?? (models.length === 0 ? undefined : models.join("|"));
  const modelSource = seen.model !== undefined ? "hook" : observedModel !== undefined ? "transcript" : "none";
  const rows = [
    {
      field: "model",
      expected: expected.model,
      observed: observedModel ?? "unobserved",
      status: compare(expected.model, observedModel, (want, got) => got.split("|").every((model) => model.toLowerCase().includes(want.toLowerCase())))
    },
    {
      field: "effort",
      expected: expected.effort,
      observed: seen.effort ?? "unobserved",
      status: compare(expected.effort, seen.effort)
    },
    {
      field: "agent_type",
      expected: expected.agent_type,
      observed: seen.agent_type ?? "unobserved",
      status: compare(expected.agent_type, seen.agent_type, (want, got) => got === want || got.endsWith(`:${assignment.role}`))
    }
  ];
  const verdict = rows.some((r) => r.status === "mismatch") ? "mismatch" : rows.some((r) => r.status === "unobserved") ? "incomplete" : "ok";
  return {
    value: {
      assignment: id,
      role: assignment.role,
      agent_id: agentId,
      expected_source: override === undefined ? "route" : "override",
      model_source: modelSource,
      checks: rows,
      verdict
    },
    code: verdict === "mismatch" ? 3 : 0
  };
});

// src/commands.ts
var summaryRow = (assignment) => ({
  id: assignment.id,
  role: assignment.role,
  state: assignment.state,
  rev: assignment.intent_revision,
  agent_id: assignment.agent_id,
  accepted: assignment.acceptance !== null,
  objective: assignment.objective.replace(/\s+/g, " ")
});
var intentRow = (intent, state) => ({
  id: intent.id,
  state: intent.state,
  revision: intent.revision,
  objective: intent.objective.replace(/\s+/g, " "),
  open_assignments: state.assignments.filter((assignment) => assignment.intent_id === intent.id && isOpenAssignment(assignment)).length
});
var dispatchInfo = (assignment) => {
  const route = routeFor(assignment.role);
  return {
    id: assignment.id,
    state: assignment.state,
    role: assignment.role,
    subagent_type: `${PLUGIN_NAME}:${assignment.role}`,
    model: route.model,
    effort: route.effort,
    rev: assignment.intent_revision
  };
};
var storedIntent = suspend2(() => readActiveIntent(stateDirPath())).pipe(orElseSucceed2(() => {
  return;
}));
var activeIntent = (state, id) => (id === undefined ? storedIntent : succeed5(undefined)).pipe(flatMap2((stored) => resolveIntent(state, id, stored)));
var agreedIntent = (usage, source, named, flag) => gen2(function* () {
  if (named !== undefined && flag !== undefined && named !== flag)
    return yield* usageError(usage, `${source} ${named} and --intent ${flag} name different Intents`);
  return named ?? flag;
});
var INTENT_FLAG = { intent: "string" };
var read = (use) => loadStateFile.pipe(flatMap2(use));
var change = (transition) => suspend2(() => updateState(stateDirPath(), transition));
var changeOwn = (id, transition) => change((state, { cloneId }) => cloneId.pipe(flatMap2((own) => refuseOtherClone(state, id, own)), andThen2(transition(state))));
var need = (stdin, command) => stdin.pipe(flatMap2((text) => text.trim() === "" ? fail5(new StdinMissing({ command })) : succeed5(text)));
var fromStdin = (schema, stdin, command) => need(stdin, command).pipe(flatMap2(decodeJsonStrict(schema)));
var IntentUpdateBody = Struct({
  id: optionalKey2(Text),
  objective: optionalKey2(Text),
  requirements: optionalKey2(String4)
});
var ResultBody = Struct({ result: Text });
var ModelFlag = Literals(["haiku", "sonnet", "opus", "fable"]);
var EffortFlag = Literals(["low", "medium", "high", "xhigh", "max"]);
var OUTCOMES = {
  success: "Success",
  failure: "Failure",
  errored: "Errored",
  interrupted: "Interrupted",
  stopped: "Stopped"
};
var usageError = (usage, message) => new Usage({ message, hint: `Usage: holyclaude ${usage}` });
var flagValue = (parsed, name, usage) => {
  const value = stringFlag(parsed, name);
  return value === undefined ? fail5(usageError(usage, `Missing --${name}`)) : succeed5(value);
};
var optionalChoice = (schema, value) => gen2(function* () {
  if (value === undefined)
    return;
  const choice = yield* decodeStrict(schema)(value);
  return choice;
});
var withRef = (id) => decodeStrict(AssignmentRef)({ assignment_id: id });
var cmd = (command) => command;
var SHOW_USAGE = "intent show [id | --intent <id>]";
var intentShow = cmd({
  path: ["intent", "show"],
  usage: SHOW_USAGE,
  summary: "show the Intent in use, or the one named",
  root: false,
  flags: INTENT_FLAG,
  positionals: 1,
  optional: true,
  run: (args) => agreedIntent(SHOW_USAGE, "Argument", args.positionals[0], stringFlag(args, "intent")).pipe(flatMap2((id) => read((state) => activeIntent(state, id))), map4((intent) => ({ value: intent })))
});
var INTENT_LIST_USAGE = `intent list [--state ${IntentState.literals.join("|")}]`;
var intentList = cmd({
  path: ["intent", "list"],
  usage: INTENT_LIST_USAGE,
  summary: "list Intents with state, revision, objective and open Assignments",
  root: false,
  flags: { state: "string" },
  positionals: 0,
  run: (args) => gen2(function* () {
    const value = stringFlag(args, "state");
    const wanted = yield* optionalChoice(IntentState, value).pipe(mapError2(() => usageError(INTENT_LIST_USAGE, `State ${value} is not one of ${IntentState.literals.join("|")}`)));
    return yield* read((state) => succeed5({
      value: {
        intents: sortedById(state.intents).filter((intent) => wanted === undefined || intent.state === wanted).map((intent) => intentRow(intent, state))
      }
    }));
  })
});
var intentUse = cmd({
  path: ["intent", "use"],
  usage: "intent use <id>",
  summary: "work on this Intent in this clone; the choice stays local",
  root: true,
  flags: {},
  positionals: 1,
  run: (args) => change((state, { useIntent }) => gen2(function* () {
    const intent = yield* findIntent(state, args.positionals[0] ?? "");
    yield* requireOpen(intent);
    yield* useIntent(intent.id);
    return { state, value: intentRow(intent, state) };
  })).pipe(map4((row) => ({ value: row })))
});
var CLOSE_USAGE = "intent close [--intent <id>] --reason <text>";
var intentClose = cmd({
  path: ["intent", "close"],
  usage: CLOSE_USAGE,
  summary: "close the Intent with a reason; refused while its Assignments run",
  root: true,
  flags: { ...INTENT_FLAG, reason: "string" },
  positionals: 0,
  run: (args) => gen2(function* () {
    const reason = yield* flagValue(args, "reason", CLOSE_USAGE);
    const at = yield* nowIso;
    const intent = yield* change((state) => activeIntent(state, stringFlag(args, "intent")).pipe(flatMap2((target) => decodeStrict(CloseIntentInput)({ id: target.id, reason, at })), flatMap2((input) => closeIntent(state, input))));
    return { value: intent };
  })
});
var REOPEN_USAGE = "intent reopen [--intent <id>]";
var closedIntent = (state, id) => gen2(function* () {
  if (id !== undefined)
    return yield* findIntent(state, id);
  const closed = sortedById(state.intents).filter((intent) => intent.state === "closed");
  const [only] = closed;
  if (closed.length === 1 && only !== undefined)
    return only;
  return yield* usageError(REOPEN_USAGE, closed.length === 0 ? "No Intent is closed" : `Several Intents are closed; pass --intent <id>. Closed Intents: ${closed.map((intent) => intent.id).join(", ")}`);
});
var intentReopen = cmd({
  path: ["intent", "reopen"],
  usage: REOPEN_USAGE,
  summary: "open a closed Intent again (the only closed one, else --intent); the revision bumps",
  root: true,
  flags: INTENT_FLAG,
  positionals: 0,
  run: (args) => change((state) => closedIntent(state, stringFlag(args, "intent")).pipe(flatMap2((target) => reopenIntent(state, target.id)))).pipe(map4((intent) => ({ value: intent })))
});
var intentCreate = cmd({
  path: ["intent", "create"],
  usage: "intent create",
  summary: "record a new Intent at revision 1 and put it in use; prints the Intent it replaced",
  input: '{"objective":"...","requirements":"..."?}',
  root: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => fromStdin(CreateIntentInput, stdin, "intent create").pipe(flatMap2((input) => change((state, { useIntent }) => gen2(function* () {
    const replaced = intentInUse(state, yield* storedIntent);
    const created = yield* createIntent(state, input);
    yield* useIntent(created.value.id);
    return {
      state: created.state,
      value: { ...created.value, in_use: created.value.id, replaced: replaced?.id ?? null }
    };
  }))), map4((intent) => ({ value: intent })))
});
var UPDATE_USAGE = "intent update [--intent <id>] [--material]";
var intentUpdate = cmd({
  path: ["intent", "update"],
  usage: UPDATE_USAGE,
  summary: "edit the Intent; --material bumps the revision",
  input: '{"id":"..."?,"objective":"..."?,"requirements":"..."?}',
  root: true,
  flags: { ...INTENT_FLAG, material: "boolean" },
  positionals: 0,
  run: (args, stdin) => fromStdin(IntentUpdateBody, stdin, "intent update").pipe(flatMap2((body) => agreedIntent(UPDATE_USAGE, "JSON id", body.id, stringFlag(args, "intent")).pipe(flatMap2((id) => change((state) => activeIntent(state, id).pipe(flatMap2((intent) => updateIntent(state, {
    ...body,
    id: intent.id,
    material: booleanFlag(args, "material")
  }))))))), map4((intent) => ({ value: intent })))
});
var assignmentShow = cmd({
  path: ["assignment", "show"],
  usage: "assignment show <id>",
  summary: "show one Assignment in full",
  root: false,
  flags: {},
  positionals: 1,
  run: (args) => withRef(args.positionals[0]).pipe(flatMap2((ref) => read((state) => findAssignment(state, ref.assignment_id))), map4((assignment) => ({ value: assignment })))
});
var LIST_USAGE = `assignment list [--state ${AssignmentState.literals.join("|")}] [--intent <id> | --all]`;
var stateFilter = (value) => gen2(function* () {
  if (value === undefined)
    return;
  return yield* decodeStrict(AssignmentState)(value).pipe(mapError2(() => usageError(LIST_USAGE, `State ${value} is not one of ${AssignmentState.literals.join("|")}`)));
});
var assignmentList = cmd({
  path: ["assignment", "list"],
  usage: LIST_USAGE,
  summary: "list the Assignments of the Intent in use (--intent: another, --all: every one)",
  root: false,
  flags: { ...INTENT_FLAG, state: "string", all: "boolean" },
  positionals: 0,
  run: (args) => gen2(function* () {
    const wanted = yield* stateFilter(stringFlag(args, "state"));
    const everything = booleanFlag(args, "all");
    if (everything && stringFlag(args, "intent") !== undefined)
      return yield* usageError(LIST_USAGE, "Pick one of --intent <id> or --all");
    return yield* read((state) => gen2(function* () {
      const scope = everything ? undefined : (yield* activeIntent(state, stringFlag(args, "intent"))).id;
      const rows = sortedById(state.assignments).filter((assignment) => scope === undefined || assignment.intent_id === scope).filter((assignment) => wanted === undefined || assignment.state === wanted).map((assignment) => everything ? { intent: assignment.intent_id, ...summaryRow(assignment) } : summaryRow(assignment));
      return { value: { assignments: rows } };
    }));
  })
});
var assignmentCreate = cmd({
  path: ["assignment", "create"],
  usage: "assignment create",
  summary: "create a Ready Assignment",
  input: '{"intent_id","intent_revision","role","objective","scope":[],"constraints":[],"acceptance_criteria":[...],"required_evidence":[...],"mutability","metadata":{"ownership_paths":[],"symbols":[],"domains":[],"dependencies":[],"related_assignments":[],"independent_from":[]}?}',
  root: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => fromStdin(AssignmentDraft, stdin, "assignment create").pipe(flatMap2((draft) => change((state) => createAssignment(state, draft))), map4((assignment) => ({ value: dispatchInfo(assignment) })))
});
var assignmentReserve = cmd({
  path: ["assignment", "reserve"],
  usage: "assignment reserve <id> [--capabilities Write,Shell] [--root <dir>]... [--worktree <dir>]",
  summary: "revalidate and reserve (Ready to Running); prints the dispatch parameters",
  root: true,
  flags: { capabilities: "string", root: "list", worktree: "string" },
  positionals: 1,
  run: (args) => gen2(function* () {
    const id = args.positionals[0];
    const given = stringFlag(args, "capabilities");
    const roots = listFlag(args, "root");
    const worktree = yield* openWorktree(stringFlag(args, "worktree") ?? projectRoot());
    const reserved = yield* change((state, { cloneId }) => gen2(function* () {
      const context = {
        projectRoot: worktree.root,
        writableRoots: roots.length > 0 ? roots : [worktree.root],
        worktree: worktree.key,
        cloneId: yield* cloneId
      };
      const assignment = yield* findAssignment(state, id ?? "");
      const capabilities = given === undefined ? routeFor(assignment.role).capabilities : given.split(",").filter((item) => item !== "");
      const input = yield* decodeStrict(ReserveInput)({
        assignment_id: assignment.id,
        capabilities
      });
      return yield* reserve(state, input, context);
    }));
    return { value: dispatchInfo(reserved) };
  })
});
var BIND_USAGE = "assignment bind <id> --agent <agentId> [--model haiku|sonnet|opus|fable] [--effort low..max] [--fingerprint <text>]";
var FINISH_USAGE = "assignment finish <id> --outcome success|failure|errored|interrupted|stopped";
var RESOLVE_USAGE = "reconcile resolve <id> --fail <reason> | --keep";
var assignmentBind = cmd({
  path: ["assignment", "bind"],
  usage: BIND_USAGE,
  summary: "attach the spawned agent; --model/--effort record a per-call override",
  root: true,
  flags: { agent: "string", model: "string", effort: "string", fingerprint: "string" },
  positionals: 1,
  run: (args) => gen2(function* () {
    const agent = yield* flagValue(args, "agent", BIND_USAGE);
    const model = yield* optionalChoice(ModelFlag, stringFlag(args, "model"));
    const effort = yield* optionalChoice(EffortFlag, stringFlag(args, "effort"));
    const fingerprint = stringFlag(args, "fingerprint") ?? (yield* rosterFingerprint);
    const input = yield* decodeStrict(BindAgentInput)({
      assignment_id: args.positionals[0],
      agent_id: agent,
      fingerprint
    });
    const bound = yield* changeOwn(input.assignment_id, (state) => bindAgent(state, input));
    const missed = model === undefined && effort === undefined ? undefined : yield* appendObservation({
      kind: "override",
      assignment_id: bound.id,
      agent_id: agent,
      ...model === undefined ? {} : { model },
      ...effort === undefined ? {} : { effort },
      at: yield* nowIso
    }).pipe(as2(undefined), catch_2((error) => succeed5(`override not recorded in ${observationsPath()}: ${error.message}`)));
    return {
      value: { ...summaryRow(bound), ...missed === undefined ? {} : { observation: missed } }
    };
  })
});
var assignmentRollback = cmd({
  path: ["assignment", "rollback"],
  usage: "assignment rollback <id>",
  summary: "return an unbound reservation to Ready after a failed spawn",
  root: true,
  flags: {},
  positionals: 1,
  run: (args) => withRef(args.positionals[0]).pipe(flatMap2((ref) => changeOwn(ref.assignment_id, (state) => rollbackReservation(state, ref))), map4((assignment) => ({ value: summaryRow(assignment) })))
});
var assignmentFinish = cmd({
  path: ["assignment", "finish"],
  usage: FINISH_USAGE,
  summary: "record the worker's execution outcome from its notification",
  input: '{"result":"the worker report"}',
  root: true,
  flags: { outcome: "string" },
  positionals: 1,
  run: (args, stdin) => gen2(function* () {
    const name = yield* flagValue(args, "outcome", FINISH_USAGE);
    const outcome = OUTCOMES[name];
    if (outcome === undefined)
      return yield* usageError(FINISH_USAGE, `Outcome ${name} is not one of ${Object.keys(OUTCOMES).join("|")}`);
    const body = yield* fromStdin(ResultBody, stdin, "assignment finish");
    const input = yield* decodeStrict(FinishInput)({
      assignment_id: args.positionals[0],
      outcome,
      result: body.result
    });
    const done = yield* changeOwn(input.assignment_id, (state) => finish(state, input));
    return { value: summaryRow(done) };
  })
});
var assignmentCancel = cmd({
  path: ["assignment", "cancel"],
  usage: "assignment cancel <id> [--reason <text>]",
  summary: "record Cancelled once the stopped notification has arrived",
  root: true,
  flags: { reason: "string" },
  positionals: 1,
  run: (args) => gen2(function* () {
    const reason = stringFlag(args, "reason");
    const input = yield* decodeStrict(CancelInput)({
      assignment_id: args.positionals[0],
      notification: "stopped",
      ...reason === undefined ? {} : { reason }
    });
    const done = yield* changeOwn(input.assignment_id, (state) => cancel(state, input));
    return { value: summaryRow(done) };
  })
});
var AcceptBody = AcceptanceRecord;
var assignmentAccept = cmd({
  path: ["assignment", "accept"],
  usage: "assignment accept <id>",
  summary: "record the evidence review of a Succeeded Assignment",
  input: '{"intent_revision":N,"rationale":"...","criteria_evidence":{"<label>":"..."},"required_evidence":{"<label>":"..."}}',
  root: true,
  flags: {},
  positionals: 1,
  run: (args, stdin) => gen2(function* () {
    const acceptance = yield* fromStdin(AcceptBody, stdin, "assignment accept");
    const done = yield* change((state) => accept(state, { assignment_id: args.positionals[0] ?? "", acceptance }));
    return { value: summaryRow(done) };
  })
});
var assignmentFollowUp = cmd({
  path: ["assignment", "follow-up"],
  usage: "assignment follow-up <id>",
  summary: "create an Assignment that continues a terminal one",
  input: "same JSON as assignment create",
  root: true,
  flags: {},
  positionals: 1,
  run: (args, stdin) => gen2(function* () {
    const draft = yield* fromStdin(AssignmentDraft, stdin, "assignment follow-up");
    const input = yield* decodeStrict(FollowUpInput)({
      predecessor_id: args.positionals[0],
      assignment: draft
    });
    const created = yield* change((state) => followUp(state, input));
    return { value: dispatchInfo(created) };
  })
});
var assignmentVerify = cmd({
  path: ["assignment", "verify"],
  usage: "assignment verify <id>",
  summary: "compare expected and observed model, effort and agent type",
  root: false,
  flags: {},
  positionals: 1,
  run: (args) => verifyAssignment(args.positionals[0] ?? "")
});
var select = cmd({
  path: ["select"],
  usage: "select <id> [--fingerprint <text>]",
  summary: "choose a worker to reuse or spawn for a Ready Assignment",
  root: true,
  flags: { fingerprint: "string" },
  positionals: 1,
  run: (args) => gen2(function* () {
    const fingerprint = stringFlag(args, "fingerprint") ?? (yield* rosterFingerprint);
    const input = yield* decodeStrict(SelectWorkerInput)({
      assignment_id: args.positionals[0],
      fingerprint
    });
    const state = yield* loadStateFile;
    const selection = yield* selectWorker(state, input);
    const assignment = yield* findAssignment(state, input.assignment_id);
    const route = routeFor(assignment.role);
    return {
      value: {
        action: selection._tag === "Reuse" ? "reuse" : "spawn",
        ...selection._tag === "Reuse" ? { agent_id: selection.agent_id, reason: selection.reason } : {},
        subagent_type: `${PLUGIN_NAME}:${assignment.role}`,
        model: route.model,
        effort: route.effort
      }
    };
  })
});
var routes2 = cmd({
  path: ["routes"],
  usage: "routes",
  summary: "list the 18 specialists with their pinned model and effort",
  root: false,
  flags: {},
  positionals: 0,
  run: () => succeed5({
    value: {
      routes: ROUTES.map((route) => ({
        role: route.role,
        mutability: route.mutability,
        capabilities: route.capabilities.length === 0 ? "none" : route.capabilities.join("+"),
        independence: route.independence,
        model: route.model,
        effort: route.effort
      }))
    }
  })
});
var reconcileList = cmd({
  path: ["reconcile"],
  usage: "reconcile",
  summary: "list Running rows to confirm by agent id, and those running elsewhere",
  root: false,
  flags: {},
  positionals: 0,
  run: () => read((state) => suspend2(() => readCloneId(stateDirPath())).pipe(map4((cloneId) => {
    const { local, elsewhere } = reconcile(state, cloneId);
    return {
      value: {
        running: local.map(summaryRow),
        ...elsewhere.length === 0 ? {} : {
          running_elsewhere: elsewhere.map((row) => ({
            ...summaryRow(row),
            clone: row.clone_id
          }))
        }
      }
    };
  })))
});
var reconcileResolve = cmd({
  path: ["reconcile", "resolve"],
  usage: RESOLVE_USAGE,
  summary: "fail a Running row with a reason, or keep it reserved",
  root: true,
  flags: { fail: "string", keep: "boolean" },
  positionals: 1,
  run: (args) => gen2(function* () {
    const reason = stringFlag(args, "fail");
    const keep = booleanFlag(args, "keep");
    if (reason === undefined === !keep)
      return yield* usageError(RESOLVE_USAGE, "Pick exactly one of --fail <reason> or --keep");
    const input = yield* decodeStrict(ResolveReconcileInput)(reason === undefined ? { _tag: "Keep", assignment_id: args.positionals[0] } : { _tag: "Fail", assignment_id: args.positionals[0], reason });
    const done = yield* change((state) => resolveReconcile(state, input));
    return { value: summaryRow(done) };
  })
});
var hookSessionStart = cmd({
  path: ["hook", "session-start"],
  usage: "hook session-start",
  summary: "SessionStart hook: core rules whole, plus a state summary that shrinks to fit, as additionalContext",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  stdinLimit: MAX_HOOK_BYTES,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => stdin.pipe(orElseSucceed2(() => ""), flatMap2(sessionStart), map4((text) => ({ text })))
});
var hookPreToolUse = cmd({
  path: ["hook", "pre-tool-use"],
  usage: "hook pre-tool-use",
  summary: "PreToolUse hook: effort observation, subagent VCS guard",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  stdinLimit: MAX_HOOK_BYTES,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => stdin.pipe(flatMap2(preToolUse), map4((text) => ({ text })))
});
var hookSubagentStart = cmd({
  path: ["hook", "subagent-start"],
  usage: "hook subagent-start",
  summary: "SubagentStart hook: observe the agent type",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => stdin.pipe(flatMap2(subagentStart), map4((text) => ({ text })))
});
var hookSubagentStop = cmd({
  path: ["hook", "subagent-stop"],
  usage: "hook subagent-stop",
  summary: "SubagentStop hook: observe the effort and transcript path, never block",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => stdin.pipe(flatMap2(subagentStop), map4((text) => ({ text })))
});
var hookPostToolUse = cmd({
  path: ["hook", "post-tool-use"],
  usage: "hook post-tool-use",
  summary: "PostToolUse hook on the Agent tool: observe the model a specialist started on",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) => stdin.pipe(flatMap2(postToolUse), map4((text) => ({ text })))
});
var COMMANDS = [
  intentShow,
  intentList,
  intentUse,
  intentClose,
  intentReopen,
  intentCreate,
  intentUpdate,
  assignmentShow,
  assignmentList,
  assignmentCreate,
  assignmentReserve,
  assignmentBind,
  assignmentRollback,
  assignmentFinish,
  assignmentCancel,
  assignmentAccept,
  assignmentFollowUp,
  assignmentVerify,
  select,
  routes2,
  reconcileResolve,
  reconcileList,
  hookSessionStart,
  hookPreToolUse,
  hookSubagentStart,
  hookSubagentStop,
  hookPostToolUse
].toSorted((a, b) => b.path.length - a.path.length);

// src/main.ts
var { version: VERSION } = package_default;
var HINTS = {
  UnknownRecord: "List ids with `holyclaude assignment list` or `holyclaude intent show`.",
  InvalidRecord: "Adjust the input to satisfy the rule in the message, then rerun.",
  InvalidPath: "Use relative portable paths such as packages/cli/src.",
  InvalidWorktree: "Give --worktree an existing directory, such as the path of a git worktree.",
  StaleRevision: "Reread with `holyclaude intent show`, reassess the work at the live revision, then retry.",
  NoRevision: "Set a valid revision with `holyclaude intent update --material`.",
  InvalidTransition: "Check the state with `holyclaude assignment show <id>` and use the command that fits it.",
  DispatchRefused: "Fix the condition named in the message, then reserve again.",
  Conflict: "A different record is stored; compare with `holyclaude assignment show <id>`.",
  InsufficientEvidence: "Cover exactly the declared labels in criteria_evidence and required_evidence.",
  TooLarge: "A file the command reads is over its read bound (the message names the file and the bound); trim it, move it away, or restore it from version control.",
  StateLocked: "Another process holds the state lock; retry in a moment, or delete the lock file named above if none is running.",
  LockLost: "The state was left untouched; rerun the command.",
  StateIo: "Check HOLYCLAUDE_STATE_DIR or CLAUDE_PROJECT_DIR and the file permissions.",
  SymlinkRefused: "Replace the symbolic link the message names with a real file or directory, or review why the repository has one; the state directory must hold none.",
  MigratedFileInTheWay: "Move the state.json.migrated the message names out of the folder (or delete it if you no longer need it), then rerun; the old state.json is still in place.",
  OwnedElsewhere: "Another clone reserved this Assignment. Settle it from there, or with `holyclaude reconcile resolve <id>` once you have evidence about its worker.",
  CorruptRecord: "Fix or delete the file the message names, or restore it from version control; a missing file reads as nothing, and a file under local/ can always be deleted.",
  SchemaError: "Send JSON that matches the command's input shape; see `holyclaude <command> --help`.",
  NoActiveIntent: "Choose with `holyclaude intent use <id>`, or name one with --intent <id>. With none open, run `holyclaude intent create` or `holyclaude intent reopen --intent <id>`.",
  IntentClosed: "Reopen it with `holyclaude intent reopen --intent <id>`, or pick an open Intent.",
  IntentBusy: "Wait for the Running Assignments to finish, or settle them with `holyclaude assignment cancel <id>` or `holyclaude reconcile resolve <id>`, then close again.",
  NotBound: "Bind the spawned agent first with `holyclaude assignment bind <id> --agent <agentId>`.",
  StdinMissing: "Pipe the JSON in, for example: echo '{...}' | holyclaude <command>."
};
var commandHelp = (command) => [
  `${command.usage}  ${command.summary}${command.root ? " [root]" : ""}`,
  ...command.input === undefined ? [] : [`stdin: ${command.input}`]
].join(`
`);
var topHelp = () => [
  "holyclaude <command> [args]; JSON on stdin, TOON on stdout; [root] commands change state",
  ...COMMANDS.toSorted((a, b) => a.usage.localeCompare(b.usage)).map((command) => `${command.usage}  ${command.summary}${command.root ? " [root]" : ""}`),
  "<command> --help shows its stdin shape"
].join(`
`);
var errorFields = (error) => {
  const tag = typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "Error";
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  const hint = error instanceof Usage ? error.hint : HINTS[tag] ?? "Run `holyclaude --help` for the commands.";
  return { error: tag, message, hint };
};
var stdinOf = (limit) => suspend2(() => process.stdin.isTTY ? fail5(new StdinMissing({ command: "this command" })) : tryPromise2({
  try: () => (limit === undefined ? Bun.stdin : Bun.stdin.slice(0, limit + 1)).text(),
  catch: () => new StdinMissing({ command: "this command" })
}));
var find = (argv) => COMMANDS.find((command) => command.path.every((part, index) => argv[index] === part));
var run2 = (argv) => gen2(function* () {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help")
    return { text: `${topHelp()}
` };
  if (argv[0] === "--version" || argv[0] === "-V")
    return { text: `${VERSION}
` };
  const command = find(argv);
  if (command === undefined)
    return yield* new Usage({
      message: `Unknown command ${argv.slice(0, 2).join(" ")}`,
      hint: "Run `holyclaude --help` for the commands."
    });
  const rest = argv.slice(command.path.length);
  if (rest.includes("--help") || rest.includes("-h"))
    return { text: `${commandHelp(command)}
` };
  const parsed = yield* parseArgs(rest, command.flags, command.usage);
  const count = parsed.positionals.length;
  if (count !== command.positionals && !(command.optional && count === command.positionals - 1))
    return yield* new Usage({
      message: `Expected ${command.positionals} argument(s), got ${parsed.positionals.length}`,
      hint: `Usage: holyclaude ${command.usage}`
    });
  return yield* command.run(parsed, stdinOf(command.stdinLimit));
});
var render = (outcome) => ({
  out: outcome.text ?? toon(outcome.value),
  code: outcome.code ?? 0
});
var failure = (error) => ({
  out: toon(errorFields(error)),
  code: error instanceof Usage ? 2 : 1
});
var program2 = (argv) => {
  const hook = argv[0] === "hook";
  const quiet = { out: "", code: 0 };
  return run2(argv).pipe(map4(render), catch_2((error) => succeed5(hook ? quiet : failure(error))), catchCause2((cause) => succeed5(hook ? quiet : failure({ _tag: "Defect", message: pretty(cause) }))));
};
var { out, code } = await runPromise2(program2(Bun.argv.slice(2)));
if (code === 0)
  process.stdout.write(out);
else
  process.stderr.write(out);
process.exitCode = code;
