import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { assert, expect } from "chai";
import { EscrowContract } from "../target/types/escrow_contract";

const deriveAccount = (
  receiver: anchor.web3.PublicKey,
  payer: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
) => {
  let seeds = [receiver.toBuffer(), payer.toBuffer()];
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, programId);
};

const sendLamportsIx = (
  publicKey: anchor.web3.PublicKey,
  amount: number
): anchor.web3.TransactionInstruction => {
  return anchor.web3.SystemProgram.transfer({
    fromPubkey: provider.wallet.publicKey,
    toPubkey: publicKey,
    lamports: amount,
  });
};

const sleep = (ms: number) => {
  return new Promise((r) => setTimeout(r, ms));
};

anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.EscrowContract as Program<EscrowContract>;
const provider = anchor.getProvider() as anchor.AnchorProvider;
const SYSTEM_PROGRAM = anchor.web3.SystemProgram.programId;

const alice = anchor.web3.Keypair.generate(); // Alice is payer
const bob = anchor.web3.Keypair.generate();
const malicious = anchor.web3.Keypair.generate();

const TEST_AMOUNT = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL);
const PRE_BALANCE = new anchor.BN(1_000_000_000);

const [testHoldingAccount, bump] = deriveAccount(
  bob.publicKey,
  alice.publicKey,
  program.programId
);

describe("escrow-contract", () => {
  it("Setup", async () => {
    const fundTxn = new anchor.web3.Transaction();
    fundTxn.add(
      sendLamportsIx(alice.publicKey, 1_000_000_000),
      sendLamportsIx(bob.publicKey, 1_000_000_000)
    );
    await provider.sendAndConfirm(fundTxn);
  });

  it("Initialize Holding Account", async () => {
    await program.methods
      .initialize(TEST_AMOUNT)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
        systemProgram: SYSTEM_PROGRAM,
      })
      .signers([alice])
      .rpc();
    const currentAccount = await program.account.escrowAccount.fetch(
      testHoldingAccount
    );
    assert.equal(1, currentAccount.state);
    assert.isAbove(await provider.connection.getBalance(testHoldingAccount), 0);
  });

  it("Close Holding Account Early", async () => {
    await program.methods
      .payerCancel(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([alice])
      .rpc();
    assert.equal(0, await provider.connection.getBalance(testHoldingAccount));
  });

  it("Initialize New Holding Account", async () => {
    await sleep(2000);
    await program.methods
      .initialize(TEST_AMOUNT)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
        systemProgram: SYSTEM_PROGRAM,
      })
      .signers([alice])
      .rpc();
    const accountState = await program.account.escrowAccount.fetch(
      testHoldingAccount
    );
    assert.equal(1, accountState.state);
  });

  it("Payer Tries To Confirm Early (SHOULD FAIL)", async () => {
    await program.methods
      .payerConfirm(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([alice])
      .rpc();
  });

  it("Malicious party tries to withdraw funds (SHOULD FAIL)", async () => {
    await program.methods
      .payerCancel(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([malicious])
      .rpc();
  });

  it("Payer tries to confirm for receiver (SHOULD FAIL)", async () => {
    await program.methods
      .receiverConfirm(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([alice])
      .rpc();
  });

  it("Receiver Confirms", async () => {
    await program.methods
      .receiverConfirm(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([bob])
      .rpc();
    const accountState = await program.account.escrowAccount.fetch(
      testHoldingAccount
    );
    assert.equal(2, accountState.state);
  });

  it("Receiver tries to confirm twice (SHOULD FAIL)", async () => {
    await program.methods
      .receiverConfirm(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([bob])
      .rpc();
  });

  it("Payer tries to withdraw too late (SHOULD FAIL)", async () => {
    await program.methods
      .payerCancel(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([alice])
      .rpc();
  });

  it("Payer confirms", async () => {
    await program.methods
      .payerConfirm(bump)
      .accounts({
        holdingAccount: testHoldingAccount,
        payer: alice.publicKey,
        receiver: bob.publicKey,
      })
      .signers([alice])
      .rpc();
    const bobBalance = await provider.connection.getBalance(bob.publicKey);
    assert.isAbove(bobBalance, TEST_AMOUNT.add(PRE_BALANCE).toNumber(), "Receiving party did not get their payment!");
  });
});
