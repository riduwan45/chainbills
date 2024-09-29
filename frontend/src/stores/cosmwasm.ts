import {
  OnChainSuccess,
  TokenAndAmount,
  User,
  XION_CONTRACT_ADDRESS,
  type Token,
} from '@/schemas';
import {
  AbstraxionAuth,
  GranteeSignerClient,
} from '@burnt-labs/abstraxion-core';
import { type Coin } from '@cosmjs/amino';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { defineStore } from 'pinia';
import { useToast } from 'primevue/usetoast';
import { onMounted, ref } from 'vue';

const abstraxion = new AbstraxionAuth();

export const initXion = async () => {
  abstraxion.configureAbstraxionInstance(
    'https://testnet-rpc.xion-api.com:443',
    undefined,
    [
      {
        address: XION_CONTRACT_ADDRESS,
        amounts: [{ denom: 'uxion', amount: '1000000' }],
      },
    ],
    true,
    [{ denom: 'uxion', amount: '1000000' }]
  );
  await abstraxion.authenticate();
  const searchParams = new URLSearchParams(window.location.search);
  const isGranted = searchParams.get('granted');
  const granter = searchParams.get('granter');
  if (isGranted && granter) await abstraxion.login();
};

export const useCosmwasmStore = defineStore('cosmwasm', () => {
  const address = ref<string | null>(null);
  const client = ref<GranteeSignerClient | null>(null);
  const isLoggedIn = ref(false);
  const toast = useToast();

  const balance = async (token: Token): Promise<number | null> => {
    if (!address.value) return null;
    if (!token.details['Burnt Xion']) return null;
    for (const { amount, denom } of abstraxion.bank ?? []) {
      if (denom == token.details['Burnt Xion'].address) return Number(amount);
    }
    // TODO: Account for CW20 token balances
    return 0;
  };

  const createPayable = async (
    tokensAndAmounts: TokenAndAmount[]
  ): Promise<OnChainSuccess | null> => {
    const allowed_tokens_and_amounts = tokensAndAmounts.map((t) =>
      t.toOnChain('Burnt Xion')
    );
    const resp = await execute({
      create_payable: { data: { allowed_tokens_and_amounts } },
    });
    if (resp) {
      const payableId = resp.events
        .find((event: { type: string }) => event.type === 'wasm')!
        .attributes.find(
          (attr: { key: string }) => attr.key === 'payable_id'
        )!.value;
      return new OnChainSuccess({
        created: payableId,
        txHash: resp.transactionHash,
        chain: 'Burnt Xion',
      });
    }
    return null;
  };

  const execute = async (msg: Record<string, unknown>, funds?: Coin[]) => {
    if (!client.value || !address.value) {
      toastError('Connect with Xion First!');
      return null;
    }

    try {
      return await client.value.execute(
        address.value,
        XION_CONTRACT_ADDRESS,
        msg,
        'auto',
        undefined,
        funds
      );
    } catch (e) {
      console.error(e);
      toastError(`${e}`);
      return null;
    }
  };

  const fetchEntity = async (entity: string, id: string) => {
    return recursiveToCamel(await query({ [entity]: { msg: { id } } }));
  };

  const getCurrentUser = async () => {
    if (!client.value || !address.value) return null;
    return User.fromCosmwasm(
      address.value,
      await query({ user: { msg: { id: address.value } } })
    );
  };

  const getPayablePaymentId = async (
    payableId: string,
    count: number
  ): Promise<string | null> => {
    const fetched = await query({
      payable_payment_id: { msg: { reference: payableId, count } },
    });
    return fetched?.id ?? null;
  };

  const getUserEntityId = async (
    entity: string,
    count: number
  ): Promise<string | null> => {
    if (!client.value || !address.value) {
      toastError('Connect with Xion First!');
      return null;
    }
    const fetched = await query({
      [`user_${entity}_id`]: { msg: { reference: address.value, count } },
    });
    return fetched?.id ?? null;
  };

  const getUserPayableId = async (count: number) =>
    getUserEntityId('payable', count);

  const getUserPaymentId = async (count: number) =>
    getUserEntityId('payment', count);

  const getUserWithdrawalId = async (count: number) =>
    getUserEntityId('withdrawal', count);

  const login = abstraxion.login.bind(abstraxion);

  const logout = abstraxion.logout.bind(abstraxion);

  const pay = async (
    payable_id: string,
    taa: TokenAndAmount
  ): Promise<OnChainSuccess | null> => {
    const { token, amount } = taa.toOnChain('Burnt Xion');
    // TODO: Account for CW20 token payments. Request Approval first.
    const resp = await execute(
      {
        pay: { data: { payable_id, token, amount } },
      },
        
    );
    if (resp) {
      const paymentId = resp.events
        .find((event: { type: string }) => event.type === 'wasm')!
        .attributes.find(
          (attr: { key: string }) => attr.key === 'payment_id'
        )!.value;
      return new OnChainSuccess({
        created: paymentId,
        txHash: resp.transactionHash,
        chain: 'Burnt Xion',
      });
    }
    return null;
  };

  const query = async (msg: Record<string, unknown>) => {
    try {
      return await (
        await CosmWasmClient.connect('https://rpc.xion-testnet-1.burnt.com:443')
      ).queryContractSmart(XION_CONTRACT_ADDRESS, msg);
    } catch (e) {
      console.error(e);
      toastError(`${e}`);
      return null;
    }
  };

  const recursiveToCamel = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      return item.map((el: unknown) => recursiveToCamel(el));
    } else if (typeof item === 'function' || item !== Object(item)) {
      return item;
    }
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).map(
        ([key, value]: [string, unknown]) => [
          key.replace(/([-_][a-z])/gi, (c) =>
            c.toUpperCase().replace(/[-_]/g, '')
          ),
          recursiveToCamel(value),
        ]
      )
    );
  };

  const sign = (_: string): string => {
    // TODO: Implement signing for Burnt Xion
    throw 'Burnt Xion Signing Not Yet Implemented';
  };

  const toastError = (detail: string) =>
    toast.add({ severity: 'error', summary: 'Error', detail, life: 12000 });

  const withdraw = async (
    payable_id: string,
    taa: TokenAndAmount
  ): Promise<OnChainSuccess | null> => {
    const { token, amount } = taa.toOnChain('Burnt Xion');
    const resp = await execute({
      withdraw: { data: { payable_id, token, amount } },
    });
    if (resp) {
      const withdrawalId = resp.events
        .find((event: { type: string }) => event.type === 'wasm')!
        .attributes.find(
          (attr: { key: string }) => attr.key === 'withdrawal_id'
        )!.value;
      return new OnChainSuccess({
        created: withdrawalId,
        txHash: resp.transactionHash,
        chain: 'Burnt Xion',
      });
    }
    return null;
  };

  onMounted(() => {
    abstraxion.subscribeToAuthStateChange(async (isSignedIn) => {
      if (isSignedIn) {
        client.value = await abstraxion.getSigner();
        if (!client.value) {
          toastError("Couldn't get client account data on success login");
          throw "Couldn't get client account data on success login";
        }
        // so far the only way to get the main account and not the grantee
        // address.value = localStorage.getItem('xion-authz-granter-account');
        address.value = client.value.granteeAddress;
        isLoggedIn.value = true;
      } else {
        address.value = null;
        client.value = null;
        isLoggedIn.value = false;
      }
    });
  });

  return {
    address,
    balance,
    createPayable,
    fetchEntity,
    getCurrentUser,
    getPayablePaymentId,
    getUserPayableId,
    getUserPaymentId,
    getUserWithdrawalId,
    isLoggedIn,
    login,
    logout,
    pay,
    sign,
    withdraw,
  };
});
