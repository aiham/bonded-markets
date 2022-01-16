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
import {
  BASE_DECIMALS,
  BASE_DECIMAL_MODIFIER,
  DEFAULT_BASE_MINT,
  getNewMarketConfig,
  Market,
  Pda,
  TARGET_DECIMAL_MODIFIER,
  User,
} from "./helpers/config";
import { linearCurve, linearDefiniteIntegral } from "./helpers/curveMath";
import {
  newMarket,
  buyWithNarration,
  sellWithNarration,
  burn,
} from "./helpers/instructions";
import { fetchMarginalPrice, fetchWholePrice } from "./helpers/fetch";

describe("bonded-markets", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

  let payer = web3.Keypair.generate();

  let moonbaseMint = DEFAULT_BASE_MINT;
  let moonbaseMintAuthority = web3.Keypair.generate();
  let MoonbaseToken = null;

  let genesisMarket: Market;
  let firstUser: User;

  let firstMarket = false;

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
        BASE_DECIMALS,
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

  if (firstMarket) {
    it("make a new market", async () => {
      // Add your test here.
      genesisMarket = await newMarket("genesis");

      firstUser = await createUser(
        web3.Keypair.generate(),
        genesisMarket.targetMint
      );

      let buyAmount = new BN(55.444 * TARGET_DECIMAL_MODIFIER);
      await buyWithNarration(firstUser, genesisMarket, buyAmount);

      let sellAmount = new BN(18.7 * TARGET_DECIMAL_MODIFIER);
      await sellWithNarration(firstUser, genesisMarket, sellAmount);

      let secondBuyAmount = new BN(3.7 * TARGET_DECIMAL_MODIFIER);
      await sellWithNarration(firstUser, genesisMarket, secondBuyAmount);
    });
  }

  it("do a whole market with burning", async () => {
    let yeezyMarket = await newMarket("yeezy");
    let yeezyUser = await createUser(
      web3.Keypair.generate(),
      yeezyMarket.targetMint
    );
    await buyWithNarration(
      yeezyUser,
      yeezyMarket,
      new BN(24.24 * TARGET_DECIMAL_MODIFIER)
    );
    await fetchWholePrice(yeezyMarket);

    let sponsor = await createUser(
      web3.Keypair.generate(),
      yeezyMarket.targetMint
    );
    await burn(sponsor, yeezyMarket, new BN(1.333 * TARGET_DECIMAL_MODIFIER));
    await printMarket(yeezyMarket.address);

    await fetchWholePrice(yeezyMarket);
    await fetchMarginalPrice(yeezyMarket);

    await sellWithNarration(
      yeezyUser,
      yeezyMarket,
      new BN(1 * TARGET_DECIMAL_MODIFIER)
    );
  });

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
      1000 * BASE_DECIMAL_MODIFIER //10 billy
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
      amountBurned: market.amountBurned.toNumber(),
      baseTreasuryAddress: market.baseTreasury.address.toBase58(),
      authorityAddress: market.authority.address.toBase58(),
      curve: market.curve,
      bump: market.bump,
    };
    console.log(readableMarket);
  };
});
function sell(user: User, market: Market, targetAmount: anchor.BN) {
  throw new Error("Function not implemented.");
}
