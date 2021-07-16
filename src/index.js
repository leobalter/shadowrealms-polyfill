{
    class Realm {
        constructor() {
            this.#iframe = document.createElement('iframe');
            this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            this.#iframe.style.display = 'none';
            this.#realm.attach();
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
            const result = this.#iframe.contentWindow.eval(str);

            return this.#getPrimitiveOrWrappedCallable(result);
        };

        #getPrimitiveOrWrappedCallable(value) {
            if (typeof value === 'function') {
                return this.#wrap(value);
            }

            if (this.#isPrimitive(value)) {
                return value;
            }

            // type is 'object';
            throw new TypeError('Cross-Realm Error, Evaluation result is not a primitive value');
        }

        #wrap(connectedFn) {
            const getPrimitiveOrWrappedCallable = this.#getPrimitiveOrWrappedCallable.bind(this);

            return function(...args) {
                const wrappedArgs = args.map(getPrimitiveOrWrappedCallable);

                return getPrimitiveOrWrappedCallable(connectedFn(...wrappedArgs));
            }
        }

        #isPrimitive(value) {
            return value == null || typeof value !== 'object';
        }

        evaluate(sourceText) {
            try {
                this.#realm;
            } catch (error) {
                throw new TypeError('Invalid realm object');
            }

            if (typeof sourceText !== 'string') {
                throw new TypeError('evaluate expects a string');
            }
            return this.#errorCatcher(() => this.#evaluateInRealm(sourceText));
        }

        // eslint-disable-next-line no-unused-vars
        importValue(specifier, exportName) {
            try {
                this.#realm;
            } catch (error) {
                throw new TypeError('Invalid realm object');
            }
            throw new Error('importValue not supported');
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
        enumerable: false,
        writable: true,
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