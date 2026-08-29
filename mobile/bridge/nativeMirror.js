import { blockedAppIds } from './appIds.js';

/**
 * The entire contract between the shared gate and native code.
 *
 * Android's overlay service and iOS's Screen Time shield both run when no
 * JavaScript is alive, so they cannot ask the gate anything. Instead the gate
 * pushes this one flat record down whenever it changes, and native code decides
 * by comparing `unlockedUntil` to the wall clock.
 *
 * Kept free of React Native imports so it runs — and is tested — under plain
 * Node, exactly like core/.
 *
 * @typedef {object} NativeGateState
 * @property {'locked'|'pending'|'unlocked'} status
 * @property {number} unlockedUntil  epoch ms; 0 whenever the feed is not open
 * @property {string[]} blockedApps  package names (Android) or bundle ids (iOS)
 */

/**
 * Project a core gate snapshot onto the native record. Pure.
 *
 * `pending` deliberately reports `unlockedUntil: 0`: a post awaiting proof of
 * publication has not bought anything yet, and native code that treated it as
 * open would hand out an unbounded window.
 *
 * @param {object} snapshot
 * @param {'android'|'ios'} os
 * @returns {NativeGateState}
 */
export function gateStateFor(snapshot, os = 'android') {
  const open = snapshot.status === 'unlocked' && snapshot.endsAt;
  return {
    status: snapshot.status,
    unlockedUntil: open ? snapshot.endsAt : 0,
    blockedApps: blockedAppIds(snapshot.settings, os),
  };
}

/**
 * Push every state change down to native. Returns the initial load so callers
 * can await a first push before showing UI.
 *
 * @param {object} gate    from core/gate.js
 * @param {{ setGateState(state: NativeGateState): void }} native
 * @param {'android'|'ios'} os
 */
export function attachNativeMirror(gate, native, os = 'android') {
  const push = (snapshot) => native.setGateState(gateStateFor(snapshot, os));
  gate.subscribe(push);
  return gate.load().then((snapshot) => { push(snapshot); return snapshot; });
}
