window.Realm = class {
    constructor() {
        const iframe = this.#iframe;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.style.display = 'none';

        document.body.appendChild(iframe);

        const { contentWindow } = iframe;
        this.#RedFunction = contentWindow.Function;
        this.#RedEval = contentWindow.eval;

        iframe.remove();

        this.#fakeIntrinsic;
    }

    #RedEval;
    #RedFunction;

    // #BlueFunction = Function;
    // #BlueAsyncFunction = (async function () {}).constructor;
    // #BluePromise = Promise;

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

    wrapperCallbackFunction(callback) {
        const res = (...args) => callback(...args);

        const wrapper = new this.#RedFunction('cb', 'function wrapper(...args) { return cb(...args); } return wrapper;');

        // TODO: set internal
        Object.defineProperty(res, this.#fakeIntrinsic.#WRAPPER, {
            value: Object.freeze(wrapper(res))
        });

        return Object.freeze(res);
    }

    static #WRAPPER = Symbol();
}
