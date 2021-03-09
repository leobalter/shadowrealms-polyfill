let n, send
let r = await Realm.import(s => { send = s; return val => { n = val; } },
                           module { export default t => n => t(n+1); });
send(4);
console.log(n); // 5



let n, send
let r = Realm.eval(callToInner => { send = callToInner; return val => { n = val; } },
                   "callToIncubator => n => callToIncubator(n+1);");
send(4);
console.log(n); // 5


let n, send;
Realm.eval(function(callToInner) {
    send = callToInner;
    return function(val) {
        n = val;
    };
}, `
    function(callToIncubator) {
        return function(n) {
            return callToIncubator(n+1);
        };
    }
`);

send(4);
console.log(n); // 5
