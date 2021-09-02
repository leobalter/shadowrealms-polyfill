const { module, test } = QUnit;

module('ShadowRealm', () => {
    test('returns a new instance using a global ShadowRealm', assert => {
        assert.ok(new ShadowRealm);
    });
});

module('ShadowRealm#evaluate', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new ShadowRealm();
    });

    test('only accepts string arguments', assert => {
        assert.throws(
            () => {
                r.evaluate(['1+1']);
            },
            TypeError,
            'object with toString'
        );

        assert.throws(
            () => {
                r.evaluate({ [Symbol.toPrimitive]() { return '1+1'; }});
            },
            TypeError,
            'object with @@toPrimitive'
        );

        assert.throws(
            () => {
                r.evaluate(1);
            },
            TypeError,
            'number'
        );

        assert.throws(
            () => {
                r.evaluate(Symbol());
            },
            TypeError,
            'symbol'
        );

        assert.throws(
            () => {
                r.evaluate(null);
            },
            TypeError,
            'null'
        );

        assert.throws(
            () => {
                r.evaluate(undefined);
            },
            TypeError,
            'undefined'
        );

        assert.throws(
            () => {
                r.evaluate(true);
            },
            TypeError,
            'true'
        );

        assert.throws(
            () => {
                r.evaluate(false);
            },
            TypeError,
            'false'
        );
    });

    test('resolves to common primitive values', assert => {
        assert.strictEqual(r.evaluate('1 + 1'), 2);
        assert.strictEqual(r.evaluate('null'), null);
        assert.strictEqual(r.evaluate(''), undefined, 'undefined from empty completion');
        assert.strictEqual(r.evaluate('undefined'), undefined);
        assert.strictEqual(r.evaluate('true'), true);
        assert.strictEqual(r.evaluate('false'), false);
        assert.strictEqual(r.evaluate('function fn() {}'), undefined, 'fn declaration has empty completion');
        assert.ok(Number.isNaN(r.evaluate('NaN')));
        assert.strictEqual(r.evaluate('-0'), -0);
        assert.strictEqual(r.evaluate('"str"'), 'str');
    });

    test('resolves to symbol values (primitives)', assert => {
        const s = r.evaluate('Symbol()');

        assert.strictEqual(typeof s, 'symbol');
        assert.ok(Symbol.prototype.toString.call(s));
        assert.strictEqual(s.constructor, Symbol, 'primitive does not expose other ShadowRealm constructor');
        assert.strictEqual(Object.getPrototypeOf(s), Symbol.prototype, '__proto__ of s is from the blue ShadowRealm');
        assert.strictEqual(r.evaluate('Symbol.for("x")'), Symbol.for('x'));
    });

    test('throws a TypeError if evaluate resolves to object values', assert => {
        assert.throws(() => r.evaluate('globalThis'), TypeError, 'globalThis');
        assert.throws(() => r.evaluate('[]'), TypeError, 'array literal');
        assert.throws(() => r.evaluate(`
            ({
                [Symbol.toPrimitive]() { return 'string'; },
                toString() { return 'str'; },
                valueOf() { return 1; }
            });
        `), TypeError, 'object literal with immediate primitive coercion methods');
        assert.throws(() => r.evaluate('Object.create(null)'), 'ordinary object with null __proto__');
    });

    test('Errors from the other ShadowRealm is wrapped into a TypeError', assert => {
        assert.throws(() => r.evaluate('...'), TypeError, 'SyntaxError => TypeError'); // SyntaxError
        assert.throws(() => r.evaluate('throw 42'), TypeError, 'throw primitive => TypeError');
        assert.throws(() => r.evaluate('throw new ReferenceError("aaa")'), TypeError, 'custom ctor => TypeError');
        assert.throws(() => r.evaluate('throw new TypeError("aaa")'), TypeError, 'RedTypeError => BlueTypeError');
    });

    module('wrapped functions', () => {
        test('accepts callable objects', assert => {
            assert.strictEqual(typeof r.evaluate('function fn() {} fn'), 'function', 'value from a fn declaration');
            assert.strictEqual(typeof r.evaluate('(function() {})'), 'function', 'function expression');
            assert.strictEqual(typeof r.evaluate('(async function() {})'), 'function', 'async function expression');
            assert.strictEqual(typeof r.evaluate('(function*() {})'), 'function', 'generator expression');
            assert.strictEqual(typeof r.evaluate('(async function*() {})'), 'function', 'async generator expression');
            assert.strictEqual(typeof r.evaluate('() => {}'), 'function', 'arrow function');
        });

        test('wrapped functions share no properties', assert => {
            const wrapped = r.evaluate(`
                function fn() {
                    return fn.secret;
                }

                fn.secret = 'confidential';
                fn;
            `);

            assert.strictEqual(wrapped.secret, undefined);
            assert.strictEqual(wrapped(), 'confidential');
        });

        test('wrapped functions share no properties, extended', assert => {
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
            assert.strictEqual(typeof wrappedOrdinary, 'function', 'ordinary function wrapped');
            assert.strictEqual(wrappedOrdinary(), 42, 'ordinary, return');
            assert.strictEqual(wrappedOrdinary.x, undefined, 'ordinary, no property shared');

            const wrappedArrow = r.evaluate('arrow');
            assert.strictEqual(typeof wrappedArrow, 'function', 'arrow function wrapped');
            assert.strictEqual(wrappedArrow(7), 14, 'arrow function, return');
            assert.strictEqual(wrappedArrow.x, undefined, 'arrow function, no property');

            const wrappedProxied = r.evaluate('pFn');
            assert.strictEqual(typeof wrappedProxied, 'function', 'proxied ordinary function wrapped');
            assert.strictEqual(r.evaluate('pFn.used'), undefined, 'pFn not called yet');
            assert.strictEqual(wrappedProxied(), 39, 'return of the proxied callable');
            assert.strictEqual(r.evaluate('pFn.used'), 1, 'pfn called');
            assert.strictEqual(wrappedProxied.x, undefined, 'proxy callable, no property');

            const wrappedAsync = r.evaluate('aFn');
            assert.strictEqual(typeof wrappedAsync, 'function', 'async function wrapped');
            assert.throws(() => wrappedAsync(), TypeError, 'wrapped function cannot return non callable object');
            assert.strictEqual(wrappedAsync.x, undefined, 'async fn, no property');

            const wrappedGenerator = r.evaluate('genFn');
            assert.strictEqual(typeof wrappedGenerator, 'function', 'gen function wrapped');
            assert.throws(() => wrappedGenerator(), TypeError, 'wrapped function cannot return non callable object');
            assert.strictEqual(wrappedGenerator.x, undefined, 'generator, no property');
        });

        test('new wrapping on each evaluation', assert => {
            r.evaluate(`
                function fn() {
                    return 42;
                }
            `);

            const wrapped = r.evaluate('fn');
            const otherWrapped = r.evaluate('fn');

            assert.notStrictEqual(wrapped, otherWrapped);
            assert.strictEqual(typeof wrapped, 'function');
            assert.strictEqual(typeof otherWrapped, 'function');
        });

        test('wrapped functions can resolve callable returns', assert => {
            const wrapped = r.evaluate('x => y => x * y');
            const nestedWrapped = wrapped(2);
            const otherNestedWrapped = wrapped(4);

            assert.strictEqual(otherNestedWrapped(3), 12);
            assert.strictEqual(nestedWrapped(3), 6);

            assert.notStrictEqual(nestedWrapped, otherNestedWrapped, 'new wrapping for each return');
        });

        test('wrapped function from return values share no identity', assert => {
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
            assert.strictEqual(typeof wrappedOrdinary, 'function', 'ordinary function wrapped');
            assert.strictEqual(wrappedOrdinary(), 42, 'ordinary, return');
            assert.strictEqual(wrappedOrdinary.x, undefined, 'ordinary, no property shared');

            const wrappedArrow = r.evaluate('() => arrow')();
            assert.strictEqual(typeof wrappedArrow, 'function', 'arrow function wrapped');
            assert.strictEqual(wrappedArrow(7), 14, 'arrow function, return');
            assert.strictEqual(wrappedArrow.x, undefined, 'arrow function, no property');

            const wrappedProxied = r.evaluate('() => pFn')();
            assert.strictEqual(typeof wrappedProxied, 'function', 'proxied ordinary function wrapped');
            assert.strictEqual(r.evaluate('pFn.used'), undefined, 'pFn not called yet');
            assert.strictEqual(wrappedProxied(), 39, 'return of the proxied callable');
            assert.strictEqual(r.evaluate('pFn.used'), 1, 'pfn called');
            assert.strictEqual(wrappedProxied.x, undefined, 'proxy callable, no property');

            const wrappedAsync = r.evaluate('() => aFn')();
            assert.strictEqual(typeof wrappedAsync, 'function', 'async function wrapped');
            assert.throws(() => wrappedAsync(), TypeError, 'wrapped function cannot return non callable object');
            assert.strictEqual(wrappedAsync.x, undefined, 'async fn, no property');

            const wrappedGenerator = r.evaluate('() => genFn')();
            assert.strictEqual(typeof wrappedGenerator, 'function', 'gen function wrapped');
            assert.throws(() => wrappedGenerator(), TypeError, 'wrapped function cannot return non callable object');
            assert.strictEqual(wrappedGenerator.x, undefined, 'generator, no property');
        });

        test('arguments are wrapped into the inner ShadowRealm', assert => {
            const blueFn = (x, y) => x + y;

            const redWrappedFn = r.evaluate(`
            0, function(blueWrappedFn, a, b, c) {
                return blueWrappedFn(a, b) * c;
            }
            `);
            assert.strictEqual(redWrappedFn(blueFn, 2, 3, 4), 20);
        });

        test('arguments are wrapped into the inner ShadowRealm, extended', assert => {
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
            assert.strictEqual(redWrappedFn(blueFn, blueFn, redWrappedFn), true);
        });

        test('Wrapped function observing their scopes', assert => {
            let myValue;

            function blueFn(x) {
                myValue = x;
                return myValue;
            }

            // cb is a new function in the red ShadowRealm that chains the call to the blueFn
            const redFunction = r.evaluate(`
                var myValue = 'red';
                0, function(cb) {
                    cb(42);
                    return myValue;
                };
            `);

            assert.strictEqual(redFunction(blueFn), 'red');
            assert.strictEqual(myValue, 42);
        });
    });
});


module('ShadowRealm#importValue', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new ShadowRealm();
    });

    // eslint-disable-next-line qunit/resolve-async
    test('can import a primitive', assert => {
        const done = assert.async();
        Promise.all([
            r.importValue(`../test/browser/module.js`, 'x'),
            r.importValue(`../test/browser/module.js`, 'x')
        ]).then(imports => {
            assert.strictEqual(imports[0], imports[1]);
            assert.strictEqual(imports[0], 1);
        }).then(done, done);
    });

    // eslint-disable-next-line qunit/resolve-async
    test('can import a function', assert => {
        const done = assert.async();
        Promise.all([
            r.importValue(`../test/browser/module.js`, 'foo'),
            r.importValue(`../test/browser/module.js`, 'foo')
        ]).then(imports => {
            assert.strictEqual(imports[0], imports[1]);
            assert.strictEqual(imports[0](), 'foo');
        }).then(done, done);
    });

    // eslint-disable-next-line qunit/resolve-async
    test('can import a class', assert => {
        const done = assert.async();
        Promise.all([
            r.importValue(`../test/browser/module.js`, 'Bar'),
            r.importValue(`../test/browser/module.js`, 'Bar')
        ]).then(imports => {
            assert.strictEqual(imports[0], imports[1]);
            assert.strictEqual(imports[0].name, 'Bar');
            assert.strictEqual(imports[1].name, 'Bar');
            assert.strictEqual(new (imports[0])() instanceof imports[1], true);
            assert.strictEqual(new (imports[1])() instanceof imports[0], true);
        }).then(done, done);
    });

    // eslint-disable-next-line qunit/resolve-async
    test('can import a default export', assert => {
        const done = assert.async();
        Promise.all([
            r.importValue(`../test/browser/module.js`, 'default'),
            r.importValue(`../test/browser/module.js`, 'default')
        ]).then(imports => {
            assert.strictEqual(imports[0], imports[1]);
            assert.strictEqual(imports[0].name, 'Spaz');
            assert.strictEqual(imports[1].name, 'Spaz');
            assert.strictEqual(new (imports[0])() instanceof imports[1], true);
            assert.strictEqual(new (imports[1])() instanceof imports[0], true);
        }).then(done, done);
    });
});
