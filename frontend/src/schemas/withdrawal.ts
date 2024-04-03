import {
  convertTokensToOffChain,
  type TokenAndAmountOffChain,
} from './tokens-and-amounts';

export class Withdrawal {
  address: string;
  globalCount: number;
  payable: string;
  payableCount: number;
  host: string;
  hostCount: number;
  hostWallet: string;
  timestamp: Date;
  details: TokenAndAmountOffChain;

  constructor(address: string, hostWallet: string, onChainData: any) {
    this.address = address;
    this.globalCount = onChainData.globalCount.toNumber();
    this.host = onChainData.host.toBase58();
    this.hostCount = onChainData.hostCount.toNumber();
    this.hostWallet = hostWallet;
    this.payable = onChainData.payable.toBase58();
    this.payableCount = onChainData.payableCount.toNumber();
    this.details = convertTokensToOffChain([onChainData.details])[0];
    this.timestamp = new Date(onChainData.timestamp.toNumber() * 1000);
  }
}
