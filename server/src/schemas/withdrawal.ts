import { ChainId, Network } from '@wormhole-foundation/sdk';
import { Timestamp } from 'firebase-admin/firestore';
import { Chain, getChainId } from '../utils';
import { TokenAndAmount } from './tokens-and-amounts';

export class Withdrawal {
  id: string;
  chain: Chain;
  chainId: ChainId;
  chainCount: number;
  network: Network;
  payableId: string;
  payableCount: number;
  host: string;
  hostCount: number;
  timestamp: Timestamp;
  details: TokenAndAmount;

  constructor(id: string, chain: Chain, network: Network, onChainData: any) {
    this.id = id;
    this.chain = chain;
    this.chainId = getChainId(chain);
    this.network = network;
    this.chainCount = Number(onChainData.chainCount);

    if (chain == 'Ethereum Sepolia') this.host = onChainData.host;
    else if (chain == 'Solana') this.host = onChainData.host.toBase58();
    else throw `Unknown chain: ${chain}`;

    this.hostCount = Number(onChainData.hostCount);

    if (chain == 'Ethereum Sepolia') this.payableId = onChainData.payableId;
    else if (chain == 'Solana') {
      this.payableId = onChainData.payableId.toBase58();
    } else throw `Unknown chain: ${chain}`;

    this.payableCount = Number(onChainData.payableCount);
    this.details = TokenAndAmount.fromOnChain(onChainData.details, chain);
    this.timestamp = Timestamp.fromMillis(Number(onChainData.timestamp) * 1000);
  }
}
