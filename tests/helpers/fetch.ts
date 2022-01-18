import { PublicKey, Keypair } from "@solana/web3.js";
import * as SPLToken from "@solana/spl-token";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { BondedMarkets } from "../../target/types/bonded_markets";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { Market, TARGET_DECIMAL_MODIFIER } from "./config";
import { linearCurve, linearDefiniteIntegral } from "./curveMath";

const provider = anchor.Provider.env();
const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

const fetchCurveSupply = async (market: Market) => {
  let TargetMint = new Token(
    provider.connection,
    market.targetMint,
    TOKEN_PROGRAM_ID,
    web3.Keypair.generate()
  );
  let targetMintSupply = await TargetMint.getMintInfo().then((response) => {
    return response.supply.toNumber();
  });
  let amountBurned = await program.account.market
    .fetch(market.address)
    .then((market) => {
      return market.amountBurned.toNumber();
    });
  let curveSupply = targetMintSupply + amountBurned;
  return curveSupply;
};

export const fetchMarginalPrice = async (market: Market) => {
  let curveSupply = await fetchCurveSupply(market);
  let price = linearCurve(curveSupply);
  console.log("marginal price——", market.name, "==", price);
  return price;
};

export const fetchWholePrice = async (market: Market) => {
  let curveSupply = await fetchCurveSupply(market);
  let price = linearDefiniteIntegral(
    curveSupply - 1 * TARGET_DECIMAL_MODIFIER,
    curveSupply
  );
  console.log("price for 1 token——", market.name, "==", price);
  return price;
};
