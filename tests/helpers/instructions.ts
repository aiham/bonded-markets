import { PublicKey, Keypair } from "@solana/web3.js";
import * as SPLToken from "@solana/spl-token";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import { BondedMarkets } from "../../target/types/bonded_markets";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import {
  BASE_DECIMALS,
  DEFAULT_BASE_MINT,
  getNewMarketConfig,
  Market,
  TARGET_DECIMALS,
  TARGET_DECIMAL_MODIFIER,
  User,
} from "./config";
import * as assert from "assert";
import { linearDefiniteIntegral } from "./curveMath";

const provider = anchor.Provider.env();
const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

export const newMarket = async (name: string): Promise<Market> => {
  let newMarketConfig = await getNewMarketConfig(name);
  const tx = await program.rpc.newMarket(
    newMarketConfig.market.bump,
    newMarketConfig.attribution.bump,
    newMarketConfig.baseTreasury.bump,
    newMarketConfig.authority.bump,
    name,
    0,
    {
      accounts: {
        payer: provider.wallet.publicKey,
        creator: provider.wallet.publicKey,
        market: newMarketConfig.market.address,
        attribution: newMarketConfig.attribution.address,
        baseMint: DEFAULT_BASE_MINT.publicKey,
        targetMint: newMarketConfig.targetMint.publicKey,
        baseTreasury: newMarketConfig.baseTreasury.address,
        authority: newMarketConfig.authority.address,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [newMarketConfig.targetMint],
    }
  );
  //await printMarket(newMarketConfig.market.address);
  let storedMarket = await program.account.market.fetch(
    newMarketConfig.market.address
  );
  console.log(
    "CREATED MARKET",
    name,
    "at",
    newMarketConfig.market.address.toBase58()
  );
  return {
    name: name,
    creator: provider.wallet.publicKey,
    baseMint: storedMarket.baseMint,
    targetMint: storedMarket.targetMint,
    amountBurned: storedMarket.amountBurned,
    baseTreasury: storedMarket.baseTreasury,
    authority: storedMarket.authority,
    curve: 0,
    address: newMarketConfig.market.address,
    bump: storedMarket.bump,
  };
};

export const buy = async (user: User, market: Market, amount: BN) => {
  const tx = await program.rpc.buy(amount, {
    accounts: {
      buyer: user.wallet.publicKey,
      buyerBaseTokenAccount: user.baseTokenAccount.address,
      buyerTargetTokenAccount: user.targetTokenAccount.address,
      market: market.address,
      marketAuthority: market.authority.address,
      marketTargetMint: market.targetMint,
      marketBaseTreasury: market.baseTreasury.address,
      rent: web3.SYSVAR_RENT_PUBKEY,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    },
    signers: [user.wallet],
  });
};

export const sell = async (user: User, market: Market, targetAmount: BN) => {
  const tx = await program.rpc.sell(targetAmount, {
    accounts: {
      seller: user.wallet.publicKey,
      sellerBaseTokenAccount: user.baseTokenAccount.address,
      sellerTargetTokenAccount: user.targetTokenAccount.address,
      market: market.address,
      marketTargetMint: market.targetMint,
      marketAuthority: market.authority.address,
      marketBaseTreasury: market.baseTreasury.address,
      tokenProgram: SPLToken.TOKEN_PROGRAM_ID,
    },
    signers: [user.wallet],
  });
};

export const burn = async (user: User, market: Market, amount: BN) => {
  await program.rpc.sponsoredBurn(amount, {
    accounts: {
      sponsor: user.wallet.publicKey,
      targetTokenAccount: user.targetTokenAccount.address,
      targetMint: market.targetMint,
      market: market.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    instructions: [
      program.instruction.buy(amount, {
        accounts: {
          buyer: user.wallet.publicKey,
          buyerBaseTokenAccount: user.baseTokenAccount.address,
          buyerTargetTokenAccount: user.targetTokenAccount.address,
          market: market.address,
          marketAuthority: market.authority.address,
          marketTargetMint: market.targetMint,
          marketBaseTreasury: market.baseTreasury.address,
          rent: web3.SYSVAR_RENT_PUBKEY,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
      }),
    ],
    signers: [user.wallet],
  });
};

let vaporPayer = web3.Keypair.generate();

export const buyWithNarration = async (
  user: User,
  market: Market,
  targetAmount: BN
) => {
  let TargetMint = new Token(
    provider.connection,
    market.targetMint,
    TOKEN_PROGRAM_ID,
    vaporPayer
  );
  let targetMintSupply = await TargetMint.getMintInfo().then((response) => {
    return response.supply.toNumber();
  });
  let startingBaseBalance = await provider.connection
    .getTokenAccountBalance(user.baseTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  let startingTargetBalance = await provider.connection
    .getTokenAccountBalance(user.targetTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    })
    .catch((err) => {
      return 0;
    });
  //BUYING
  await buy(user, market, targetAmount);
  //---
  let endingBaseBalance = await provider.connection
    .getTokenAccountBalance(user.baseTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  let endingTargetBalance = await provider.connection
    .getTokenAccountBalance(user.targetTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  console.log("BUY SUMMARY");

  console.log(
    "moonbase balances ----",
    "\n start:",
    startingBaseBalance,
    "\n end:",
    endingBaseBalance,
    "\n----"
  );
  console.log(
    "target balances ----",
    "\n start:",
    startingTargetBalance,
    "\n end:",
    endingTargetBalance,
    "\n----"
  );
  let difference = startingBaseBalance - endingBaseBalance;
  let pricePerToken =
    difference / (targetAmount.toNumber() / TARGET_DECIMAL_MODIFIER);
  console.log(
    "we just paid",
    difference.toFixed(BASE_DECIMALS),
    "moonbase and got",
    targetAmount.toNumber() / TARGET_DECIMAL_MODIFIER,
    "of the target tokens,",
    "with a price per token of",
    pricePerToken.toFixed(BASE_DECIMALS),
    "moonbase"
  );
  assert.ok(
    endingTargetBalance -
      startingTargetBalance -
      targetAmount.toNumber() / TARGET_DECIMAL_MODIFIER <
      0.00001
  );
  let amountBurned = await program.account.market
    .fetch(market.address)
    .then((market) => {
      return market.amountBurned.toNumber();
    });
  let curveSupply = targetMintSupply + amountBurned;
  let clientIntegral = linearDefiniteIntegral(
    curveSupply,
    targetAmount.toNumber()
  );
  assert.ok(
    startingBaseBalance - endingBaseBalance - clientIntegral < 0.000001
  );
  console.log("client integral", -clientIntegral.toFixed(BASE_DECIMALS + 2));
  console.log("base balance change:", -difference.toFixed(BASE_DECIMALS));
};
export const sellWithNarration = async (
  user: User,
  market: Market,
  targetAmount: BN
) => {
  let TargetMint = new Token(
    provider.connection,
    market.targetMint,
    TOKEN_PROGRAM_ID,
    vaporPayer
  );
  let targetMintSupply = await TargetMint.getMintInfo().then((response) => {
    return response.supply.toNumber();
  });
  let startingBaseBalance = await provider.connection
    .getTokenAccountBalance(user.baseTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  let startingTargetBalance = await provider.connection
    .getTokenAccountBalance(user.targetTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    })
    .catch((err) => {
      return 0;
    });
  //SELLL
  await sell(user, market, targetAmount);
  //done
  let endingBaseBalance = await provider.connection
    .getTokenAccountBalance(user.baseTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  let endingTargetBalance = await provider.connection
    .getTokenAccountBalance(user.targetTokenAccount.address)
    .then((response) => {
      return response.value.uiAmount;
    });
  console.log("SELL SUMMARY");
  console.log(
    "moonbase balances ----",
    "\n start:",
    startingBaseBalance,
    "\n end:",
    endingBaseBalance,
    "\n----"
  );
  console.log(
    "target balances ----",
    "\n start:",
    startingTargetBalance,
    "\n end:",
    endingTargetBalance,
    "\n----"
  );
  let targetDifference = startingTargetBalance - endingTargetBalance;
  let baseDifference = endingBaseBalance - startingBaseBalance;
  let pricePerToken = baseDifference / targetDifference;
  let expectedPricePerToken =
    baseDifference / (targetAmount.toNumber() / TARGET_DECIMAL_MODIFIER);
  console.log(
    "we just sold",
    targetDifference.toFixed(TARGET_DECIMALS),
    "target tokens and got",
    baseDifference.toFixed(BASE_DECIMALS),
    "moonbase tokens back,",
    "with a price per token of",
    pricePerToken.toFixed(BASE_DECIMALS),
    "moonbase"
  );
  // assert.ok(
  //   startingTargetBalance -
  //     endingTargetBalance -
  //     targetAmount.toNumber() / TARGET_DECIMAL_MODIFIER <
  //     0.000001
  // );

  let amountBurned = await program.account.market
    .fetch(market.address)
    .then((market) => {
      return market.amountBurned.toNumber();
    });
  let curveSupply = targetMintSupply + amountBurned;
  let clientIntegral = linearDefiniteIntegral(
    curveSupply - targetAmount.toNumber(),
    curveSupply
  );
  // assert.ok(
  //   endingBaseBalance - startingBaseBalance - clientIntegral < 0.000001
  // );
  console.log("client integral", clientIntegral.toFixed(BASE_DECIMALS + 2));
};
