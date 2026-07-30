export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  requiresAuth?: boolean;
  body?: Record<string, unknown>;
}

export interface TestResult {
  status: 'success' | 'error' | 'loading';
  data?: any;
  error?: string;
  latency?: number;
}

export interface HistoryItem {
  timestamp: string;
  request: { url: string; method: string; headers: Record<string, string>; body?: string };
  response: any;
  status: 'success' | 'error';
  latency: number;
}

export interface EnvironmentVars {
  baseUrl: string;
  authToken: string;
}

export interface TabData {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body: string;
  headers: string;
  result: TestResult;
  history: HistoryItem[];
}
