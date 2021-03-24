# Isolated Realm API changes

This comment describes a possible solution for the API of the Realm to work with the new isolation model described in [this issue](https://github.com/tc39/proposal-realms/issues/289).

## API (in typescript notation)

```ts
declare class Realm {
    constructor();
    Function(...args: (string|function)[]): Function;
    importBinding(specifier: string | function): Promise<any>;
}
```

## Bridge Functions (Remote Functions)

A bridge function is just a function that is created via `Realm.prototype.Function`, which returns a function in the incubator realm who's body is evaluated in the Realm itself. E.g.:

```js
const r = new Realm();
const doSomething = r.Function('a', 'b', `return a + b;`);
doSomething(1, 2); // yields 3
```

A good analogy here is a cross realm bound function, which is a function in a realm that is available in the incubator realm, this function's job is to call another function, this time, a function inside the realm, that might or might not return a completion value.

This mechanism allows the incubator realm to define logic inside the realm without relying on populating the global object with global names just for the purpose of communication between the two realms.

Additionally, this allows the incubator to easily pass identities when invoking a function inside the realm, e.g.: a symbol, which is not possible via `Realm.prototype.eval` because the Symbol is not something that you can point to from source text. This feature provides a synchronous communication mechanism that allows passing and returning primitive values across the two realms.

### Invariants

* A Bridge Function can only receive primitive or __callable__ values as arguments. Throws otherwise.
* A Bridge Function can only return a primitive or __callable__ value. Throws a TypeError otherwise.
* A Bridge Function is a frozen function to prevent users from attempting to use the function itself as a side channel between realms. (`f.x = 1` will throw in strict mode).

## <a id="fnwrapping"></a> Automatic function wrapping

__Callbable__ values sent to bridge functions are auto wrapped.

```javascript
const red = new Realm();
const blueFunction = (x, y) => x + y;

const redFunction = red.Function('redFunctionArg', 'a', 'b', 'c', 'return redFunctionArg(a, b) * c;');

redFunction(blueFunction, 2, 3, 4); // yields 20
```

```js
let myValue;

const red = new Realm();
function blueFunction(x) {
    globalThis.myValue = x;
};

// cb is a new function in the red Realm that bridges the call to the blueFunction
const redFunction = red.Function('cb', 'globalThis.myValue = "red"; cb(42); return globalThis.myValue;');

redFunction(blueFunction); // yields the string 'red'

myValue === 42; // true
```

Errors are wrapped into a TypeError while traveling from one realm to another.

```js
const red = new Realm();

class CustomError extends Error {};

function blueFunction(x) {
    throw new CustomError('meep');
};

const redFunction = red.Function('cb', `
    try {
        cb();
    } catch (err) {

        // The error is a TypeError wrapping the abrupt completion CustomError from the blueFunction call
        err.constructor === TypeError; // true
        throw 'foo';
    }
`);

try {
    redFunction(blueFunction);
} catch(err) {

    // The error is a TypeError wrapping the abrupt completion 'foo' from the redFunction call.
    err.constructor === TypeError // true
}
```

The wrapped functions are __frozen__ and they share no properties from the other realm.

```javascript
const red = new Realm();

function blueFunction() {
    return 42;
}

blueFunction.x = 'noop';

const redFunction = red.Function('cb', `
    Object.isFrozen(cb); // true
    cb(); // yields 42;
    cb.x; // undefined
    Object.prototype.hasOwnProperty.call(cb, 'x'); // false

    return 1;
`);

redFunction(blueFunction); // yields 1
```

The autowrapping creates a new regular function within the other realm that bridges a call to the given function. The new function inherits from the realm's `%Function%`.

```js
const red = new Realm();
const redFunction = r.Function('cb', 'return cb instanceof Function && Object.getPrototypeOf(cb) === Function.prototype;');

function blueFunction() {}

redFunction(blueFunction); // true
```

All the API checks is if the given value is __callable__. It does not run extra magic wrapping other functions.

While this part still works, there is no automatic wrapping proposed here for returned promises or iterators. Sending async functions, classes, generators, and async generators are not useful.

```javascript
const red = new Realm();
const redFunction = red.Function('cb', 'return cb instanceof Function && Object.getPrototypeOf(cb) === Function.prototype;');

redFunction(async function() {}); // true
```

```javascript
const red = new Realm();
const redFunction = red.Function('cb', 'return cb();');

// Throws a TypeError, cb() returned a Promise, which is a non primitive, non callable value.
redFunction(async function() {});
```

The same auto wrapping happens for __callable__ values returned from a realm bridge.

```javascript
const red = new Realm();
const redFunction = red.Function(`
    globalThis.redValue = 42;
    return function() {
        return globalThis.redValue;
    };
`);

const wrapped = redFunction();

globalThis.redValue = 'fake';

wrapped(); // yields 42
```

### Function this bindings are not exposed

As the API only provides a bridge function, `this` is not exposed.

```javascript
const red = new Realm();
const redFunction = red.Function('cb', `
    // .call only applies to the bridge function created in this Realm
    // The bridge will only channel the arguments
    return cb.call({x: 'poison!'}, 2);
`);

function blueFunction(arg) {
    return this.x * arg;
}

globalThis.x = 21;
redFunction(blueFunction); // yields 42
```

## `importBinding` Bridge

The `Realm#importBinding` can be used to inject modules using the dynamic `import` expression within the created Realm. This module returns a promise that is resolved when the import is resolved within the Realm. This promise will be resolved with a matching value of the given binding name.

```js
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

// timesTwo is just a wrapped function that bridges to the original timesTwo
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

```js
const red = new Realm();

const wrappedRedFn = await red.importBinding('./specifier.js', 'injectedFunction');
```

The received `wrappedRedFn` is a Blue Function. When called, it triggers a call to the Red Function captured from the module import.

```js
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

const redFunction = red.Function('globalThis.someValue = "Hello"');
redFunction(); // sets a global someValue in the red Realm

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

* `importBinding`: does not require string evaluation
* `Function`: requires string evaluation
* Wrapped functions won't require string evaluation

## Bikeshed

The name `importBinding` is open for bikeshed.
