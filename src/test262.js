/* eslint-disable no-undef */
{
    const createShadowRealmBuiltIn = () => {
        const d8Realm = typeof globalThis.Realm !== 'undefined' ? globalThis.Realm : null;
        const jscRealm = typeof $262 !== 'undefined' ? $262.createRealm : null;
        const jsshellRealm = typeof newGlobal !== 'undefined' ? newGlobal : null;

        const WrappedFunctionCreate = (callerRealm, connectedFn) => {
            const GetWrappedValueForCallerRealm = value => GetWrappedValue(callerRealm, value);

            return function(...args) {
                return GetWrappedValueForCallerRealm(connectedFn(...args.map(GetWrappedValueForCallerRealm)));
            }
        };

        const GetWrappedValue = (realm, value) => {
            if (typeof value === 'function') {
                return WrappedFunctionCreate(realm, value);
            }

            if (IsPrimitiveOrCallable(value)) {
                return value;
            }

            // type is 'object';
            throw new TypeError('Cross-Realm Error: Evaluation result is not a primitive value');
        };

        const IsPrimitiveOrCallable = (value) => {
            return value == null || typeof value !== 'object';
        };

        const PerformRealmEval = (sourceText, callerRealm, evalRealm) => {
            let result;

            try {
                result = evalRealm.evalScript(sourceText);
            } catch (error) {
                if (error.toString().includes('SyntaxError')) {
                    throw new SyntaxError(error.message);
                } else {
                    throw error;
                }
            }

            return GetWrappedValue(callerRealm, result);
        };

        const ValidateRealmObject = (realm) => {
            if (!realm || (realm && typeof realm.evalScript !== 'function')) {
                throw new TypeError('Invalid ShadowRealm object');
            }
        };

        const HostCreateRealm = () => {
            const realmCreator = d8Realm ? d8Realm.createAllowCrossRealmAccess : (jsshellRealm ? jsshellRealm : (jscRealm ? jscRealm : null));
            if (!realmCreator) {
                throw new Error('ShadowRealm creation not supported');
            }
            const realm = realmCreator();
            const evalRealm = {
                evalScript(code) {
                    if (d8Realm) {
                        return d8Realm.eval(realm, code);
                    }

                    if (jsshellRealm) {
                        return realm.eval(code);
                    }

                    if (jscRealm) {
                        return realm.evalScript(code);
                    }
                }
            };

            evalRealm.evalScript(`{ const createShadowRealmBuiltIn = ${createShadowRealmBuiltIn.toString()}; createShadowRealmBuiltIn(); }`);

            return evalRealm;
        };
        class ShadowRealm {
            constructor() {
                this.#Realm = HostCreateRealm();
            }

            #moduleCache = {__proto__: null};
            #Realm = null;

            #errorCatcher(fn) {
                try {
                    return fn();
                } catch (error) {
                    if (error && typeof error === 'object') {
                        if (error instanceof SyntaxError) {
                            throw new SyntaxError(error.message);
                        }
                        throw new TypeError(`Cross-Realm Error: ${error.name}: ${error.message}`)
                    } // Else
                    throw new TypeError(`Cross-Realm Error: ${String(error)}`);
                }
            }

            evaluate(sourceText) {
                ValidateRealmObject(this.#Realm);

                if (typeof sourceText !== 'string') {
                    throw new TypeError('evaluate expects a string');
                }
                return this.#errorCatcher(() => PerformRealmEval(sourceText, this, this.#Realm));
            }

            #ExportGetter(specifierString, exportNameString) {
                if (!Object.prototype.hasOwnProperty.call(this.#moduleCache[specifierString], exportNameString)) {
                    throw new TypeError(`${specifierString} has no export named ${exportNameString}`);
                }
                return this.#moduleCache[specifierString][exportNameString];
            }

            // eslint-disable-next-line no-unused-vars
            importValue(specifier, exportName) {
                ValidateRealmObject(this.#Realm);

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

        Object.defineProperty(globalThis, 'ShadowRealm', {
            value: ShadowRealm,
            configurable: true,
            enumerable: false,
            writable: true,
        });

        Object.defineProperty(ShadowRealm.prototype, Symbol.toStringTag, {
            value: 'ShadowRealm',
            configurable: true,
            enumerable: false,
            writable: false,
        });
    };

    createShadowRealmBuiltIn();
}
