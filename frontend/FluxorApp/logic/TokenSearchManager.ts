import { Token, TokenDeployment } from './Token';

interface TokenMetadataResponse {
    chainId?: number;
    contractAddress?: string;
    name?: string;
    symbol?: string;
    price?: number;
    decimals?: number;
    changePercent?: number;
    imageUrl?: string;
    source?: string;
}

class TokenSearchManager {
    private static instance: TokenSearchManager;
    private readonly baseURL = "https://fluxor-backend-ouwq.onrender.com";

    private constructor() {}

    public static get shared(): TokenSearchManager {
        if (!TokenSearchManager.instance) {
            TokenSearchManager.instance = new TokenSearchManager();
        }
        return TokenSearchManager.instance;
    }

    public async searchByContract(address: string): Promise<Token | null> {
        try {
            const url = new URL(`${this.baseURL}/api/token/metadata`);
            url.searchParams.append("address", address);

            const response = await fetch(url.toString());
            if (!response.ok) return null;

            const data: TokenMetadataResponse = await response.json();
            return this.toToken(data, address);
        } catch (error) {
            console.error("❌ Contract search error:", error);
            return null;
        }
    }

    public async searchByName(query: string): Promise<Token[]> {
        try {
            const url = new URL(`${this.baseURL}/api/token/search`);
            url.searchParams.append("query", query);

            const response = await fetch(url.toString());
            if (!response.ok) return [];

            const data: TokenMetadataResponse[] = await response.json();
            return data.map(item => this.toToken(item, item.contractAddress ?? ''));
        } catch (error) {
            console.error("❌ Name search error:", error);
            return [];
        }
    }

    private toToken(data: TokenMetadataResponse, fallbackAddress: string): Token {
        const address = data.contractAddress ?? fallbackAddress;
        const actualDecimals = data.decimals ?? 18;
        const deployment: TokenDeployment = {
            chainId: data.chainId ?? 0,
            chainName: "Unknown",
            liquidityUsd: 0,
            address,
            decimals: actualDecimals,
        };
        return {
            id: address,
            name: data.name ?? "Unknown",
            symbol: data.symbol ?? "???",
            logo: data.imageUrl ?? "",
            deployments: [deployment],
            native_identifier: null,
            decimal: actualDecimals,
            price: data.price ?? 0,
            changePercent: data.changePercent ?? 0,
        };
    }
}

export default TokenSearchManager;