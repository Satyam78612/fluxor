export interface DominancePayload {
    btc_dominance: number;
    eth_dominance: number;
}

export interface FearAndGreedPayload {
    value: string;
    value_classification: string;
    timestamp: string;
}

export interface MarketMetricsResponse {
    fearAndGreed: FearAndGreedPayload | null;
    dominance: DominancePayload | null;
}