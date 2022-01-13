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

describe("bonded-markets", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

  interface Pda {
    address: PublicKey;
    bump: number;
  }

  let payer = web3.Keypair.generate();

  let moonbaseMint = web3.Keypair.generate();
  let moonbaseMintAuthority = web3.Keypair.generate();
  let MoonbaseToken = null;
  let targetMint = web3.Keypair.generate();
  let TargetToken = null;

  let market: Pda;
  let marketAttribution: Pda;
  let marketAuthority: Pda;
  let baseTreasury: Pda;
  let marketName = "genesis";

  let buyer = web3.Keypair.generate();
  let buyerBaseTokenAccount: Pda;
  let buyerTargetTokenAccount: Pda;

  let seller = web3.Keypair.generate();
  let sellerBaseTokenAccount: Pda;
  let sellerTargetTokenAccount: Pda;

  it("config", async () => {
    marketAuthority = await findMarketAuthority(targetMint.publicKey);
    baseTreasury = await findMarketBaseTreasury(moonbaseMint.publicKey);
    market = await findMarket(targetMint.publicKey);
    marketAttribution = await findMarketAttribution(marketName);

    buyerBaseTokenAccount = await findAssociatedTokenAccount(
      buyer.publicKey,
      moonbaseMint.publicKey
    );
    buyerTargetTokenAccount = await findAssociatedTokenAccount(
      buyer.publicKey,
      targetMint.publicKey
    );

    sellerBaseTokenAccount = await findAssociatedTokenAccount(
      seller.publicKey,
      moonbaseMint.publicKey
    );
    sellerTargetTokenAccount = await findAssociatedTokenAccount(
      seller.publicKey,
      targetMint.publicKey
    );
    TargetToken = new Token(
      provider.connection,
      targetMint.publicKey,
      TOKEN_PROGRAM_ID,
      payer
    );
    MoonbaseToken = new Token(
      provider.connection,
      moonbaseMint.publicKey,
      TOKEN_PROGRAM_ID,
      payer
    );
  });

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
        4,
        moonbaseMintAuthority.publicKey,
        null
      ),
      createAssociatedTokenAccountInstruction(
        moonbaseMint.publicKey,
        buyerBaseTokenAccount.address,
        buyer.publicKey,
        payer.publicKey
      ),
      createAssociatedTokenAccountInstruction(
        moonbaseMint.publicKey,
        sellerBaseTokenAccount.address,
        seller.publicKey,
        payer.publicKey
      )
    );
    await web3.sendAndConfirmTransaction(provider.connection, transaction, [
      payer,
      moonbaseMint,
    ]);

    await MoonbaseToken.mintTo(
      buyerBaseTokenAccount.address,
      moonbaseMintAuthority,
      [],
      100000000000000 //10 billy
    );
    //if i want the balances to match i need to match the mint decimals with the token created

    // let acctInfo = await MoonbaseToken.getAccountInfo(
    //   buyerBaseTokenAccount.address
    // );
    // console.log(acctInfo);
    let fetched = await provider.connection.getTokenAccountBalance(
      buyerBaseTokenAccount.address
    );
    console.log(fetched);
  });

  it("make a new market", async () => {
    // Add your test here.
    const tx = await program.rpc.newMarket(
      market.bump,
      marketAttribution.bump,
      baseTreasury.bump,
      marketAuthority.bump,
      marketName,
      0,
      {
        accounts: {
          payer: provider.wallet.publicKey,
          creator: provider.wallet.publicKey,
          market: market.address,
          attribution: marketAttribution.address,
          baseMint: moonbaseMint.publicKey,
          targetMint: targetMint.publicKey,
          baseTreasury: baseTreasury.address,
          authority: marketAuthority.address,
          rent: web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [targetMint],
      }
    );
    await printMarket(market.address);
  });

  it("buy tokens from the new market", async () => {
    let startingBaseBalance = await provider.connection.getTokenAccountBalance(
      buyerBaseTokenAccount.address
    );

    let amount = new BN(980220);
    const tx = await program.rpc.buy(amount, {
      accounts: {
        buyer: buyer.publicKey,
        buyerBaseTokenAccount: buyerBaseTokenAccount.address,
        buyerTargetTokenAccount: buyerTargetTokenAccount.address,
        market: market.address,
        marketAuthority: marketAuthority.address,
        marketTargetMint: targetMint.publicKey,
        marketBaseTreasury: baseTreasury.address,
        rent: web3.SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [buyer],
    });

    let endingBaseBalance = await provider.connection.getTokenAccountBalance(
      buyerBaseTokenAccount.address
    );
    console.log(endingBaseBalance);
    let difference =
      startingBaseBalance.value.uiAmount - endingBaseBalance.value.uiAmount;
    let pricePerToken = difference / (amount.toNumber() / 10000);
    console.log(
      "we just paid",
      difference,
      "moonbase for",
      amount.toNumber() / 10000,
      "of the target mint",
      "for a price per token of",
      pricePerToken,
      "moonbase"
    );
    // let buyerTargetAmount = await provider.connection.getTokenAccountBalance(
    //   buyerTargetTokenAccount.address
    // );
    let buyerTokenAccountInfo = await TargetToken.getAccountInfo(
      buyerTargetTokenAccount.address
    );
    assert.ok(buyerTokenAccountInfo.amount.eq(amount));
  });

  const performAirdrops = async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payer.publicKey,
        5 * web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        buyer.publicKey,
        5 * web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        seller.publicKey,
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
  interface Market {
    creator: PublicKey;
    baseMint: PublicKey;
    targetMint: PublicKey;
    baseTreasury: Pda;
    authority: Pda;
    curve: number;
    bump: number;
  }

  const findMarket = async (targetMint: PublicKey) => {
    return PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("market"), targetMint.toBuffer()],
      program.programId
    ).then(([address, bump]) => {
      return {
        address: address,
        bump: bump,
      };
    });
  };
  const findMarketAttribution = async (name: string) => {
    return PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode("attribution"),
        anchor.utils.bytes.utf8.encode(name),
      ],
      program.programId
    ).then(([address, bump]) => {
      return {
        address: address,
        bump: bump,
      };
    });
  };

  const findMarketBaseTreasury = async (targetMint: PublicKey) => {
    return PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("treasury"), targetMint.toBuffer()],
      program.programId
    ).then(([address, bump]) => {
      return {
        address: address,
        bump: bump,
      };
    });
  };
  const findMarketAuthority = async (targetMint: PublicKey) => {
    return PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("market_auth"), targetMint.toBuffer()],
      program.programId
    ).then(([address, bump]) => {
      return {
        address: address,
        bump: bump,
      };
    });
  };
  const findTargetMint = async (targetMint: PublicKey) => {
    return PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("market_auth"), targetMint.toBuffer()],
      program.programId
    ).then(([address, bump]) => {
      return {
        address: address,
        bump: bump,
      };
    });
  };
});
