window.Realm = class {
    constructor() {
        const iframe = this.#iframe;
        document.body.appendChild(iframe);
        
        const { contentWindow } = iframe;
        this.#globalThis = contentWindow.globalThis;
        this.#Function = contentWindow.Function;
        this.#AsyncFunction = contentWindow.AsyncFunction;
        this.#eval = contentWindow.eval;

        this.#fakeIntrinsic = this.constructor;
    }

    #iframe = document.createElement('iframe');
    #eval;
    #globalThis;
    #Function;
    #AsyncFunction;
    #fakeIntrinsic;

    #isPrimitive(value) {
        return value === null || (typeof value !== 'function' && typeof value !== 'object');
    }

    eval(str) {
        var res = this.#errorCatcher(() => this.#eval(str));

        if (!this.#isPrimitive(res)) {
            throw new TypeError('Evaluation result is not a primitive value');
        }

        return res;
    }

    // TODO: remove exposure of globalThis
    get globalThis() {
        return this.#globalThis;
    };

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

    get Function() {
        const errorCatcher = this.#errorCatcher;
        const redFunction = this.#Function;
        const getPrimitives = this.#getPrimitives.bind(this);
        const isPrimitive = this.#isPrimitive;
        const wrapperSymbol = this.#fakeIntrinsic.#WRAPPER;

        const make = fn => (...args) => {
            const primArgs = getPrimitives(args, true).map(arg => {
                if (typeof arg === 'function' && arg[wrapperSymbol]) {
                    console.log('1.....', arg[wrapperSymbol].toString(), args);
                    return arg[wrapperSymbol];
                } else {
                    return arg;
                }
            });

            const res = fn(...primArgs);

            if (!isPrimitive(res)) {
                throw new TypeError('Cross-Realm Error: function is not a primitive value');
            }

            return res;
        };
        return function Function(...args) {
            let fn;
            const newTarget = new.target;
            const primArgs = getPrimitives(args);

            if (newTarget) {
                errorCatcher(() => fn = Reflect.construct(redFunction, primArgs, newTarget));
            } else {
                errorCatcher(() => fn = redFunction(...primArgs));
            }

            return make(fn);
        };
    }
    AsyncFunction(...args) {}

    wrapperCallbackFunction(callback) {
        const res = (...args) => callback(...args);
        
        const wrapper = new this.#globalThis.Function('cb', 'return function(...args) { return cb(...args); };');

        // TODO: set internal
        Object.defineProperty(res, this.#fakeIntrinsic.#WRAPPER, {
            value: wrapper(res)
        });
        
        return res;
    }

    static #WRAPPER = Symbol();
}