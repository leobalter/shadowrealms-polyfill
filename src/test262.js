/* eslint-disable no-undef */
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

        if (IsPrimitiveOrCallable(value)) {
            return value;
        }

        // type is 'object';
        throw new TypeError('Cross-Realm Error, Evaluation result is not a primitive value');
    }

    function IsPrimitiveOrCallable(value) {
        return value == null || typeof value !== 'object';
    }

    class Realm {
        constructor() {
            if (!$262 || !$262.createRealm) {
                throw new Error('Cross-Realm Error: Realm creation not supported');
            }
            this.#Realm = $262.createRealm();
        }

        #moduleCache = {__proto__: null};
        #Realm = null;

        #PerformRealmEval = (str) => {
            const result = this.#Realm.evalScript(str);

            return GetWrappedValue(this, result);
        };

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

        #ValidateRealmObject() {
            try {
                this.#Realm;
            } catch (error) {
                throw new TypeError('Invalid realm object');
            }
        }

        evaluate(sourceText) {
            this.#ValidateRealmObject();

            if (typeof sourceText !== 'string') {
                throw new TypeError('evaluate expects a string');
            }
            return this.#errorCatcher(() => this.#PerformRealmEval(sourceText));
        }

        #ExportGetter(specifierString, exportNameString) {
            if (!Object.prototype.hasOwnProperty.call(this.#moduleCache[specifierString], exportNameString)) {
                throw new TypeError(`${specifierString} has no export named ${exportNameString}`);
            }
            return this.#moduleCache[specifierString][exportNameString];
        }

        // eslint-disable-next-line no-unused-vars
        importValue(specifier, exportName) {
            this.#ValidateRealmObject();

            let specifierString = String(specifier);
            let exportNameString = String(exportName);

            if (this.#moduleCache[specifierString]) {
                return Promise.resolve(this.#ExportGetter(specifierString, exportNameString));
            }

            return import(specifierString).then(module => {
                this.#moduleCache[specifierString] = module;
                return this.#ExportGetter(specifierString, exportNameString);
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
            return 'Realm';
        },
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
