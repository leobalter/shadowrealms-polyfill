interface ShadowRealmConstructor {
    new (): ShadowRealm;
    readonly prototype: ShadowRealm;
}
interface ShadowRealm {
    /** Synchronously execute a top-level script. The sourceText is interpreted as a Script and evaluated with this bound to the shadowrealm's global object. */
    evaluate(sourceText: string): void | PrimitiveOrCallable;
    /** This is equivalent to dynamic import without having to evaluate a script source. */
    importValue(specifier: string, exportName: string): PrimitiveOrCallable;
    [Symbol.toStringTag]: 'toStringTag';
}

type PrimitiveOrCallable =
    | null
    | undefined
    | boolean
    | number
    | bigint
    | string
    | symbol
    | ((...args: PrimitiveOrCallable[]) => PrimitiveOrCallable | void);

declare var ShadowRealm: ShadowRealmConstructor;
