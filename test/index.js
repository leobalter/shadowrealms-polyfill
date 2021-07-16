const { module, test } = QUnit;

module('Realm', () => {
    test('returns a new instance using a global Realm', t => {
        t.ok(new Realm);
    });
});

module('Realm#evaluate', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new Realm();
    });

    test('coerces argument to string', t => {
        t.expect(7);
        t.strictEqual(r.evaluate(['1+1']), 2);
        t.strictEqual(r.evaluate({ [Symbol.toPrimitive]() { return '1+1'; }}), 2);
        t.strictEqual(r.evaluate(1), 1);
        t.strictEqual(r.evaluate(null), null);
        t.strictEqual(r.evaluate(undefined), undefined);
        t.strictEqual(r.evaluate(true), true);
        t.strictEqual(r.evaluate(false), false);
    });

    test('resolves to common primitive values', t => {
        t.strictEqual(r.evaluate('1 + 1'), 2);
        t.strictEqual(r.evaluate('null'), null);
        t.strictEqual(r.evaluate(''), undefined, 'undefined from empty completion');
        t.strictEqual(r.evaluate('undefined'), undefined);
        t.strictEqual(r.evaluate('true'), true);
        t.strictEqual(r.evaluate('false'), false);
        t.strictEqual(r.evaluate('function fn() {}'), undefined, 'fn declaration has empty completion');
        t.ok(Number.isNaN(r.evaluate('NaN')));
        t.strictEqual(r.evaluate('-0'), -0);
        t.strictEqual(r.evaluate('"str"'), 'str');
    });

    test('resolves to symbol values (primitives)', t => {
        const s = r.evaluate('Symbol()');

        t.strictEqual(typeof s, 'symbol');
        t.ok(Symbol.prototype.toString.call(s));
        t.strictEqual(s.constructor, Symbol, 'primitive does not expose other Realm constructor');
        t.strictEqual(Object.getPrototypeOf(s), Symbol.prototype, '__proto__ of s is from the blue realm');
        t.strictEqual(r.evaluate('Symbol.for("x")'), Symbol.for('x'));
    });

    test('throws a TypeError if evaluate resolves to object values', t => {
        t.throws(() => r.evaluate('globalThis'), TypeError, 'globalThis');
        t.throws(() => r.evaluate('[]'), TypeError, 'array literal');
        t.throws(() => r.evaluate(`
            ({
                [Symbol.toPrimitive]() { return 'string'; },
                toString() { return 'str'; },
                valueOf() { return 1; }
            });
        `), TypeError, 'object literal with immediate primitive coercion methods');
        t.throws(() => r.evaluate('Object.create(null)'), 'ordinary object with null __proto__');
    });

    test('Errors from the other realm is wrapped into a TypeError', t => {
        t.throws(() => r.evaluate('...'), TypeError, 'SyntaxError => TypeError'); // SyntaxError
        t.throws(() => r.evaluate('throw 42'), TypeError, 'throw primitive => TypeError');
        t.throws(() => r.evaluate('throw new ReferenceError("aaa")'), TypeError, 'custom ctor => TypeError');
        t.throws(() => r.evaluate('throw new TypeError("aaa")'), TypeError, 'RedTypeError => BlueTypeError');
    });

    module('wrapped functions', () => {
        test('accepts callable objects', t => {
            t.strictEqual(typeof r.evaluate('function fn() {} fn'), 'function', 'value from a fn declaration');
            t.strictEqual(typeof r.evaluate('(function() {})'), 'function', 'function expression');
            t.strictEqual(typeof r.evaluate('(async function() {})'), 'function', 'async function expression');
            t.strictEqual(typeof r.evaluate('(function*() {})'), 'function', 'generator expression');
            t.strictEqual(typeof r.evaluate('(async function*() {})'), 'function', 'async generator expression');
            t.strictEqual(typeof r.evaluate('() => {}'), 'function', 'arrow function');
        });

        test('wrapped functions share no properties', t => {
            const wrapped = r.evaluate(`
                function fn() {
                    return fn.secret;
                }

                fn.secret = 'confidential';
                fn;
            `);

            t.strictEqual(wrapped.secret, undefined);
            t.strictEqual(wrapped(), 'confidential');
        });

        test('wrapped functions share no properties, extended', t => {
            // this extends the previous test
            r.evaluate(`
                function fn() { return 42; }
                globalThis.arrow = x => x * 2;
                globalThis.pFn = new Proxy(fn, {
                    apply() {
                        pFn.used = 1;
                        return 39;
                    }
                });
                async function aFn() {
                    return 1;
                }

                function * genFn() {
                    return 1;
                }

                fn.x = 'secrets';
                arrow.x = 'secrets';
                pFn.x = 'secrets';
                aFn.x = 'secrets';
                genFn.x = 'secrets';
            `);

            const wrappedOrdinary = r.evaluate('fn');
            t.strictEqual(typeof wrappedOrdinary, 'function', 'ordinary function wrapped');
            t.strictEqual(wrappedOrdinary(), 42, 'ordinary, return');
            t.strictEqual(wrappedOrdinary.x, undefined, 'ordinary, no property shared');

            const wrappedArrow = r.evaluate('arrow');
            t.strictEqual(typeof wrappedArrow, 'function', 'arrow function wrapped');
            t.strictEqual(wrappedArrow(7), 14, 'arrow function, return');
            t.strictEqual(wrappedArrow.x, undefined, 'arrow function, no property');

            const wrappedProxied = r.evaluate('pFn');
            t.strictEqual(typeof wrappedProxied, 'function', 'proxied ordinary function wrapped');
            t.strictEqual(r.evaluate('pFn.used'), undefined, 'pFn not called yet');
            t.strictEqual(wrappedProxied(), 39, 'return of the proxied callable');
            t.strictEqual(r.evaluate('pFn.used'), 1, 'pfn called');
            t.strictEqual(wrappedProxied.x, undefined, 'proxy callable, no property');

            const wrappedAsync = r.evaluate('aFn');
            t.strictEqual(typeof wrappedAsync, 'function', 'async function wrapped');
            t.throws(() => wrappedAsync(), TypeError, 'wrapped function cannot return non callable object');
            t.strictEqual(wrappedAsync.x, undefined, 'async fn, no property');

            const wrappedGenerator = r.evaluate('genFn');
            t.strictEqual(typeof wrappedGenerator, 'function', 'gen function wrapped');
            t.throws(() => wrappedGenerator(), TypeError, 'wrapped function cannot return non callable object');
            t.strictEqual(wrappedGenerator.x, undefined, 'generator, no property');
        });

        test('new wrapping on each evaluation', t => {
            r.evaluate(`
                function fn() {
                    return 42;
                }
            `);

            const wrapped = r.evaluate('fn');
            const otherWrapped = r.evaluate('fn');

            t.notStrictEqual(wrapped, otherWrapped);
            t.strictEqual(typeof wrapped, 'function');
            t.strictEqual(typeof otherWrapped, 'function');
        });

        test('wrapped functions can resolve callable returns', t => {
            const wrapped = r.evaluate('x => y => x * y');
            const nestedWrapped = wrapped(2);
            const otherNestedWrapped = wrapped(4);

            t.strictEqual(otherNestedWrapped(3), 12);
            t.strictEqual(nestedWrapped(3), 6);

            t.notStrictEqual(nestedWrapped, otherNestedWrapped, 'new wrapping for each return');
        });

        test('wrapped function from return values share no identity', t => {
            r.evaluate(`
                function fn() { return 42; }
                globalThis.arrow = x => x * 2;
                globalThis.pFn = new Proxy(fn, {
                    apply() {
                        pFn.used = 1;
                        return 39;
                    }
                });
                async function aFn() {
                    return 1;
                }

                function * genFn() {
                    return 1;
                }

                fn.x = 'secrets';
                arrow.x = 'secrets';
                pFn.x = 'secrets';
                aFn.x = 'secrets';
                genFn.x = 'secrets';
            `)

            const wrappedOrdinary = r.evaluate('() => fn')();
            t.strictEqual(typeof wrappedOrdinary, 'function', 'ordinary function wrapped');
            t.strictEqual(wrappedOrdinary(), 42, 'ordinary, return');
            t.strictEqual(wrappedOrdinary.x, undefined, 'ordinary, no property shared');

            const wrappedArrow = r.evaluate('() => arrow')();
            t.strictEqual(typeof wrappedArrow, 'function', 'arrow function wrapped');
            t.strictEqual(wrappedArrow(7), 14, 'arrow function, return');
            t.strictEqual(wrappedArrow.x, undefined, 'arrow function, no property');

            const wrappedProxied = r.evaluate('() => pFn')();
            t.strictEqual(typeof wrappedProxied, 'function', 'proxied ordinary function wrapped');
            t.strictEqual(r.evaluate('pFn.used'), undefined, 'pFn not called yet');
            t.strictEqual(wrappedProxied(), 39, 'return of the proxied callable');
            t.strictEqual(r.evaluate('pFn.used'), 1, 'pfn called');
            t.strictEqual(wrappedProxied.x, undefined, 'proxy callable, no property');

            const wrappedAsync = r.evaluate('() => aFn')();
            t.strictEqual(typeof wrappedAsync, 'function', 'async function wrapped');
            t.throws(() => wrappedAsync(), TypeError, 'wrapped function cannot return non callable object');
            t.strictEqual(wrappedAsync.x, undefined, 'async fn, no property');

            const wrappedGenerator = r.evaluate('() => genFn')();
            t.strictEqual(typeof wrappedGenerator, 'function', 'gen function wrapped');
            t.throws(() => wrappedGenerator(), TypeError, 'wrapped function cannot return non callable object');
            t.strictEqual(wrappedGenerator.x, undefined, 'generator, no property');
        });

        test('arguments are wrapped into the inner Realm', t => {
            const blueFn = (x, y) => x + y;

            const redWrappedFn = r.evaluate(`
            0, function(blueWrappedFn, a, b, c) {
                return blueWrappedFn(a, b) * c;
            }
            `);
            t.strictEqual(redWrappedFn(blueFn, 2, 3, 4), 20);
        });

        test('arguments are wrapped into the inner Realm, extended', t => {
            const blueFn = (x, y) => x + y;

            const redWrappedFn = r.evaluate(`
                function fn(wrapped1, wrapped2, wrapped3) {
                    if (wrapped1.x) {
                        return 1;
                    }
                    if (wrapped2.x) {
                        return 2;
                    }
                    if (wrapped3.x) {
                        // Not unwrapped
                        return 3;
                    }
                    if (wrapped1 === wrapped2) {
                        // Always a new wrapped function
                        return 4;
                    }

                    // No unwrapping
                    if (wrapped3 === fn) {
                        return 5;
                    };

                    return true;
                }
                fn.x = 'secret';
                fn;
            `);
            t.strictEqual(redWrappedFn(blueFn, blueFn, redWrappedFn), true);
        });

        test('Wrapped function observing their scopes', t => {
            let myValue;

            function blueFn(x) {
                myValue = x;
                return myValue;
            }

            // cb is a new function in the red Realm that chains the call to the blueFn
            const redFunction = r.evaluate(`
                var myValue = 'red';
                0, function(cb) {
                    cb(42);
                    return myValue;
                };
            `);

            t.strictEqual(redFunction(blueFn), 'red');
            t.strictEqual(myValue, 42);
        });
    });
});
