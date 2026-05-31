// bn.js ships no type declarations and we don't pull in @types/bn.js. Alias its default
// export to Anchor's bundled BN class so TS sees the real API. (Runtime resolution comes
// from the explicit "bn.js" dependency in this package.)
declare module "bn.js" {
  import { BN } from "@coral-xyz/anchor";
  export default BN;
}
