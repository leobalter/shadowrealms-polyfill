const { module, test } = QUnit;

module('Realm', () => {
    test('returns a new instance using a global Realm', t => {
        t.ok(new Realm);
    });
});

module('Realm#eval', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new Realm();
    });

    test('resolves to common primitive values', t => {

        t.strictEqual(r.eval('1 + 1'), 2);
        t.strictEqual(r.eval('null'), null);
        t.strictEqual(r.eval(''), undefined, 'undefined from empty completion');
        t.strictEqual(r.eval('undefined'), undefined);
        t.strictEqual(r.eval('true'), true);
        t.strictEqual(r.eval('false'), false);
        t.strictEqual(r.eval('function fn() {}'), undefined, 'fn declaration has empty completion'); 
        t.ok(Number.isNaN(r.eval('NaN')));
        t.strictEqual(r.eval('-0'), -0);
        t.strictEqual(r.eval('"str"'), 'str');
    });

    test('resolves to symbol values (primitives)', t => {
        const s = r.eval('Symbol()');

        t.strictEqual(typeof s, 'symbol');
        t.ok(Symbol.prototype.toString.call(s));

        t.strictEqual(s.constructor, Symbol, 'primitive does not expose other Realm constructor');
        t.strictEqual(Object.getPrototypeOf(s), Symbol.prototype, '__proto__ of s is from the blue realm');
    });

    test('throws a TypeError if eval resolves to object values', t => {
        t.throws(() => r.eval('({})'), TypeError, 'object literal');
        t.throws(() => r.eval(`
            ({
                [Symbol.toPrimitive]() { return 'string'; },
                toString() { return 'str'; },
                valueOf() { return 1; }
            });
        `), TypeError, 'object literal with immediate primitive coercion methods');
        t.throws(() => r.eval('Object.create(null)'), 'ordinary object with null __proto__');
        t.throws(() => r.eval('function fn() {} fn'), TypeError, 'value from a fn declaration');
        t.throws(() => r.eval('(function() {})'), TypeError, 'function expression');
        t.throws(() => r.eval('(async function() {})'), TypeError, 'async function expression');
        t.throws(() => r.eval('(function*() {})'), TypeError, 'generator expression');
        t.throws(() => r.eval('(async function*() {})'), TypeError, 'async generator expression');
        t.throws(() => r.eval('() => {}'), TypeError, 'arrow function');
    });

    test('Errors from the other realm is wrapped into a TypeError', t => {
        t.throws(() => r.eval('...'), TypeError, 'SyntaxError => TypeError'); // SyntaxError
        t.throws(() => r.eval('throw 42'), TypeError, 'throw primitive => TypeError');
        t.throws(() => r.eval('throw new ReferenceError("aaa")'), TypeError, 'custom ctor => TypeError');
        t.throws(() => r.eval('throw new TypeError("aaa")'), TypeError, 'RedTypeError => BlueTypeError');
    });
});

module('Realm#Function', ({ beforeEach }) => {
    let r;
    beforeEach(() => {
        r = new Realm();
    });

    test('creates a new function', t => {
        const fn = r.Function('x', 'return x * 3;');
        t.strictEqual(typeof fn, 'function');
        t.ok(fn instanceof Function);
        t.strictEqual(fn.constructor, Function);
        t.strictEqual(Object.getPrototypeOf(fn), Function.prototype);

        t.strictEqual(fn(2), 6);
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

    test('capture values from other realm', t => {
        r.eval('globalThis.__redValue = 42');
        const fn = new r.Function('return globalThis.__redValue;');
        t.strictEqual(fn(), 42);
        t.strictEqual(globalThis.__redValue, undefined);
    });

    test('symbol args will break', t => {
        t.throws(() => r.Function(Symbol()), TypeError);
        t.throws(() => new r.Function(Symbol()), TypeError);
    });

    test('toString coercion: params and body', t => {

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

    // TODO: review this
    test('toString coercion: non primitive args', t => {
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

    test('throws a typeerror if it returns an object', t => {
        const fn = r.Function('return {}');
        t.throws(() => fn(), TypeError);

        const fnArr = r.Function('return []');
        t.throws(() => fnArr(), TypeError);

        const fnFn = r.Function('return function() {}');
        t.throws(() => fnFn(), TypeError);
    });

    test('returns primitive values', t => {
        const fn = r.Function('x', 'return x');
        const values = [0, 1, false, true, 'string', Infinity, null, undefined, Symbol()];

        t.expect(values.length + 1);

        t.ok(Number.isNaN(fn(NaN)));

        values.forEach(value => {
            t.strictEqual(fn(value), value);
        });
    });

    test('Any error from the function execution is wrapped into a TypeError', t => {
        const redFn = r.Function('throw 42;');

        t.throws(() => redFn(), TypeError);
    });
});

module('Realm#AsyncFunction', ({ beforeEach }) => {

    // %AsyncFunction% is not exposed
    const AsyncFunction = (async function() {}).constructor;

    let r;
    beforeEach(() => {
        r = new Realm();
    });

    test('creates a new async function preserves identity', t => {
        const fn = r.AsyncFunction('x', 'return await x * 2;');
        t.strictEqual(typeof fn, 'function');
        t.ok(fn instanceof AsyncFunction);
        t.strictEqual(fn.constructor, AsyncFunction);
        t.strictEqual(Object.getPrototypeOf(fn), AsyncFunction.prototype);
    });

    test('using new target preserves identity', t => {
        const fn = new r.AsyncFunction('x', 'return await x * 2;');
        t.strictEqual(typeof fn, 'function');
        t.ok(fn instanceof AsyncFunction);
        t.strictEqual(fn.constructor, AsyncFunction);
        t.strictEqual(Object.getPrototypeOf(fn), AsyncFunction.prototype);
    });

    test('noop', async t => {
        let fn;

        fn = r.AsyncFunction();
        t.strictEqual(await fn(), undefined);

        fn = r.AsyncFunction('');
        t.strictEqual(await fn(), undefined);

        fn = r.AsyncFunction('', '');
        t.strictEqual(await fn(), undefined);

        fn = r.AsyncFunction('2');
        t.strictEqual(await fn(), undefined);
    });

    test('symbol args cannot be coerced to strings', t => {
        t.throws(() => r.AsyncFunction(Symbol()), TypeError);
        t.throws(() => new r.AsyncFunction(Symbol()), TypeError);
    });

    test('toString coercion: params and body', async t => {

        t.throws(() => r.AsyncFunction({}), TypeError);
        t.throws(() => new r.AsyncFunction({}), TypeError);

        const fn = r.AsyncFunction(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
        let p = fn(2, 3);
        t.strictEqual(Promise.resolve(p), p);
        t.strictEqual(await p, 5, 'array coerced to string x,y, #1');

        const nfn = new r.AsyncFunction(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
        p = nfn(2, 3);
        t.strictEqual(Promise.resolve(p), p);
        t.strictEqual(await p, 5, 'array coerced to string x,y, #2');

        const arg1 = ['x'];
        const body = { toString() { return 'return x * 2;' }};

        const coerced = r.AsyncFunction(arg1, body);
        t.strictEqual(await coerced(5), 10);
    });

    test('toString coercion: non primitive args', async t => {
        const checkTypes = r.AsyncFunction('...args', `
            const res = args.filter(arg => typeof arg === 'string');
            return res.length === args.length;
        `);
        t.ok(
            await checkTypes(
                {}, {toString() { return 'a'; }}, []
            )
        );

        function noop() { /* lol */ }
        function asyncNoop() { /* I'm coerced into a string */ }
        function generatorNoop() { return 42; }
        function asyncGeneratorNoop() {}
        const arrowNoop = () => {};

        t.ok(
            await checkTypes(
                noop, asyncNoop, generatorNoop, asyncGeneratorNoop, arrowNoop
            )
        );
    });

    test('throws a typeerror if it returns an object', async t => {
        const expected = Symbol('expected');

        const fn = r.AsyncFunction('return {}');
        const catchErr = err => (err.constructor === TypeError) && expected;

        let res;

        res = await fn().catch(catchErr);
        t.equal(res, expected);

        const fnArr = r.AsyncFunction('return []');
        res = await fnArr().catch(catchErr);
        t.equal(res, expected);

        const fnFn = r.AsyncFunction('return function() {}');
        res = await fnFn().catch(catchErr);
        t.equal(res, expected);
    });

    test('returns primitive values', async t => {
        const fn = r.AsyncFunction('x', 'return x');
        const values = [0, 1, false, true, 'string', Infinity, null, undefined, Symbol()];

        t.expect(values.length + 1);

        t.ok(Number.isNaN(await fn(NaN)));

        values.map(async value => {
            t.strictEqual(await fn(value), value);
        });
    });

    test('Any rejection is wrapped into a TypeError', async t => {
        const redFn = r.AsyncFunction('throw 42;');

        const p = redFn();

        let err;
        await p.catch(e => err = e);

        t.strictEqual(err.constructor, TypeError);
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
    });

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

        test.skip('identity is not leaked', t => {
            const redFn = otherRealm.Function('cb', 'return cb instanceof Function;');
            t.ok(redFn(wrappedFn), '#1');

            const otherWrappedFn = otherRealm.wrapperCallbackFunction(() => wrappedFn);

            const fn = otherRealm.Function('cb', 'return cb() instanceof Function');

            t.ok(fn(otherWrappedFn), '#1');
        });
    });
});
