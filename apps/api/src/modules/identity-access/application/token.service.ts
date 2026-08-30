import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import type { AccessTokenPayload } from '../../../common/auth/jwt.types';
import { encodeCompositeToken } from '../../../common/tenant/tenant-context';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutos (Libro 04, cap. 03)
const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * El refresh token es un token compuesto (`tenantId.secreto`, ver
 * ADR-019): el propio token dice a que Tenant pertenece, por lo que
 * /auth/refresh puede resolverlo SIN depender de un Access Token
 * valido (Fase 1, correccion #3) -- ese es precisamente el caso de
 * uso que el refresh token existe para cubrir (el Access Token ya
 * expiro). Solo el secreto (48 bytes aleatorios) protege la sesion;
 * el tenantId en claro no es informacion sensible.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  generateRefreshToken(tenantId: string): {
    token: string;
    hash: string;
    expiresAt: Date;
  } {
    const secret = randomBytes(48).toString('hex');
    const token = encodeCompositeToken(tenantId, secret);
    const hash = this.hashRefreshSecret(secret);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    return { token, hash, expiresAt };
  }

  hashRefreshSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
