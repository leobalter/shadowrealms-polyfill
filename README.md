# Isolated Realm API changes

This comment describes a possible solution for the API of the Realm to work with the new isolation model described in [this issue](https://github.com/tc39/proposal-realms/issues/289).

## API (in typescript notation)

```ts
declare class Realm {
    constructor();
    evaluate(sourceText: string): PrimitiveValueOrCallable;
    importValue(specifier: string, bindingName: string): Promise<PrimitiveValueOrCallable>;
}
```

## Evaluate with connecting functions

The Realm#evaluate method is most analogous to indirect eval though PerformEval, diverging at _where_ the source is evaluated and _what_ can be returned, ie. primitive values or __callable__ objects. Other non-primitive values would throw a TypeError in the incubator Realm.

When `Realm#evaluate` results in callable objects - generally functions - it creates a new _wrapped_ function in the incubator realm that chains to the inner Realm's function when called.

This _wrapped_ function can also only receive primitive values or __callable__ objects as arguments. If the incubator Realm calls the wrapped function with another function as argument, the chained function in the child realm will receive a wrapped function of the given argument.

The wrapped functions are frozen and do not share any identity cross realms with the function they chain onto. They must be connected through the realm instance as weakrefs enabling eventual garbage collection.

```javascript
const red = new Realm();
const redNumber = red.evaluate('var x = 42; x;');
redNumber; // yields 42

const redFunction = red.evaluate('(function(value) { return value * 2; })');

redFunction(21); // yields 42
```

A good analogy here is a cross realm bound function, which is a function in a realm that is available in the incubator realm, this function's job is to call another function, this time, a function inside the realm, that might or might not return a completion value.

This mechanism allows the incubator realm to define logic inside the realm without relying on populating the global object with global names just for the purpose of communication between the two realms.

## Non-callable objects will throw an error

To avoid identity discontinuity, the evaluation cannot transfer objects. When evaluation completes with a non-callable object, the incubator realm throws a TypeError.

```javascript
const red = new Realm();

try {
    red.evaluate('[]');
} catch(err) {
    assert(err instanceof TypeError);
}
```

## <a id="fnwrapping"></a> Automatic function wrapping

__Callable__ values resolved in the evaluation are auto wrapped.

```javascript
const red = new Realm();
const blueFunction = (x, y) => x + y;

const redFunction = red.evaluate(`
    0, function(redFunctionArg, a, b, c) {
        return redFunctionArg(a, b) * c;
    }
`);

redFunction(blueFunction, 2, 3, 4); // yields 20
```

```javascript
let myValue;

const red = new Realm();
function blueFunction(x) {
    globalThis.myValue = x;
};

// cb is a new function in the red Realm that chains the call to the blueFunction
const redFunction = red.evaluate(`
    0, function(cb) {
        globalThis.myValue = "red";
        cb(42);
        return globalThis.myValue;
    }
`);

redFunction(blueFunction); // yields the string 'red'

myValue === 42; // true
```

### Non-callable object returns

The wrapped function throws a TypeError if it returns a non-callable object.

```javascript
const red = new Realm();

const redFunction = red.evaluate(`
    0, function() {
        return {};
    }
`);

try {
    redFunction();
} catch(err) {
    assert(err instanceof TypeError);
}
```

### Errors are wrapped into a TypeError

Errors are wrapped into a TypeError while traveling from one realm to another.

```javascript
const red = new Realm();

try {
    red.evaluate('throw "foo"');
} catch(err) {
    assert(err.constructor === TypeError);
}

try {
    red.evaluate('throw new Error()');
} catch(err) {
    assert(err.constructor === TypeError);
}
```

This also applies to errors caused in the wrapped functions.

```javascript
const red = new Realm();

class CustomError extends Error {};

function blueFunction(x) {
    throw new CustomError('meep');
};

const redFunction = red.evaluate(`
    0, function(cb) {
        try {
            cb();
        } catch (err) {

            // The error is a TypeError wrapping the abrupt completion
            // CustomError from the blueFunction call
            err.constructor === TypeError; // true
            throw 'foo';
        }
    }
`);

try {
    redFunction(blueFunction);
} catch(err) {

    // The error is a TypeError wrapping the abrupt completion 'foo' from the redFunction call.
    err.constructor === TypeError // true
}
```

### Frozen connecting functions

The wrapped functions are __frozen__ and they share no properties from the other realm.

```javascript
const red = new Realm();

function blueFunction() {
    return 42;
}

blueFunction.x = 'noop';

const redFunction = red.evaluate(`
    0, function(cb) {
        Object.isFrozen(cb); // true
        cb(); // yields 42;
        cb.x; // undefined
        Object.prototype.hasOwnProperty.call(cb, 'x'); // false

        return 1;
    }
`);

assert(Object.isFrozen(redFunction));

redFunction(blueFunction); // yields 1
```

### Connecting functions are regular functions

The autowrapping creates a new regular function within the other realm that chains a call to the given function. The new function inherits from the realm's `%Function%`.

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    0, function(cb) {
        return cb instanceof Function &&
            Object.getPrototypeOf(cb) === Function.prototype;
    }
`);

function blueFunction() {}

redFunction(blueFunction); // true
```

### Callable objects, not only functions

All the API checks if the given value is __callable__. It does not run extra magic wrapping other functions.

While this part still works, there is no automatic wrapping proposed here for returned promises or iterators. Sending async functions, classes, generators, and async generators are not useful.

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    0, function(cb) {
        return cb instanceof Function &&
            Object.getPrototypeOf(cb) === Function.prototype;
    }
`);

redFunction(async function() {}); // true
```

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    0, function(cb) {
        return cb();
    }
`);

// Throws a TypeError, cb() returned a Promise, which is a non primitive, non callable value.
redFunction(async function() {});
```

#### Proxy wrapped functions are callable

Addressing callable objects allows chaining to Proxy wrapped functions.

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    new Proxy(function fn() {}, {
        call(...) { ... }
    });
`);
```

### Auto wrapping for eventual function returns

The same auto wrapping happens for __callable__ values returned from a realm chain.

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    0, function() {
        globalThis.redValue = 42;
        return function() {
            return globalThis.redValue;
        };
    }
`);

const wrapped = redFunction();

globalThis.redValue = 'fake';

wrapped(); // yields 42
```

### this bindings are not exposed

As the API only provides a losely connecting function, so `this` is not exposed and `new.target` cannot be transfered to the other realm.

```javascript
const red = new Realm();
const redFunction = red.evaluate(`
    0, function(cb) {

        // .call only applies to the wrapped function created in this Realm
        // The chain will only transfer the arguments
        return cb.call({x: 'poison!'}, 2);
    }
`);

function blueFunction(arg) {
    return this.x * arg;
}

globalThis.x = 21;
redFunction(blueFunction); // yields 42
```

## The `importBinding` connector

The `Realm#importBinding` can be used to inject modules using the dynamic `import` expression within the created Realm. This module returns a promise that is resolved when the import is resolved within the Realm. This promise will be resolved with a matching value of the given binding name.

```javascript
const r = new Realm();
const promise = r.importBinding('./my-module.js', 'foo');

const res = await promise;
// res === <the foo binding for ./my-module.js>
```

The resolved value can be a primitive (Symbols included), or a wrapped function. Other non-primitive values would reject the promise in the incubator Realm.

```javascript
// ./module.js
export const fooNumber = 42;
export const timesTwo = (x) => x * 2;
export default function(x, y) { return x * y; }

export const nono = {};
```

```javascript
// incubator Realm script
const r = new Realm();
const specifier = './my-module.js';

// As the module is resolved within the child Realm r, we can just reuse
// importBinding
const [ fooN, timesTwo, myWrappedFn ] = await Promise.all(
    r.importBinding(specifier, 'fooNumber'),
    r.importBinding(specifier, 'timesTwo'),
    r.importBinding(specifier, 'default'),
);

fooN; // 42
typeof timesTwo; // 'function'

// timesTwo is just a wrapped function that chains to the original timesTwo
// inside the child Realm r
timesTwo instanceof Function; // true
Object.getPrototypeOf(timesTwo) === Function.prototype; // true
```

A TypeError is thrown if the binding has a non-primitive, non-callable value.

```javascript
try {
    await r.importBinding(specifier, 'nono'); // Throws TypeError
} catch(err) {
    err instanceof TypeError; // No identity discontinuity
}
```

_There's no dynamic mapping to the primitive values from the imported names. The wrapped function defers a call to the imported function in the child realm._

### `importBinding` auto wrapping

```javascript
const red = new Realm();

const wrappedRedFn = await red.importBinding('./specifier.js', 'injectedFunction');
```

The received `wrappedRedFn` is a Blue Function. When called, it triggers a call to the Red Function captured from the module import.

```javascript
assert(wrappedRedFn instanceof Function);
assert.sameValue(Object.getPrototypeOf(wrappedRedFn), Function.prototype);
```

The injected module namespace and function is not leaked within the Red Realm, but can observe things only from the Red Realm.

```javascript
// specifier.js:
export function injectedFunction(x) {
    return `${globalThis.someValue}, ${x}!`;
};
```

```javascript
const red = new Realm();

const wrappedRedFn = await red.importBinding('./specifier.js', 'injectedFunction');

// sets a global someValue in the red Realm
red.evaluate('globalThis.someValue = "Hello"');

// and a global someValue in the blue Realm
globalThis.someValue = 'Olá';

wrappedRedFn('World'); // yields to 'Hello, World!'
```

### Open Questions

Should a missing binding reject the importBinding promise?

```javascript
try {
    await r.importBinding(specifier, 'popopop');
} catch(err) {
    err instanceof TypeError; // No identity discontinuity
}
```

Should importBinding coerce the specifiers arguments (`ToPrimitive => string`) that are non-primitives before sending it to the child Realm? Otherwise, should it throw a TypeError for non string values?

```javascript
r.importBinding({ toString() { return './my-module.js'; } });
```

## CSP on and off modes

The proposed API allows usage of the Realms API with regardless of CSP as some good usage is possible without string evaluation. The tradeoff for the string evaluation is still depending on the async execution for injecting code.

* `importValue`: does not require string evaluation
* `evaluate`: requires string evaluation

