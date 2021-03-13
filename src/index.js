window.Realm = class {
    constructor() {
        const iframe = this.#iframe;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.style.display = 'none';

        document.body.appendChild(iframe);

        const { contentWindow } = iframe;
        this.#globalThis = contentWindow.globalThis;
        this.#RedFunction = contentWindow.Function;
        this.#RedEval = contentWindow.eval;
        this.#RedAsyncFunction = contentWindow.eval('(async function() {}).constructor');

        this.#fakeIntrinsic;
    }

    #RedEval;
    #globalThis;
    #RedFunction;
    #RedAsyncFunction;

    #BlueFunction = Function;
    #BlueAsyncFunction = (async function () {}).constructor;
    #BluePromise = Promise;

    #iframe = document.createElement('iframe');

    // This simulates the `%Realm%` preserved value
    #fakeIntrinsic = this.constructor;

    #isPrimitive(value) {
        return value === null || (typeof value !== 'function' && typeof value !== 'object');
    }

    eval(str) {
        var res = this.#errorCatcher(() => this.#RedEval(str));

        if (!this.#isPrimitive(res)) {
            throw new TypeError('Evaluation result is not a primitive value');
        }

        return res;
    }

    #errorCatcher(fn) {
        try {
            return fn();
        } catch(err) {
            if (err && typeof err === 'object') {
                throw new TypeError(`Cross-Realm Error: ${err.name}: ${err.message}`)
            } // Else
            throw new TypeError(`Cross-Realm Error: ${String(err)}`);
        }
    }

    // TODO: use a full toPrimitive helper
    #getPrimitives(args, skipWrappers) {
        return args.map(arg => {
            if (this.#isPrimitive(arg)) {
                return arg;
            } else if (skipWrappers && arg && arg[this.#fakeIntrinsic.#WRAPPER]) {
                // Skip if arg is a wrapped function
                return arg;
            } else if (arg[Symbol.toPrimitive]) {
                return arg[Symbol.toPrimitive]();
            } else {
                return String(arg);
            }
        });
    }

    #channelFunction(redFn) {
        const errorCatcher = this.#errorCatcher;
        const getPrimitives = this.#getPrimitives.bind(this);
        const isPrimitive = this.#isPrimitive;
        const wrapperSymbol = this.#fakeIntrinsic.#WRAPPER;

        return (...args) => {
            const primArgs = getPrimitives(args, true).map(arg => {
                if (typeof arg === 'function' && arg[wrapperSymbol]) {
                    return arg[wrapperSymbol];
                } else {
                    return arg;
                }
            });

            const res = errorCatcher(() => redFn(...primArgs));

            if (!isPrimitive(res)) {
                throw new TypeError('Cross-Realm Error: function is not a primitive value');
            }

            return res;
        };
    }

    #channelAsyncFunction(redFn) {
        const errorCatcher = this.#errorCatcher;
        const getPrimitives = this.#getPrimitives.bind(this);
        const isPrimitive = this.#isPrimitive;
        const wrapperSymbol = this.#fakeIntrinsic.#WRAPPER;

        return async (...args) => {
            const primArgs = getPrimitives(args, true).map(arg => {
                if (typeof arg === 'function' && arg[wrapperSymbol]) {
                    return arg[wrapperSymbol];
                } else {
                    return arg;
                }
            });

            // Needs to unwrap the promise from the other realm
            let res;

            try {
                res = await redFn(...primArgs);
            } catch (err) {
                // errorCatcher will handle the error without creating a new async function
                errorCatcher(() => { throw err; });
            }

            if (!isPrimitive(res)) {
                throw new TypeError('Cross-Realm Error: function is not a primitive value');
            }

            // TODO: res cannot be an object
            return res;
        };
    }

    get Function() {
        const errorCatcher = this.#errorCatcher;
        const getPrimitives = this.#getPrimitives.bind(this);
        const redFunction = this.#RedFunction;

        const channel = this.#channelFunction.bind(this);

        return function(...args) {
            let redFn;
            const newTarget = new.target;
            const primArgs = getPrimitives(args);

            if (newTarget) {
                // TODO: Should remove the newTarget to avoid identity leaking?
                redFn = errorCatcher(() => Reflect.construct(redFunction, primArgs, newTarget));
            } else {
                redFn = errorCatcher(() => redFunction(...primArgs));
            }

            return Object.freeze(channel(redFn));
        };
    }

    get AsyncFunction() {
        const errorCatcher = this.#errorCatcher;
        const getPrimitives = this.#getPrimitives.bind(this);
        const redAsyncFunction = this.#RedAsyncFunction;
        const channel = this.#channelAsyncFunction.bind(this);

        return function(...args) {
            let redFn;
            const primArgs = getPrimitives(args);

            redFn = errorCatcher(() => redAsyncFunction(...primArgs));

            return Object.freeze(channel(redFn));
        };
    }

    wrapperCallbackFunction(callback) {
        const res = (...args) => callback(...args);

        const wrapper = new this.#globalThis.Function('cb', 'function wrapper(...args) { return cb(...args); } return wrapper;');

        // TODO: set internal
        Object.defineProperty(res, this.#fakeIntrinsic.#WRAPPER, {
            value: Object.freeze(wrapper(res))
        });

        return Object.freeze(res);
    }

    // TODO: implement and test
    import(...args) {

        // It returns undefined intentionally
        const asyncFn = this.AsyncFunction('...args', 'await import(...args);');

        return asyncFn(...args);
    }

    static #WRAPPER = Symbol();
}
