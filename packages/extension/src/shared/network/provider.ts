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

class RpchProvider extends RpcProvider {
  public fetch(method: any, params: any): Promise<any> {
    return fetch(this.nodeUrl, {
      method: "POST",
      body: JSON.stringify({ method, jsonrpc: "2.0", params, id: 0 }),
      headers: this.headers as Record<string, string>,
    })
  }
}
