# Isolated Realm API changes

This comment describes a possible solution for the API of the Realm to work with the new isolation model described in [this issue](https://github.com/tc39/proposal-realms/issues/289).

Original comment contents at the [ORIGINAL.md](ORIGINAL.md) file.

## API (in typescript notation)

```ts
declare class Realm {
    constructor();
    eval(sourceText: string): any;
    Function(...args: string[]): Function;
    AsyncFunction(...args: string[]): AsyncFunction;
    import(specifier: string): Promise<undefined>;
    wrappedCallbackFunction(callback: Function): Function;
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

* A Bridge Function can only receive primitive values as arguments. Throws otherwise.
    - [ ] TODO: It's currently coercing values to string
* A Bridge Function can only return a primitive value. Throws a TypeError otherwise.
* A Bridge Function is a frozen function to prevent users from attempting to use the function itself as a side channel between realms. (`f.x = 1` will throw in strict mode).
    - NOTE: even if it's not frozen, properties wouldn't leak to the other realm.

## Async Bridge Function (Async Remote Function)

To add support for native promises when communicating between realms, it seems that by adding `Realm.prototype.AsyncFunction`, we might be able to provide extra capabilities that can be used to define an async protocol between the two realms.

```js
const r = new Realm();
const asyncFunctionInsideRealm = r.AsyncFunction('x', `return await (x * 2);`);
asyncFunctionInsideRealm(1); // yields a Promise instance in incubator that eventually resolves to 2
```

Of course, the promise instance received by the incubator realm is not the one produced by the body of the function, but a wrapping one with the identity associated to the incubator realm.

### Invariants

* A Async Bridge Function can only receive primitive values as arguments. Throws otherwise.
    - [ ] TODO: It's currently coercing values to string
* A Async Bridge Function is a frozen function to prevent users from attempting to use the function itself as a side channel between realms. (`f.x = 1` will throw in strict mode).
* The Promise must resolves to a primitive value, otherwise the promise will be rejected.
* The Promise instance accessible in the incubator realm is frozen to prevent users from "attempting" to use the function itself as a side channel between realms.

This works great for the incubator realm since it provides all the tools to create a pull system from the incubator call, but still doesn't provide an easy mechanism to implement a push system from the realm itself. In my opinion this is not a deal breaker, and can probably be implemented in user-land using something like an async iterators protocol.

## import Bridge

The `Realm#import` can be used to inject modules using the dynamic `import` expression within the created Realm. This module returns a promise that is resolved when the import is resolved within the Realm. This promise will be resolved to undefined and the imported module namespace object is ignored. The injections should operate through shared globals.

```js
const r = new Realm();
const promise = r.import('./my-module.js');

const res = await promise;
// res === undefined
```

## wrappedCallbackFunction

```js
const red = new Realm();
const blueFunction = (x, y) => x + y;
const blueFunctionWrapped = r.wrappedCallbackFunction(blueFunction);

// blueFunction !== blueFunctionWrapped

const redFunction = r.Function('cb', 'a', 'b', 'c', 'return cb(a, b) * c;');

// redFunction is equivalent to function(cb, a, b, c) { return cb(a, b) * c; }

redFunction(blueFunctionWrapped, 2, 3, 4); // yields 20

// redFunction(blueFunction) throws a TypeError
```

```js
let myValue;

const red = new Realm();
function blueFunction(x) {
    myValue = x;
};

const blueFunctionWrapped = r.wrappedCallbackFunction(blueFunction);

const redFunction = r.Function('cb', 'return cb(42);');

redFunction(blueFunctionWrapped);

// myValue === 42
```

### Invariants

The wrapped function cannot receive or return non-primitive arguments.

```js
const red = new Realm();
function blueFunction(x) {
    return {}
};

const blueFunctionWrapped = r.wrappedCallbackFunction(blueFunction);

const redFunction = r.Function('cb', 'return cb();');

redFunction(blueFunctionWrapped); // Throws TypeError
```
