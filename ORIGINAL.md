Ref https://github.com/tc39/proposal-realms/issues/289#issuecomment-783893130

# Isolated Realm API changes

This comment describes a possible solution for the API of the Realm to work with the new isolation model described in this issue.

## API (in typescript notation)

```ts
declare class Realm {
    constructor();
    eval(sourceText: string): any;
    Function(...args: string[]): Function;
    AsyncFunction(...args: string[]): AsyncFunction;
    import(specifier: string): Promise<???>;
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
* A Bridge Function can only return a primitive value. Throws otherwise.
* A Bridge Function is a frozen function to prevent users from attempting to use the function itself as a side channel between realms. (`f.x = 1` will throw in strict mode).

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
* A Async Bridge Function is a frozen function to prevent users from attempting to use the function itself as a side channel between realms. (`f.x = 1` will throw in strict mode).
* The Promise must resolves to a primitive value, otherwise the promise will be rejected.
* The Promise instance accessible in the incubator realm is frozen to prevent users from "attempting" to use the function itself as a side channel between realms.

This works great for the incubator realm since it provides all the tools to create a pull system from the incubator call, but still doesn't provide an easy mechanism to implement a push system from the realm itself. In my opinion this is not a deal breaker, and can probably be implemented in user-land using something like an async iterators protocol.

## Important Questions

### `arguments.callee` in Bridge Functions?

Since the function itself is sloppy, what should happen here? Should `Realm.prototype.Function` create strict functions only? Probably.

### Is `Realm.prototype.eval` really needed?

Probably yes, two main reasons:

1. It is possible to do the exact same thing using `Realm.prototype.Function`, but that's subject to a global `eval` lookup inside the realm, e.g.:

```js
const r = new Realm();
const directEvalInsideRealm = r.Function('s', `return eval(s);`);
directEvalInsideRealm(`1 + 1`); // yields 2
```

Specifically, if the code inside the realm removes `globalThis.eval`, the incubator realm will have no way to eval anything.

2. If we provide the `Function` evaluator, it seems reasonable to have `eval` as well.

Those two reasons seem strong enough IMO.

### Is `Realm.prototype.import` really needed?

Probably yes, one main reason: convenience.

It is possible to do the exact same thing using `Realm.prototype.AsyncFunction`:

```js
const r = new Realm();
const dynamicImportInsideRealm = r.Function('u', `return import(u).then((ns) => true);`);
dynamicImportInsideRealm(`/path/to/module.js`); // yields a promise that resolves to true when the module is evaluated
```

Note: since one of the invariants for `Realm.prototype.AsyncFunction` is to resolve to a primitive value, we can't just return the promise to the namespace.

### What should `Realm.prototype.import` resolves to?

This is an open question.

### What should happen if CSP is preventing evaluation?

This is an open question. Should these 3 evaluation mechanism (`eval`, `Function` and `AsyncFunction`) be subject to that? I suspect it should, then how useful is the Realm that only allows import without a feedback loop to the incubator realm?

## What are the problems with the API proposed by @domenic in https://github.com/tc39/proposal-realms/issues/289#issue-790389574?

The API is cumbersome, and it requires definition of global names, which is always tricky.

## What are the problems with the API proposed by @littledan in https://github.com/tc39/proposal-realms/issues/289#issuecomment-776962989?

It seems that an API like that will:

a) force async mechanism to be in place.
b) imposes a protocol that relies on the export names defined in the module, which is new.
c) it requires module blocks to be available to do anything useful with it.
