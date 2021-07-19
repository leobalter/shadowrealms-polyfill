export const x = 1;
export function foo() {
  return 'foo';
}
export class Bar {
  constructor(...args) {
    this.args = args;
  }
}
export default class Spaz extends Bar {}
