import * as RPChCrypto from "@rpch/crypto"
import SDK from "@rpch/sdk"
import { memoize } from "lodash-es"
import { RpcProvider, RpcProviderOptions, SequencerProvider } from "starknet"
import { SequencerProvider as SequencerProviderv4 } from "starknet4"

import { Network } from "./type"

const getProviderForBaseUrl = memoize((baseUrl: string) => {
  if (baseUrl.endsWith("rpch.tech")) {
    const rpchOpts: RpcProviderOptions = {
      nodeUrl: baseUrl,
    }
    return new RpchProvider(rpchOpts)
  } else {
    return new SequencerProvider({ baseUrl })
  }
})

export function getProvider(network: Network) {
  return getProviderForBaseUrl(network.baseUrl)
}

const getProviderV4ForBaseUrl = memoize((baseUrl: string) => {
  return new SequencerProviderv4({ baseUrl })
})

export function getProviderv4(network: Network) {
  return getProviderV4ForBaseUrl(network.baseUrl)
}

// Create a custom async key-value store for the RPCh SDK
function createAsyncKeyValStore() {
  const store = new Map()

  return {
    async set(key: string, val: string) {
      store.set(key, val)
    },
    async get(key: string) {
      return store.get(key)
    },
  }
}

const store = createAsyncKeyValStore()

const sdk = new SDK(
  {
    crypto: RPChCrypto,
    client: "trial",
    timeout: 20000,
    discoveryPlatformApiEndpoint: "https://staging.discovery.rpch.tech",
  },
  store.set,
  store.get,
)

class RpchProvider extends RpcProvider {
  public fetch(method: any, params: any): Promise<any> {
    return new Promise(() => {
      // sdk.start();
      // const provider = "https://alpha4.starknet.io";
      // const body = JSON.stringify({ method, jsonrpc: "2.0", params, id: 0 });
      // const req = sdk.createRequest(provider, body);
      // const res = sdk.sendRequest(req);
      // sdk.stop();
    })
  }
}
