import { PublicKey, Keypair } from "@solana/web3.js";
import * as SPLToken from "@solana/spl-token";
import { BondedMarkets } from "../../target/types/bonded_markets";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

const provider = anchor.Provider.env();
const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

export interface User {
  wallet: Keypair;
  baseTokenAccount: Pda;
  targetTokenAccount: Pda;
}
export interface Pda {
  address: PublicKey;
  bump: number;
}
export interface Market {
  creator: PublicKey;
  baseMint: PublicKey;
  targetMint: PublicKey;
  baseTreasury: Pda;
  authority: Pda;
  curve: number;
  address: PublicKey;
  bump: number;
}
export interface NewMarketConfig {
  targetMint: Keypair;
  market: Pda;
  name: string;
  attribution: Pda;
  baseTreasury: Pda;
  authority: Pda;
}
export const getNewMarketConfig = async (
  name: string
): Promise<NewMarketConfig> => {
  let targetMint = web3.Keypair.generate();
  let market = await findMarket(targetMint.publicKey);
  let attr = await findMarketAttribution(name);
  let bt = await findMarketBaseTreasury(targetMint.publicKey);
  let auth = await findMarketAuthority(targetMint.publicKey);
  return {
    targetMint: targetMint,
    market: market,
    name: name,
    attribution: attr,
    baseTreasury: bt,
    authority: auth,
  };
};

export const findMarket = async (targetMint: PublicKey) => {
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
export const findMarketAttribution = async (name: string) => {
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

export const findMarketBaseTreasury = async (targetMint: PublicKey) => {
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
export const findMarketAuthority = async (targetMint: PublicKey) => {
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
export const findTargetMint = async (targetMint: PublicKey) => {
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
