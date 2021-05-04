{

    const wm = new WeakMap();
    class Realm {
        constructor() {
            this.#iframe = document.createElement('iframe');
            this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            this.#iframe.style.display = 'none';
        }

        #iframe = null;
        // This simulates `%Realm%`
        #IntrinsicRealm = this.constructor;

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

            if (typeof result === 'function') {
                console.log(result);

                return Object.freeze(result);
            }

            return result;
        };

        #isPrimitive(value) {
            return typeof value === 'function' || (value == null || typeof value !== 'object');
        }

        evaluate(str) {
            const result = this.#errorCatcher(() => this.#evaluateInRealm(str));
            if (!this.#isPrimitive(result)) {
                throw new TypeError('Cross-Realm Error: Evaluation result is not a primitive value');
            }
            return result;
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