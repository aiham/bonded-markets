import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as assert from "assert";

import { PublicKey } from "@solana/web3.js";
import {
  Token,
  TOKEN_PROGRAM_ID,
  MintLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { findAssociatedTokenAccount } from "./helpers/tokenHelpers";
import { MoonbaseMarkets } from "../target/types/moonbase_markets";

describe("moonbase-markets", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MoonbaseMarkets as Program<MoonbaseMarkets>;

  interface Pda {
    address: PublicKey;
    bump: number;
  }

  let targetMint = anchor.web3.Keypair.generate();
  let marketAuthority: Pda;
  let marketTreasury: Pda;
  let market: Pda;
  let buyerTokenAccount: Pda;
  let newToken = null;

  it("config", async () => {
    marketAuthority = await findMarketAuthority(targetMint.publicKey);
    marketTreasury = await findMarketTreasury(targetMint.publicKey);
    market = await findMarket(targetMint.publicKey);
    buyerTokenAccount = await findAssociatedTokenAccount(
      provider.wallet.publicKey,
      targetMint.publicKey
    );
    marketTreasury = await findMarketTreasury(targetMint.publicKey);

    newToken = new Token(
      provider.connection,
      targetMint.publicKey,
      TOKEN_PROGRAM_ID,
      web3.Keypair.generate()
    );
  });

  it("make a new market", async () => {
    // Add your test here.
    const tx = await program.rpc.newMarket(
      market.bump,
      marketAuthority.bump,
      marketTreasury.bump,
      "firstmarket",
      {
        accounts: {
          payer: provider.wallet.publicKey,
          creator: provider.wallet.publicKey,
          market: market.address,
          targetMint: targetMint.publicKey,
          marketAuthority: marketAuthority.address,
          marketTreasury: marketTreasury.address,
          rent: web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [targetMint],
      }
    );
    console.log("Your transaction signature", tx);
  });

  it("buy tokens from the new market", async () => {
    let amount = new BN(77000);
    const tx = await program.rpc.buyTokens(amount, {
      accounts: {
        buyer: provider.wallet.publicKey,
        buyerTokenAccount: buyerTokenAccount.address,
        market: market.address,
        marketTargetMint: targetMint.publicKey,
        marketAuthority: marketAuthority.address,
        marketTreasury: marketTreasury.address,
        rent: web3.SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    let buyerTokenAccountInfo = await newToken.getAccountInfo(
      buyerTokenAccount.address
    );
    console.log(buyerTokenAccountInfo);
    assert.ok(buyerTokenAccountInfo.amount.eq(amount));

    let marketTreasuryInfo = await provider.connection.getAccountInfo(
      marketTreasury.address
    );
    console.log(marketTreasuryInfo);
    //balance slightly lower than we took from the buyer bc it's paying for rent on first transfer
  });

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
  const findMarketTreasury = async (targetMint: PublicKey) => {
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
