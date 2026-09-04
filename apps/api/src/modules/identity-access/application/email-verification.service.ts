import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { TenantRepository } from '../../tenant-subscription/infrastructure/tenant.repository';
import { EmailService } from '../../../common/email/email.service';
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyCodeHash,
} from '../../../common/security/verification-code';
import { runWithTenantContext } from '../../../common/tenant/tenant-context';
import { shouldExposeDevelopmentSecrets } from '../../../common/config/environment';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRepository: TenantRepository,
    private readonly emailService: EmailService,
  ) {}

  async verify(tenantSlug: string, email: string, code: string) {
    const tenant = await this.tenantRepository.findBySlug(tenantSlug);
    if (!tenant) throw new BadRequestException('Codigo de verificacion invalido');

    return runWithTenantContext(
      { tenantId: tenant.id, correlationId: randomUUID() },
      () =>
        this.prisma.withTenantContext(async (tx) => {
          const user = await tx.user.findFirst({
            where: { email, deletedAt: null },
          });
          if (!user || user.status !== 'pending_verification') {
            throw new BadRequestException('Codigo de verificacion invalido');
          }

          const verification = await tx.emailVerification.findFirst({
            where: { userId: user.id, verifiedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          if (!verification || verification.expiresAt <= new Date()) {
            throw new BadRequestException(
              'El codigo vencio. Solicita uno nuevo.',
            );
          }
          if (verification.attempts >= 5) {
            throw new HttpException(
              'Demasiados intentos. Solicita un codigo nuevo.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          if (!verifyCodeHash(code, verification.codeHash)) {
            await tx.emailVerification.update({
              where: { id: verification.id },
              data: { attempts: { increment: 1 } },
            });
            throw new BadRequestException('Codigo de verificacion invalido');
          }

          const now = new Date();
          await tx.emailVerification.update({
            where: { id: verification.id },
            data: { verifiedAt: now },
          });
          await tx.user.update({
            where: { id: user.id },
            data: { status: 'active' },
          });
          await (tx as unknown as PrismaClient).tenant.update({
            where: { id: tenant.id },
            data: { status: 'active' },
          });
          await tx.auditLog.create({
            data: {
              tenantId: tenant.id,
              actorId: user.id,
              action: 'EMAIL_VERIFIED',
              entity: 'user',
              entityId: user.id,
            },
          });
          return { verified: true };
        }),
    );
  }

  async resend(tenantSlug: string, email: string) {
    const tenant = await this.tenantRepository.findBySlug(tenantSlug);
    if (!tenant) return { sent: true };

    const result = await runWithTenantContext(
      { tenantId: tenant.id, correlationId: randomUUID() },
      () =>
        this.prisma.withTenantContext(async (tx) => {
          const user = await tx.user.findFirst({
            where: { email, status: 'pending_verification', deletedAt: null },
          });
          if (!user) return null;

          const latest = await tx.emailVerification.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
          });
          if (
            latest &&
            Date.now() - latest.createdAt.getTime() < 60_000
          ) {
            throw new HttpException(
              'Espera un minuto antes de solicitar otro codigo.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          const code = generateVerificationCode();
          await tx.emailVerification.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              codeHash: hashVerificationCode(code),
              expiresAt: new Date(Date.now() + 15 * 60_000),
            },
          });
          return { code, businessName: tenant.name };
        }),
    );

    if (result) {
      await this.emailService.sendVerificationCode({
        email,
        businessName: result.businessName,
        code: result.code,
      });
    }
    return {
      sent: true,
      ...(shouldExposeDevelopmentSecrets() && result
        ? { developmentCode: result.code }
        : {}),
    };
  }
}
