/**
 * API Documentation Types
 */

export interface ApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  type: string;
  description: string;
  example?: string;
}

export interface ApiRequestBody {
  contentType: string;
  schema: Record<string, any>;
  example?: Record<string, any>;
}

export interface ApiResponse {
  status: number;
  description: string;
  example: Record<string, any>;
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  path: string;
  summary: string;
  description: string;
  permissions: string[];
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
  curlExample: string;
  jsExample: string;
}

export interface ApiEndpointGroup {
  title: string;
  description: string;
  endpoints: ApiEndpoint[];
}
