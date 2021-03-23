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

    test('returned function is frozen', t => {
        const fn = r.Function();

        t.ok(Object.isFrozen(fn));
        t.notOk(Object.isExtensible(fn));
        t.ok(Object.isSealed(fn));
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
    // In the current behavior, all args are coerced to primitive before sending to the red function
    // Should it just throw with non primitive values?
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
