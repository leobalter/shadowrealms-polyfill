/* eslint-disable no-undef */
{
    class Realm {
        constructor() {
            if (!$262 || !$262.createRealm) {
                throw new Error('Cross-Realm Error: Realm creation not supported');
            }
            this.#realm = $262.createRealm();
        }

        #moduleCache = {__proto__: null};
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

        #exportGetter(specifierString, exportNameString) {
            if (!Object.prototype.hasOwnProperty.call(this.#moduleCache[specifierString], exportNameString)) {
                throw new TypeError(`${specifierString} has no export named ${exportNameString}`);
            }
            return this.#moduleCache[specifierString][exportNameString];
        }
        // eslint-disable-next-line no-unused-vars
        importValue(specifier, exportName) {
            try {
                this.#realm;
            } catch (error) {
                throw new TypeError('Invalid realm object');
            }

            let specifierString = String(specifier);
            let exportNameString = String(exportName);

            if (this.#moduleCache[specifierString]) {
                return Promise.resolve(this.#exportGetter(specifierString, exportNameString));
            }

            return import(specifierString).then(module => {
                this.#moduleCache[specifierString] = module;
                return this.#exportGetter(specifierString, exportNameString);
            });
        }
    }

    Object.defineProperty(globalThis, 'Realm', {
        value: Realm,
        configurable: true,
        enumerable: false,
        writable: true,
    });

    Object.defineProperty(Realm.prototype, '@@toStringTag', {
        value() {
            return `Realm`;
        },
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
