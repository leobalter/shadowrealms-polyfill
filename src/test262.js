/* eslint-disable no-undef */
{
    class Realm {
        constructor() {
            if (!$262 || !$262.createRealm) {
                throw new Error("Cross-Realm Error: Realm creation not supported");
            }
            this.#realm = $262.createRealm();
        }

        #realm = null;

        #evaluateInRealm = (str) => {
            const result = this.#realm.evalScript(str);

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

        evaluate(sourceText) {
            const string = String(sourceText);
            return this.#errorCatcher(() => this.#evaluateInRealm(string));
        }

        // eslint-disable-next-line no-unused-vars
        async importValue(specifier, exportName) {
            throw new Error('Cross-Realm Error: importValue not supported');
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
