export type SessionTokenType = 'access' | 'refresh';

export interface SessionTokenPayload {
  sub: string;
  sessionId: string;
  tokenType: SessionTokenType;
}
