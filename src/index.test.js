const { expectCt } = require('helmet');
const { TestScheduler } = require('jest');

require('./index');

test('returns a new instance using a global Realm', () => {
    expect(() => {new Realm}).not.toThrow();
});

describe('Realm#eval', () => {
    let r;
    beforeEach(() => {
        r = new Realm();
    })

    describe('resolves only to primitives', () => {
        test('common', () => {
            expect(r.eval('1 + 1')).toBe(2);
            expect(r.eval('null')).toBe(null);
            expect(r.eval('undefined')).toBe(undefined);
            expect(r.eval('')).toBe(undefined);
            expect(r.eval('function fn() {}')).toBe(undefined); // fn declaration has empty completion
            expect(r.eval('NaN')).toBe(NaN);
            expect(r.eval('-0')).toBe(-0);
            expect(r.eval('"str"')).toBe('str');
        });

        test('symbol', () => {
            var s = r.eval('Symbol()');

            expect(() => Symbol.prototype.toString.call(s)).not.toThrow();

            // primitive does not expose other Realm constructor
            expect(s.constructor).toBe(Symbol);
            expect(Object.getPrototypeOf(s)).toBe(Symbol.prototype);

            // TODO: Remove this along with r.globalThis
            expect(s.constructor).not.toBe(r.globalThis.Symbol);
        });

        test('objects', () => {
            expect(() => r.eval('({})')).toThrow(TypeError);
            expect(() => r.eval('function fn() {} fn')).toThrow(TypeError); // Nit pick: adding a ; before fn would be a separate statement, lol
            expect(() => r.eval('(function() {})')).toThrow(TypeError);
        });
    });

    describe('wraps errors', () => {
        test('Any error from the other realm is wrapped into a TypeError', () => {
            expect(() => r.eval('...')).toThrow(TypeError); // SyntaxError
            expect(() => r.eval('throw 42')).toThrow(TypeError);
            expect(() => r.eval('throw new ReferenceError("aaa")')).toThrow(TypeError);
        });
    });
});

describe('Realm#Function', () => {
    let r;
    beforeEach(() => {
        r = new Realm();
    })

    test('creates a new function', () => {
        const fn = r.Function('x', 'return x * 2;');
        expect(typeof fn).toBe('function');
        expect(fn).toBeInstanceOf(Function);
        expect(fn.constructor).toBe(Function);
        expect(Object.getPrototypeOf(fn)).toBe(Function.prototype);
    });
    
    test('new Function', () => {
        const fn = new r.Function('x', 'return x * 2;');
        
        expect(typeof fn).toBe('function');
        expect(fn).toBeInstanceOf(Function);
        expect(fn.constructor).toBe(Function);
        expect(Object.getPrototypeOf(fn)).toBe(Function.prototype);
        
        expect(fn(2)).toBe(4);
    });

    test('noop', () => {
        const fn = r.Function();
        expect(() => fn()).not.toThrow();
    });

    test('symbol args will break', () => {
        expect(() => r.Function(Symbol())).toThrow(TypeError);
        expect(() => new r.Function(Symbol())).toThrow(TypeError);
    });

    describe('toString coercion', () => {
        test('params and body', () => {

            expect(() => r.Function({})).toThrow(TypeError);
            expect(() => new r.Function({})).toThrow(TypeError);
            
            const fn = r.Function(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
            expect(fn(2, 3)).toBe(5);
            
            const nfn = new r.Function(['x', 'y'], 'return x + y;'); // Follows Function quirk behavior
            expect(nfn(2, 3)).toBe(5);
            
            const arg1 = ['x'];
            const body = { toString() { return 'return x * 2;' }};
            
            const coerced = r.Function(arg1, body);
            expect(coerced(5)).toBe(10);
        });

        test('non primitive args are coerced', () => {
            const checkTypes = r.Function('...args', `
                const res = args.filter(arg => typeof arg === 'string');
                return res.length === args.length;
            `);
            expect(checkTypes({}, {toString() {return 'a';}}, [])).toBeTruthy();

            function noop() { /* lol */ }
            function asyncNoop() { /* I'm coerced into a string */ }
            function generatorNoop() { return 42; }
            function asyncGeneratorNoop() {}
            const arrowNoop = () => {};

            expect(checkTypes(noop, asyncNoop, generatorNoop, asyncGeneratorNoop, arrowNoop)).toBeTruthy();
        });

    });

    describe('function can only return primitives', () => {
        test('returns object', () => {
            const fn = r.Function('return {}');
            expect(() => fn()).toThrow(TypeError);

            const fnArr = r.Function('return []');
            expect(() => fnArr()).toThrow(TypeError);
            
            const fnFn = r.Function('return function() {}');
            expect(() => fnFn()).toThrow(TypeError);
        });

        test('returns primitive', () => {
            const fn = r.Function('x', 'return x');
            const values = [0, 1, false, true, 'string', NaN, Infinity, null, undefined, Symbol()];

            expect.assertions(values.length);
            
            values.forEach(value => {
                expect(fn(value)).toBe(value);
            });
        });
    });

    describe('wraps errors', () => {
        test('Any error from the function execution is wrapped into a TypeError', () => {
            const redFn = r.Function('throw 42;');

            expect(() => redFn()).toThrow(TypeError);
        });
    });
});

describe('Realm#wrapperCallbackFunction', () => {
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

    test('returns a new function that eventually calls the given callback', () => {
        let called = 0;
        const fn = r.wrapperCallbackFunction(() => { return called += 1; });

        expect(typeof fn).toBe('function');

        const res = fn();
        expect(called).toBe(1);
        expect(res).toBe(1);
    });

    test('takes arguments', () => {
        const fn = r.wrapperCallbackFunction((x) => { return x * 2; });

        const res = fn(21);
        expect(res).toBe(42);
    });

    describe('can be used as argument of a realm function', () => {
        let called, fn;
        beforeEach(() => {
            called = 0;
            fn = r.wrapperCallbackFunction((x, y) => {
                called += 1;
                return x * y;
            });
        });

        test('typeof', () => {
            const redFn = r.Function('cb', 'return typeof cb;');

            const res = redFn(fn);

            expect(res).toBe('function');
        });

        test('incubator realm is not leaked', () => {
            const redFn = r.Function('cb', 'console.log(cb.toString()); return cb instanceof Function;');
            const res = redFn(fn);
            expect(res).toBeTruphy();
        });

        test('incubator realm is not leaked #2', () => {
            const redFn = r.Function('cb', 'return Object.getPrototypeOf(cb) === Function.prototype');
            const res = redFn(fn);
            expect(res).toBeTruphy();
        });

        test('return value', () => {
            const redFn = r.Function('cb', 'return cb(20, 2) + 2;');

            const res = redFn(fn);

            expect(res).toBe(42);
            expect(called).toBe(1);
        });
    });

    describe('can be used as argument of another realm function', () => {

    });

    // test('')
});
