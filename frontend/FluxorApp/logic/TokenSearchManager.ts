import { Token, TokenDeployment } from './Token';

interface BackendTokenResponse {
  id?: string;
  source?: string;
  chainId?: number;
  contractAddress?: string;
  name?: string;
  symbol?: string;
  price?: number;
  changePercent?: number;
  imageName?: string;
}

class TokenSearchManager {
  private static instance: TokenSearchManager;
  private readonly backendURL = "https://fluxor-backend-ouwq.onrender.com/api/search";

  private constructor() {}

  // Singleton instance
  public static get shared(): TokenSearchManager {
    if (!TokenSearchManager.instance) {
      TokenSearchManager.instance = new TokenSearchManager();
    }
    return TokenSearchManager.instance;
  }

  public async searchToken(contractAddress: string): Promise<Token | null> {
    try {
      const url = new URL(this.backendURL);
      url.searchParams.append("address", contractAddress);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        }
      });

      if (!response.ok) {
        console.error(`❌ Server returned error: ${response.status}`);
        return null;
      }

      const backendData: BackendTokenResponse = await response.json();

      const finalID = backendData.id ?? backendData.contractAddress ?? contractAddress;

      const deployment: TokenDeployment = {
        chainId: backendData.chainId ?? 0,
        chainName: "Unknown",
        liquidityUsd: 0,
        address: backendData.contractAddress ?? contractAddress,
        decimals: 18
      };

      console.log(`✅ [React Native] Found Token: ${backendData.symbol ?? "Unknown"}`);

      return {
        id: finalID,
        name: backendData.name ?? "Unknown",
        symbol: backendData.symbol ?? "UNK",
        logo: backendData.imageName ?? "questionmark.circle",
        deployments: [deployment],
        native_identifier: null,
        decimal: 18,
        price: backendData.price ?? 0.0,
        changePercent: backendData.changePercent ?? 0.0,
      };

    } catch (error) {
      console.error(`❌ [React Native] Search Network/Decoding Error:`, error);
      return null;
    }
  }
}

export default TokenSearchManager;