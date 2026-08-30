export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}
