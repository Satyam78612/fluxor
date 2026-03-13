export interface FearAndGreedData {
  value: string;
  value_classification: string;
  timestamp: string;
}

export interface FearAndGreedResponse {
  name: string;
  data: FearAndGreedData[];
}