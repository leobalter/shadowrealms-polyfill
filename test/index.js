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

    test('accepts callable objects', t => {
        t.strictEqual(typeof r.evaluate('function fn() {} fn'), 'function', 'value from a fn declaration');
        t.strictEqual(typeof r.evaluate('(function() {})'), 'function', 'function expression');
        t.strictEqual(typeof r.evaluate('(async function() {})'), 'function', 'async function expression');
        t.strictEqual(typeof r.evaluate('(function*() {})'), 'function', 'generator expression');
        t.strictEqual(typeof r.evaluate('(async function*() {})'), 'function', 'async generator expression');
        t.strictEqual(typeof r.evaluate('() => {}'), 'function', 'arrow function');
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

    test('Wrapped Function Create', t => {
        const wrapped = r.evaluate('x => y => x * y');
        const otherWrapped = wrapped(2);
        t.strictEqual(otherWrapped(3), 6);
    });

    test('Auto Wrapping 1', t => {
        const blueFunction = (x, y) => x + y;

        const redFunction = r.evaluate(`
        0, function(redFunctionArg, a, b, c) {
            return redFunctionArg(a, b) * c;
        }
        `);
        t.strictEqual(redFunction(blueFunction, 2, 3, 4), 20);
    });

    test('Auto Wrapping 2', t => {
        let myValue;

        function blueFunction(x) {
            globalThis.myValue = x;
        };

        // cb is a new function in the red Realm that chains the call to the blueFunction
        const redFunction = r.evaluate(`
            0, function(cb) {
                globalThis.myValue = "red";
                cb(42);
                return globalThis.myValue;
            }
        `);

        t.strictEqual(redFunction(blueFunction), 'red');
        t.strictEqual(myValue, 42);
    });
});