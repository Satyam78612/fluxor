export interface TokenDeployment {
  chainId: number;
  chainName: string;
  liquidityUsd?: number | null;
  address: string;
  decimals: number;
}

export interface Token {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  deployments?: TokenDeployment[] | null;
  native_identifier?: string | null;
  decimal?: number | null;
  price?: number;
  changePercent?: number;
  image?: any; 
}

export const getTokenContractAddress = (token: Token): string => {
  if (token.native_identifier && token.native_identifier !== "0x0000000000000000000000000000000000000000") {
    return token.native_identifier;
  }
  return token.deployments?.[0]?.address ?? "";
};

export const isNativeToken = (token: Token): boolean => {
  return !!token.native_identifier && (!token.deployments || token.deployments.length === 0);
};