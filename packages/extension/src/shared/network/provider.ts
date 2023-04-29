import * as RPChCrypto from "@rpch/crypto"
import SDK from "@rpch/sdk"
import { memoize } from "lodash-es"
import {
  GatewayError,
  HttpError,
  LibraryError,
  Sequencer,
  SequencerProvider,
  buildUrl,
} from "starknet"
import { SequencerProvider as SequencerProviderv4 } from "starknet4"
import { parse, parseAlwaysAsBig, stringify } from "starknet4/dist/utils/json"
import urljoin from "url-join"

import { Block } from "../../../../../../starknet.js/src/provider/utils"
import { Network } from "./type"

let p: SequencerRpchProvider

const getProviderForBaseUrl = memoize((baseUrl: string) => {
  return new SequencerProvider({ baseUrl })
})

export function getProvider(network: Network) {
  // classic
  if (network.id !== "rpch-goerli-alpha") {
    return getProviderForBaseUrl(network.baseUrl)
  }
  // RPCh
  if (p) {
    return p
  }
  p = new SequencerRpchProvider({ baseUrl: network.baseUrl })
  return p
}

const getProviderV4ForBaseUrl = memoize((baseUrl: string) => {
  return new SequencerProviderv4({ baseUrl })
})

export function getProviderv4(network: Network) {
  console.log("get provider v4")
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

//export type SequencerHttpMethod = 'POST' | 'GET';

class SequencerRpchProvider extends SequencerProvider {
  private sdk: SDK

  constructor(ops: any) {
    super(ops)

    this.sdk = new SDK(
      {
        crypto: RPChCrypto,
        client: "trial",
        timeout: 200000,
        //discoveryPlatformApiEndpoint: "http://34.116.20855:3020",
        discoveryPlatformApiEndpoint: "https://staging.discovery.rpch.tech",
      },
      store.set,
      store.get,
    )

    this.sdk.start()
    this.sdk.debug.enable("rpch:*")
    console.info("SDK init", this.sdk)
  }
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

  private getFetchUrlRpch(endpoint: keyof Sequencer.Endpoints) {
    const gatewayUrlEndpoints = ["add_transaction"]
    return gatewayUrlEndpoints.includes(endpoint)
      ? this.gatewayUrl
      : this.feederGatewayUrl
  }

  private getFetchMethodRpch(endpoint: keyof Sequencer.Endpoints) {
    const postMethodEndpoints = [
      "add_transaction",
      "call_contract",
      "estimate_fee",
      "estimate_message_fee",
      "estimate_fee_bulk",
      "simulate_transaction",
    ]

    return postMethodEndpoints.includes(endpoint) ? "POST" : "GET"
  }

  private isEmptyQueryObjectRpch(obj?: Record<any, any>): obj is undefined {
    return (
      obj === undefined ||
      Object.keys(obj).length === 0 ||
      (Object.keys(obj).length === 1 &&
        Object.entries(obj).every(
          ([k, v]) => k === "blockIdentifier" && v === null,
        ))
    )
  }

  private getQueryStringRpch(query?: Record<string, any>): string {
    if (this.isEmptyQueryObjectRpch(query)) {
      return ""
    }
    const queryString = Object.entries(query)
      .map(([key, value]) => {
        if (key === "blockIdentifier") {
          const block = new Block(value)
          return `${block.queryIdentifier}`
          //return value;
        }
        return `${key}=${value}`
      })
      .join("&")

    return `?${queryString}`
  }

  protected async fetchEndpoint<T extends keyof Sequencer.Endpoints>(
    endpoint: T,
    // typescript type magic to create a nice fitting function interface
    ...[query, request]: Sequencer.Endpoints[T]["QUERY"] extends never
      ? Sequencer.Endpoints[T]["REQUEST"] extends never
        ? [] // when no query and no request is needed, we can omit the query and request parameters
        : [undefined, Sequencer.Endpoints[T]["REQUEST"]]
      : Sequencer.Endpoints[T]["REQUEST"] extends never
      ? [Sequencer.Endpoints[T]["QUERY"]] // when no request is needed, we can omit the request parameter
      : [Sequencer.Endpoints[T]["QUERY"], Sequencer.Endpoints[T]["REQUEST"]] // when both query and request are needed, we cant omit anything
  ): Promise<Sequencer.Endpoints[T]["RESPONSE"]> {
    const baseUrl = this.getFetchUrlRpch(endpoint)
    const method = this.getFetchMethodRpch(endpoint)
    const queryString = this.getQueryStringRpch(query)
    const url = urljoin(baseUrl, endpoint, queryString)

    if (endpoint === "add_transaction") {
      return this.fetchRpch(url, {
        method,
        body: request,
      })
    } else {
      return this.fetch(url, {
        method,
        body: request,
      })
    }
  }

  private getHeadersRpch(
    method: "GET" | "POST",
  ): Record<string, string> | undefined {
    if (method === "POST") {
      return {
        "Content-Type": "application/json",
        ...this.headers,
      }
    }
    //@ts-expect-error err
    return this.headers
  }

  public async fetchRpch(
    endpoint: string,
    options?: {
      method?: "GET" | "POST"
      body?: any
      parseAlwaysAsBigInt?: boolean
    },
  ): Promise<any> {
    const url = buildUrl(this.baseUrl, "", endpoint)
    const method = options?.method ?? "GET"
    const headers = this.getHeadersRpch(method)
    const body = stringify(options?.body)

    let response: Response
    try {
      const rpchReq = await this.sdk.createRequest(url, body)
      // @ts-expect-error err
      response = await this.sdk.sendRequest(rpchReq)

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

  public async fetch(
    endpoint: string,
    options?: {
      method?: "GET" | "POST"
      body?: any
      parseAlwaysAsBigInt?: boolean
    },
  ): Promise<any> {
    const url = buildUrl(this.baseUrl, "", endpoint)
    const method = options?.method ?? "GET"
    const headers = this.getHeadersRpch(method)
    const body = stringify(options?.body)
    try {
      const response = await fetch(url, {
        method,
        body,
        headers,
      })
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
