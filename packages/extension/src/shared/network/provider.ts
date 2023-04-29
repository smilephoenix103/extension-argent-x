import * as RPChCrypto from "@rpch/crypto"
import SDK from "@rpch/sdk"
import { memoize } from "lodash-es"
import {
  GatewayError,
  HttpError,
  LibraryError,
  SequencerProvider,
  buildUrl,
} from "starknet"
import { SequencerProvider as SequencerProviderv4 } from "starknet4"
import { parse, parseAlwaysAsBig, stringify } from "starknet4/dist/utils/json"

import { Network } from "./type"

const getProviderForBaseUrl = memoize((baseUrl: string) => {
  if (baseUrl.endsWith("rpch.tech")) {
    return new SequencerRpchProvider({ baseUrl })
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
    timeout: 2000,
    discoveryPlatformApiEndpoint: "http://34.116.20855:3020",

    // discoveryPlatformApiEndpoint: "https://staging.discovery.rpch.tech",
  },
  store.set,
  store.get,
)

class SequencerRpchProvider extends SequencerProvider {
  // public fetch(method: any, params: any): Promise<any> {
  //   return new Promise(() => {
  //     // sdk.start();
  //     // const provider = "https://alpha4.starknet.io";
  //     // const body = JSON.stringify({ method, jsonrpc: "2.0", params, id: 0 });
  //     // const req = sdk.createRequest(provider, body);
  //     // const res = sdk.sendRequest(req);
  //     // sdk.stop();
  //   })
  // }

  public async fetch(
    endpoint: string,
    options?: {
      method?: "POST" | "GET"
      body?: any
      parseAlwaysAsBigInt?: boolean
    },
  ): Promise<any> {
    const url = buildUrl(this.baseUrl, "", endpoint)
    const method = options?.method ?? "GET"
    // @ts-expect-error err
    const headers = this.getHeaders(method)

    let response: Response

    try {
      if (method === "GET") {
        const body = stringify(options?.body)
        response = await fetch(url, {
          method,
          body,
          headers,
        })
      } else {
        await sdk.start()
        const rpchReq = await sdk.createRequest(url, stringify(options?.body))
        // @ts-expect-error err
        response = await sdk.sendRequest(rpchReq)
        await sdk.stop()
      }

      const textResponse = await response.text()

      if (!response.ok) {
        // This will allow the user to handle contract errors
        let responseBody: any
        try {
          responseBody = parse(textResponse)
        } catch {
          throw new HttpError(response.statusText, response.status)
        }
        throw new GatewayError(responseBody.message, responseBody.code)
      }

      const parseChoice = options?.parseAlwaysAsBigInt
        ? parseAlwaysAsBig
        : parse
      return parseChoice(textResponse)
    } catch (error) {
      if (error instanceof Error && !(error instanceof LibraryError)) {
        throw Error(
          `Could not ${method} from endpoint \`${url}\`: ${error.message}`,
        )
      }

      throw error
    }
  }
}
