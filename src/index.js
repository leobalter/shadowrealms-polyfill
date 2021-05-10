{

    // const wm = new WeakMap();
    class Realm {
        constructor() {
            this.#iframe = document.createElement('iframe');
            this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            this.#iframe.style.display = 'none';
        }

        #iframe = null;

        get #realm() {
            const attach = () => {
                document.body.parentElement.appendChild(this.#iframe);
                return this.#iframe.contentWindow;
            };
            const detach = () => {
                this.#iframe.remove();
            };
            return {
                attach,
                detach
            };
        }

        #evaluateInRealm = (str) => {
            const realm = this.#realm.attach();
            const result = realm.eval(str);
            this.#realm.detach();

            return this.#callableOrPrimitive(result);
        };

        #callableOrPrimitive(value) {
            if (typeof value === 'function') {
                return this.#wrapCallables(value);
            }

            if (this.#isPrimitive(value)) {
                return value;
            }

            throw new TypeError('Cross-Realm Error: Evaluation result is not a primitive value');
        }

        #wrapCallables(connectedFn) {
            const wrapper = this.#wrapCallables.bind(this);
            const callableOrPrimitive = this.#callableOrPrimitive.bind(this);

            return function(...args) {
                const wrappedArgs = Array.from(args, arg => wrapper(arg));

                const result = connectedFn(...wrappedArgs);

                return callableOrPrimitive(result);
            }
        }

        #isPrimitive(value) {
            return value == null || typeof value !== 'object';
        }

        evaluate(str) {
            if (typeof str !== 'string') {
                throw new TypeError('argument needs to be a string');
            }
            return this.#errorCatcher(() => this.#evaluateInRealm(str));
        }

        #errorCatcher(fn) {
            try {
                return fn();
            } catch (err) {
                if (err && typeof err === 'object') {
                    throw new TypeError(`Cross-Realm Error: ${err.name}: ${err.message}`)
                } // Else
                throw new TypeError(`Cross-Realm Error: ${String(err)}`);
            }
        }
    }

    Object.defineProperty(globalThis, 'Realm', {
        value: Realm,
        configurable: true,
        enumerable: true,
        writable: false,
    });

    Object.defineProperty(Realm.prototype, 'toString', {
        value() {
            return `[object Realm]`;
        },
        configurable: false,
        enumerable: false,
        writable: false,
    });
}