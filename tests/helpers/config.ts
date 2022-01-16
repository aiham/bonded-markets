import { PublicKey, Keypair } from "@solana/web3.js";
import * as SPLToken from "@solana/spl-token";
import { BondedMarkets } from "../../target/types/bonded_markets";
import { BN, Program } from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

const provider = anchor.Provider.env();
const program = anchor.workspace.BondedMarkets as Program<BondedMarkets>;

export const BASE_DECIMALS = 6;
export const BASE_DECIMAL_MODIFIER = 10 ** BASE_DECIMALS;
export const TARGET_DECIMALS = 6;
export const TARGET_DECIMAL_MODIFIER = 10 ** TARGET_DECIMALS;
export const LINEAR_DIV_CONSTANT = 100000000;

export const DEFAULT_BASE_MINT = web3.Keypair.generate();

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
  name: string;
  creator: PublicKey;
  baseMint: PublicKey;
  targetMint: PublicKey;
  amountBurned: BN;
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
