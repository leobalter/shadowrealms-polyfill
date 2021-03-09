const { module, test } = QUnit;

test('returns a new instance using a global Realm', t => {
    t.ok(new Realm);
});

module('Realm#eval', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new Realm();
    })

    module('resolves only to primitives', () => {
        test('common', t => {

            t.strictEqual(r.eval('1 + 1'), 2);
            t.strictEqual(r.eval('null'), null);
            t.strictEqual(r.eval('undefined'), undefined);
            t.strictEqual(r.eval(''), undefined);
            t.strictEqual(r.eval('function fn() {}'), undefined, 'fn declaration has empty completion'); 
            t.ok(Number.isNaN(r.eval('NaN')));
            t.strictEqual(r.eval('-0'), -0);
            t.strictEqual(r.eval('"str"'), 'str');
        });

        test('symbol', t => {
            var s = r.eval('Symbol()');

            t.strictEqual(typeof s, 'symbol');
            t.ok(Symbol.prototype.toString.call(s));

            t.strictEqual(s.constructor, Symbol, 'primitive does not expose other Realm constructor');
            t.strictEqual(Object.getPrototypeOf(s), Symbol.prototype, '__proto__ of s is from the blue realm');
        });

        test('objects', t => {
            t.throws()
            t.throws(() => r.eval('({})'), TypeError, 'object literal');
            t.throws(() => r.eval('function fn() {} fn'), TypeError, 'value from a fn declaration');
            t.throws(() => r.eval('(function() {})'), TypeError, 'function expression');
        });
    });

    module('wraps errors', () => {
        test('Any error from the other realm is wrapped into a TypeError', t => {
            t.throws(() => r.eval('...'), TypeError, 'SyntaxError => TypeError'); // SyntaxError
            t.throws(() => r.eval('throw 42'), TypeError, 'throw primitive => TypeError');
            t.throws(() => r.eval('throw new ReferenceError("aaa")'), TypeError, 'custom ctor => TypeError');
        });
    });
});

module('Realm#Function', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new Realm();
    })

    test('creates a new function', t => {
        const fn = r.Function('x', 'return x * 2;');
        t.strictEqual(typeof fn, 'function');
        t.ok(fn instanceof Function);
        t.strictEqual(fn.constructor, Function);
        t.strictEqual(Object.getPrototypeOf(fn), Function.prototype);
    });
    
    test('new Function', t => {
        const fn = new r.Function('x', 'return x * 2;');
        
        t.strictEqual(typeof fn, 'function');
        t.ok(fn instanceof Function);
        t.strictEqual(fn.constructor, Function);
        t.strictEqual(Object.getPrototypeOf(fn), Function.prototype);
        
        t.strictEqual(fn(2), 4);
    });

    test('noop', t => {
        const fn = r.Function();
        t.strictEqual(fn(), undefined);
    });

    test('symbol args will break', t => {
        t.throws(() => r.Function(Symbol()), TypeError);
        t.throws(() => new r.Function(Symbol()), TypeError);
    });

    module('toString coercion', () => {
        test('params and body', t => {

            t.throws(() => r.Function({}), TypeError);
            t.throws(() => new r.Function({}), TypeError);
            
            const fn = r.Function(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
            t.strictEqual(fn(2, 3), 5);
            
            const nfn = new r.Function(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
            t.strictEqual(nfn(2, 3), 5);
            
            const arg1 = ['x'];
            const body = { toString() { return 'return x * 2;' }};
            
            const coerced = r.Function(arg1, body);
            t.strictEqual(coerced(5), 10);
        });

        test('non primitive args are coerced', t => {
            const checkTypes = r.Function('...args', `
                const res = args.filter(arg => typeof arg === 'string');
                return res.length === args.length;
            `);
            t.ok(checkTypes({}, {toString() {return 'a';}}, []));

            function noop() { /* lol */ }
            function asyncNoop() { /* I'm coerced into a string */ }
            function generatorNoop() { return 42; }
            function asyncGeneratorNoop() {}
            const arrowNoop = () => {};

            t.ok(checkTypes(noop, asyncNoop, generatorNoop, asyncGeneratorNoop, arrowNoop));
        });

    });

    module('function can only return primitives', () => {
        test('returns object', t => {
            const fn = r.Function('return {}');
            t.throws(() => fn(), TypeError);

            const fnArr = r.Function('return []');
            t.throws(() => fnArr(), TypeError);
            
            const fnFn = r.Function('return function() {}');
            t.throws(() => fnFn(), TypeError);
        });

        test('returns primitive', t => {
            const fn = r.Function('x', 'return x');
            const values = [0, 1, false, true, 'string', Infinity, null, undefined, Symbol()];

            t.expect(values.length + 1);

            t.ok(Number.isNaN(fn(NaN)));
            
            values.forEach(value => {
                t.strictEqual(fn(value), value);
            });
        });
    });

    module('wraps errors', () => {
        test('Any error from the function execution is wrapped into a TypeError', t => {
            const redFn = r.Function('throw 42;');

            t.throws(() => redFn(), TypeError);
        });
    });
});

module('Realm#wrapperCallbackFunction', ({ beforeEach }) => {
    /***
     * const fn = r.wrapperCallbackFunction(function (a, b, c) {
     *     return a + b + c;
     * });
     * 
     * const redFn = r.Function('callback', `
     *     callback.toString(); // native
     *     return callback(1, 2, 3);
     * `);
     * 
     * redFn(fn); // yield 6
     */

    let r;
    beforeEach(() => {
        r = new Realm();
    })

    test('returns a new function that eventually calls the given callback', t => {
        let called = 0;
        const fn = r.wrapperCallbackFunction(() => { return called += 1; });

        t.strictEqual(typeof fn, 'function');

        const res = fn();
        t.strictEqual(called, 1);
        t.strictEqual(res, 1);
    });

    test('takes arguments', t => {
        const fn = r.wrapperCallbackFunction((x) => { return x * 2; });

        const res = fn(21);
        t.strictEqual(res, 42);
    });

    module('can be used as argument of a realm function', ({ beforeEach }) => {
        let called, fn;
        beforeEach(() => {
            called = 0;
            fn = r.wrapperCallbackFunction((x, y) => {
                called += 1;
                return x * y;
            });
        });

        test('typeof', t => {
            const redFn = r.Function('cb', 'return typeof cb;');

            const res = redFn(fn);

            t.strictEqual(res, 'function');
        });

        test('return value', t => {
            const redFn = r.Function('cb', 'return cb(20, 2) + 2;');

            const res = redFn(fn);

            t.strictEqual(res, 42);
            t.strictEqual(called, 1);
        });

        test('incubator realm is not leaked', t => {
            const redFn = r.Function('cb', 'return cb instanceof Function;');
            const res = redFn(fn);
            t.ok(res);
        });

        test('incubator realm is not leaked #2', t => {
            const redFn = r.Function('cb', 'return Object.getPrototypeOf(cb) === Function.prototype');
            const res = redFn(fn);
            t.ok(res);
        });
    });

    module('multiple realms', ({ beforeEach }) => {
        let wrappedFn, otherRealm;
        
        beforeEach(() => {
            wrappedFn = r.wrapperCallbackFunction((x, y) => x * y);
            otherRealm = new Realm();
        });

        test('wrapped function is executed in another realm', t => {
            const redFn = otherRealm.Function('cb', 'return cb(7, 11);');
            t.strictEqual(redFn(wrappedFn), 77);

            const otherWrappedFn = otherRealm.wrapperCallbackFunction(() => wrappedFn);

            const fn = otherRealm.Function('cb', 'return cb()(4, 9)');

            t.strictEqual(fn(otherWrappedFn), 36);
        });

        test('realm identity is not leaked', t => {
            const redFn = otherRealm.Function('cb', 'return cb instanceof Function;');
            t.ok(redFn(wrappedFn));

            const otherWrappedFn = otherRealm.wrapperCallbackFunction(() => wrappedFn);

            const fn = otherRealm.Function('cb', 'return cb() instanceof Function');

            t.ok(fn(otherWrappedFn));
        });
    });

    // test('')
});
