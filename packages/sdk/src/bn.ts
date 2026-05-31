/**
 * A working `BN` re-export so the rest of the codebase can `import { BN }` from the SDK.
 *
 * Why not `import { BN } from "@coral-xyz/anchor"`: under Node ESM / esbuild (tsx, Next),
 * that named binding can't be resolved at runtime — Anchor re-exports BN from bn.js in a
 * way the CJS lexer doesn't surface, and esbuild rewrites namespace member access back into
 * the same broken named import. Importing bn.js directly (a declared dependency of this
 * package) sidesteps all of that and yields the exact same class Anchor and web3.js use.
 */
/// <reference path="./bn-shim.d.ts" />
// (the reference makes the bn.js type shim travel with this file into every package that
// compiles the SDK source, not just the SDK's own tsconfig.)
import BNClass from "bn.js";

export const BN = BNClass;
export type BN = BNClass;
