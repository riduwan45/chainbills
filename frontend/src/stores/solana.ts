import { OnChainSuccess } from '@/schemas/on-chain-success';
import {
  convertTokensForOnChain,
  type TokenAndAmountOffChain,
} from '@/schemas/tokens-and-amounts';
import { AnchorProvider, BN, Program, web3 } from '@project-serum/anchor';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction as createATAIx,
  getAssociatedTokenAddressSync as getATA,
  getAccount,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  clusterApiUrl,
} from '@solana/web3.js';
import { defineStore } from 'pinia';
import { useToast } from 'primevue/usetoast';
import { useAnchorWallet } from 'solana-wallets-vue';
import { WH_CHAIN_ID_SOLANA } from './chain';
import { IDL, type Chainbills } from './idl';
import { useUserStore } from './user';

export const PROGRAM_ID = 'p7Lu1yPzMRYLfLxWbEePx8kn3LNevFTbGVC5ghyADF9';

export const useSolanaStore = defineStore('solana', () => {
  const anchorWallet = useAnchorWallet();
  const chainStats = PublicKey.findProgramAddressSync(
    [
      Buffer.from('chain'),
      new BN(WH_CHAIN_ID_SOLANA).toArrayLike(Buffer, 'le', 2),
    ],
    new PublicKey(PROGRAM_ID),
  )[0];
  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
  const globalStats = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    new PublicKey(PROGRAM_ID),
  )[0];
  const systemProgram = new PublicKey(web3.SystemProgram.programId);
  const toast = useToast();
  const tokenProgram = new PublicKey(TOKEN_PROGRAM_ID);
  const user = useUserStore();

  const balance = async (
    tokenAccount: PublicKey,
    tokenName: string,
  ): Promise<number | null> => {
    try {
      return (await connection.getTokenAccountBalance(tokenAccount)).value
        .uiAmount;
    } catch (e) {
      if (`${e}`.includes('could not find account')) return 0;
      toastError(`Couldn't fetch ${tokenName} balance: ${e}`);
      return null;
    }
  };

  const doesATAExists = async (ata: PublicKey): Promise<boolean> => {
    let exists = false;
    try {
      exists = !!(await getAccount(connection, ata));
    } catch (_) {}
    return exists;
  };

  const initializePayable = async (
    description: string,
    tokensAndAmounts: TokenAndAmountOffChain[],
    allowsFreePayments: boolean,
  ): Promise<OnChainSuccess | null> => {
    if (!anchorWallet.value) {
      toastError('Connect Solana Wallet First!');
      return null;
    }

    const isExistingUser = await user.isInitialized();
    let hostCount = 1;
    if (isExistingUser) hostCount = (await user.data())!.payablesCount + 1;

    const payable = PublicKey.findProgramAddressSync(
      seeds('payable', hostCount),
      new PublicKey(PROGRAM_ID),
    )[0];

    const call = program()
      .methods.initializePayable(
        description,
        convertTokensForOnChain(tokensAndAmounts) as any,
        allowsFreePayments,
      )
      .accounts({
        payable,
        host: user.pubkey()!,
        globalStats,
        chainStats,
        signer: anchorWallet.value!.publicKey,
        systemProgram,
      });

    if (!isExistingUser) call.preInstructions([(await initializeUserIx())!]);

    return new OnChainSuccess({
      created: payable.toBytes(),
      txHash: await call.rpc(),
      chain: 'Solana',
    });
  };

  const initializeUserIx = async (): Promise<TransactionInstruction> => {
    return program()
      .methods.initializeUser()
      .accounts({
        user: PublicKey.findProgramAddressSync(
          [anchorWallet.value!.publicKey.toBytes()],
          new PublicKey(PROGRAM_ID),
        )[0]!,
        signer: anchorWallet.value!.publicKey,
        chainStats,
        globalStats,
        systemProgram,
      })
      .instruction();
  };

  const pay = async (
    payableId: string,
    details: TokenAndAmountOffChain,
  ): Promise<OnChainSuccess | null> => {
    const { amount, token: mint } = convertTokensForOnChain([details])[0];
    if (amount.toNumber() == 0) {
      toastError('Cannot withdraw zero');
      return null;
    }

    if (!anchorWallet.value) {
      toastError('Connect Solana Wallet First!');
      return null;
    }

    const isExistingUser = await user.isInitialized();
    let payerCount = 1;
    if (isExistingUser) payerCount = (await user.data())!.paymentsCount + 1;

    const payment = PublicKey.findProgramAddressSync(
      seeds('payment', payerCount),
      new PublicKey(PROGRAM_ID),
    )[0];
    const signer = anchorWallet.value.publicKey;
    const payerTokenAccount = getATA(mint, signer, true);
    const payerTAExists = await doesATAExists(payerTokenAccount);
    const globalTokenAccount = getATA(mint, globalStats, true);
    const globalTAExists = await doesATAExists(globalTokenAccount);

    const call = program()
      .methods.pay(amount)
      .accounts({
        payment,
        payable: new PublicKey(payableId),
        payer: user.pubkey()!,
        globalStats,
        chainStats,
        mint,
        payerTokenAccount,
        globalTokenAccount,
        signer,
        tokenProgram,
        systemProgram,
      });

    call.preInstructions([
      ...(!isExistingUser ? [(await initializeUserIx())!] : []),
      ...(!payerTAExists
        ? [createATAIx(signer, payerTokenAccount, signer, mint)]
        : []),
      ...(!globalTAExists
        ? [createATAIx(signer, globalTokenAccount, globalStats, mint)]
        : []),
    ]);

    return new OnChainSuccess({
      created: payment,
      txHash: await call.rpc(),
      chain: 'Solana',
    });
  };

  const program = () =>
    new Program<Chainbills>(
      IDL,
      PROGRAM_ID,
      ...(anchorWallet.value
        ? [new AnchorProvider(connection, anchorWallet.value!, {})]
        : [{ connection }]),
    );

  const seeds = (entity: string, count: number): Uint8Array[] => {
    return [
      anchorWallet.value!.publicKey.toBytes(),
      Buffer.from(entity),
      new BN(count).toArrayLike(Buffer, 'le', 8),
    ];
  };

  const toastError = (detail: string) =>
    toast.add({ severity: 'error', summary: 'Error', detail, life: 12000 });

  const withdraw = async (
    payableId: string,
    details: TokenAndAmountOffChain,
  ): Promise<OnChainSuccess | null> => {
    const { amount, token: mint } = convertTokensForOnChain([details])[0];
    if (amount.toNumber() == 0) {
      toastError('Cannot withdraw zero');
      return null;
    }

    if (!anchorWallet.value) {
      toastError('Connect Solana Wallet First!');
      return null;
    }

    const config = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      new PublicKey(PROGRAM_ID),
    )[0];
    const withdrawal = PublicKey.findProgramAddressSync(
      seeds('withdrawal', (await user.data())!.withdrawalsCount + 1),
      new PublicKey(PROGRAM_ID),
    )[0]; 
    const maxWithdrawalFeeDetails = PublicKey.findProgramAddressSync(
      [Buffer.from('max_withdrawal_fee'), mint.toBytes()],
      new PublicKey(PROGRAM_ID),
    )[0];
    const signer = anchorWallet.value!.publicKey;
    const hostTokenAccount = getATA(mint, signer, true);
    const hostTAExists = await doesATAExists(hostTokenAccount);
    const globalTokenAccount = getATA(mint, globalStats, true);

    const call = program()
      .methods.withdraw(amount)
      .accounts({
        config,
        withdrawal,
        payable: new PublicKey(payableId),
        host: user.pubkey()!,
        globalStats,
        chainStats,
        maxWithdrawalFeeDetails,
        mint,
        hostTokenAccount,
        globalTokenAccount,
        signer,
        tokenProgram,
        systemProgram,
      });

    if (!hostTAExists) {
      call.preInstructions([
        createATAIx(signer, hostTokenAccount, signer, mint),
      ]);
    }

    return new OnChainSuccess({
      created: withdrawal,
      txHash: await call.rpc(),
      chain: 'Solana',
    });
  };

  return { balance, initializePayable, pay, program, withdraw };
});
