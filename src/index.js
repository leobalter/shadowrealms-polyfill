/* eslint-disable no-inner-declarations */
{
    function WrappedFunctionCreate(callerRealm, connectedFn) {
        const GetWrappedValueForCallerRealm = value => GetWrappedValue(callerRealm, value);

        return function(...args) {
            return GetWrappedValueForCallerRealm(connectedFn(...args.map(GetWrappedValueForCallerRealm)));
        }
    }

    function GetWrappedValue(realm, value) {
        if (typeof value === 'function') {
            return WrappedFunctionCreate(realm, value);
        }

        if (IsPrimitive(value)) {
            return value;
        }

        // type is 'object';
        throw new TypeError('Cross-Realm Error, Evaluation result is not a primitive value');
    }

    function IsPrimitive(value) {
        return value == null || typeof value !== 'object';
    }

    class Realm {
        constructor() {
            this.#iframe = document.createElement('iframe');
            this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            this.#iframe.style.display = 'none';
            this.#Realm.attach();
        }

        #iframe = null;

        get #Realm() {
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

        #PerformRealmEval = (str) => {
            const result = this.#iframe.contentWindow.eval(str);
            return GetWrappedValue(this, result);
        };

        #ValidateRealmObject() {
            try {
                this.#Realm;
            } catch (error) {
                throw new TypeError('Invalid realm object');
            }
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
            this.#ValidateRealmObject();

            if (typeof sourceText !== 'string') {
                throw new TypeError('evaluate expects a string');
            }
            return this.#errorCatcher(() => this.#PerformRealmEval(sourceText));
        }

        // eslint-disable-next-line no-unused-vars
        importValue(specifier, exportName) {
            this.#ValidateRealmObject();

            throw new Error('importValue not yet supported');
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
            return 'Realm';
        },
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
