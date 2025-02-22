import { Network } from '@wormhole-foundation/sdk';
import { PayablePayment } from '../schemas';
import {
  Chain,
  cosmwasmFetch,
  devDb,
  evmFetchPayablePayment,
  notifyHost,
  prodDb,
  solanaFetch
} from '../utils';

export const payablePaid = async (
  paymentId: string,
  chain: Chain,
  network: Network
) => {
  // Set Database based on Network mode
  const db = network === 'Mainnet' ? prodDb : devDb;

  // Ensure the payment is not being recreated a second time.
  // This is necessary to prevent sending emails twice.
  let paidSnap = await db.doc(`/payablePayments/${paymentId}`).get();
  if (paidSnap.exists) throw 'Payment has already been recorded';

  // Repeating the search with lowercase equivalent to account for HEX addresses
  paidSnap = await db.doc(`/payablePayments/${paymentId.toLowerCase()}`).get();
  if (paidSnap.exists) throw 'Payment has already been recorded';

  // Extract On-Chain Data
  let raw: any;
  if (chain === 'Solana') {
    raw = await solanaFetch('payablePayment', paymentId, network);
  } else if (chain === 'Ethereum Sepolia') {
    raw = await evmFetchPayablePayment(paymentId);
    paymentId = paymentId.toLowerCase();
  } else if (chain === 'Burnt Xion') {
    raw = await cosmwasmFetch('payable_payment', paymentId);
    paymentId = paymentId.toLowerCase();
  } else throw `Unsupported Chain ${chain}`;

  // Construct new UserPayment to save.
  const payment = new PayablePayment(paymentId, chain, network, raw);

  // Notify Host (browser and email)
  notifyHost({ ...payment, activity: 'payment' });

  // Save the userPayment to the database
  await db
    .doc(`/payablePayments/${paymentId}`)
    .set({ ...payment }, { merge: true });

  // Retrieve the sum of payment details for tokens and update the volumes
  const volumesRef = await db.doc('/volumes/volumes').get();
  let volumes: any = {};
  if (!volumesRef.exists) {
    volumes[payment.chain] = {
      [payment.details.token]: payment.details.amount
    };
  } else {
    volumes = volumesRef.data();
    if (!volumes[payment.chain]) volumes[payment.chain] = {};
    if (!volumes[payment.chain][payment.details.token])
      volumes[payment.chain][payment.details.token] = 0;
    volumes[payment.chain][payment.details.token] += payment.details.amount;
  }
  await db.doc('/volumes/volumes').set(volumes, { merge: true });
};
