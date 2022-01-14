import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as assert from "assert";

import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import {
  Token,
  TOKEN_PROGRAM_ID,
  MintLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createAssociatedTokenAccountInstruction,
  findAssociatedTokenAccount,
} from "./helpers/tokenHelpers";
import { BondedMarkets } from "../target/types/bonded_markets";
import { getNewMarketConfig, Market, Pda, User } from "./helpers/config";

describe("bonded-markets", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

  let payer = web3.Keypair.generate();

  let moonbaseMint = web3.Keypair.generate();
  let moonbaseMintAuthority = web3.Keypair.generate();
  let MoonbaseToken = null;

  let genesisMarket: Market;
  let firstUser: User;

  let baseDecimals = 6;
  let baseDecimalModifier = 10 ** baseDecimals;
  let targetDecimals = 6;
  let targetDecimalModifier = 10 ** targetDecimals;
  let linearDivConstant = 100000000;

  it("create moonbase token", async () => {
    //create subscription mint account
    await performAirdrops();
    let transaction = new web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: moonbaseMint.publicKey,
        space: MintLayout.span,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          MintLayout.span
        ),
        programId: TOKEN_PROGRAM_ID,
      }),
      Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        moonbaseMint.publicKey,
        baseDecimals,
        moonbaseMintAuthority.publicKey,
        null
      )
    );
    await web3.sendAndConfirmTransaction(provider.connection, transaction, [
      payer,
      moonbaseMint,
    ]);
    MoonbaseToken = new Token(
      provider.connection,
      moonbaseMint.publicKey,
      TOKEN_PROGRAM_ID,
      payer
    );
  });

  it("make a new market", async () => {
    // Add your test here.
    genesisMarket = await newMarket("genesis");
  });

  it("buy tokens from the new market", async () => {
    firstUser = await createUser(
      web3.Keypair.generate(),
      genesisMarket.targetMint
    );

    let amount = new BN(55.444 * targetDecimalModifier);
    await buyWithNarration(firstUser, genesisMarket, amount);
  });

  it("sell tokens", async () => {
    let amount = new BN(18.7 * targetDecimalModifier);
    await sellWithNarration(firstUser, genesisMarket, amount);
  });

  it("sell more tokens", async () => {
    let amount = new BN(3.7 * targetDecimalModifier);
    await sellWithNarration(firstUser, genesisMarket, amount);
  });

  it("do a whole new market", async () => {
    let yeezyMarket = await newMarket("yeezy");
    let yeezyUser = await createUser(
      web3.Keypair.generate(),
      yeezyMarket.targetMint
    );
    let buyAmount = new BN(24.24 * targetDecimalModifier);
    await buyWithNarration(yeezyUser, yeezyMarket, buyAmount);
  });

  const newMarket = async (name: string): Promise<Market> => {
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
          baseMint: moonbaseMint.publicKey,
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
      creator: provider.wallet.publicKey,
      baseMint: storedMarket.baseMint,
      targetMint: storedMarket.targetMint,
      baseTreasury: storedMarket.baseTreasury,
      authority: storedMarket.authority,
      curve: 0,
      address: newMarketConfig.market.address,
      bump: storedMarket.bump,
    };
  };
  const buy = async (user: User, market: Market, amount: BN) => {
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
  const sell = async (user: User, market: Market, targetAmount: BN) => {
    const tx = await program.rpc.sell(targetAmount, {
      accounts: {
        seller: user.wallet.publicKey,
        sellerBaseTokenAccount: user.baseTokenAccount.address,
        sellerTargetTokenAccount: user.targetTokenAccount.address,
        market: market.address,
        marketTargetMint: market.targetMint,
        marketAuthority: market.authority.address,
        marketBaseTreasury: market.baseTreasury.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [firstUser.wallet],
    });
  };

  const buyWithNarration = async (
    user: User,
    market: Market,
    targetAmount: BN
  ) => {
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
      difference / (targetAmount.toNumber() / targetDecimalModifier);
    console.log(
      "we just paid",
      difference.toFixed(baseDecimals),
      "moonbase and got",
      targetAmount.toNumber() / targetDecimalModifier,
      "of the target tokens,",
      "with a price per token of",
      pricePerToken.toFixed(baseDecimals),
      "moonbase"
    );
    assert.ok(
      endingTargetBalance -
        startingTargetBalance -
        targetAmount.toNumber() / targetDecimalModifier <
        0.00001
    );
    let clientIntegral = linearDefiniteIntegral(0, targetAmount.toNumber());
    assert.ok(
      startingBaseBalance - endingBaseBalance - clientIntegral < 0.000001
    );
    console.log("client integral", -clientIntegral.toFixed(baseDecimals + 2));
    console.log("base balance change:", -difference.toFixed(baseDecimals));
  };
  const sellWithNarration = async (
    user: User,
    market: Market,
    targetAmount: BN
  ) => {
    let TargetMint = new Token(
      provider.connection,
      market.targetMint,
      TOKEN_PROGRAM_ID,
      payer
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
      baseDifference / (targetAmount.toNumber() / targetDecimalModifier);
    console.log(
      "we just sold",
      targetDifference.toFixed(targetDecimals),
      "target tokens and got",
      baseDifference.toFixed(baseDecimals),
      "moonbase tokens back,",
      "with a price per token of",
      pricePerToken.toFixed(baseDecimals),
      "moonbase"
    );
    assert.ok(
      startingTargetBalance -
        endingTargetBalance -
        targetAmount.toNumber() / targetDecimalModifier <
        0.000001
    );

    let clientIntegral = linearDefiniteIntegral(
      targetMintSupply - targetAmount.toNumber(),
      targetMintSupply
    );
    assert.ok(
      endingBaseBalance - startingBaseBalance - clientIntegral < 0.000001
    );
    console.log("client integral", clientIntegral.toFixed(baseDecimals + 2));
  };

  const linearDefiniteIntegral = (a: number, b: number) => {
    let aArea = a ** 2 / 2;
    let bArea = b ** 2 / 2;
    return (bArea - aArea) / baseDecimalModifier / linearDivConstant;
  };

  const createUser = async (
    wallet: Keypair,
    targetMint: PublicKey
  ): Promise<User> => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        wallet.publicKey,
        5 * web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    let baseTokenAccount = await findAssociatedTokenAccount(
      wallet.publicKey,
      moonbaseMint.publicKey
    );
    let targetTokenAccount = await findAssociatedTokenAccount(
      wallet.publicKey,
      targetMint
    );
    await web3.sendAndConfirmTransaction(
      provider.connection,
      new web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          moonbaseMint.publicKey,
          baseTokenAccount.address,
          wallet.publicKey,
          wallet.publicKey
        )
      ),
      [wallet]
    );
    await MoonbaseToken.mintTo(
      baseTokenAccount.address,
      moonbaseMintAuthority,
      [],
      1000 * baseDecimalModifier //10 billy
    );
    return {
      wallet: wallet,
      baseTokenAccount: baseTokenAccount,
      targetTokenAccount: targetTokenAccount,
    };
  };

  const performAirdrops = async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payer.publicKey,
        5 * web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
  };
  const printMarket = async (address: PublicKey) => {
    let market = await program.account.market.fetch(address);
    let readableMarket = {
      creator: market.creator.toBase58(),
      baseMint: market.baseMint.toBase58(),
      targetMint: market.targetMint.toBase58(),
      baseTreasuryAddress: market.baseTreasury.address.toBase58(),
      authorityAddress: market.authority.address.toBase58(),
      curve: market.curve,
      bump: market.bump,
    };
    console.log(readableMarket);
  };
});
