/**
 * Injectable clock. Every module that needs "now" takes one of these so the
 * gate logic stays deterministic under test and identical on every platform.
 *
 * A clock is just a function returning epoch milliseconds.
 * @typedef {() => number} Clock
 */

/** @type {Clock} */
export const systemClock = () => Date.now();

/**
 * Test/simulation clock you can advance by hand.
 * @param {number} [start]
 */
export function createManualClock(start = 0) {
  let t = start;
  const clock = () => t;
  clock.set = (value) => { t = value; };
  clock.advance = (ms) => { t += ms; return t; };
  return clock;
}
