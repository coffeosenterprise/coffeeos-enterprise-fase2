import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../application/auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ManualVerificationCodeDto,
} from '../application/dto/auth.dto';
import { UserService } from '../application/user.service';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { shouldExposeDevelopmentSecrets } from '../../../common/config/environment';
import type { AccessTokenPayload } from '../../../common/auth/jwt.types';
import { EmailVerificationService } from '../application/email-verification.service';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.tenantSlug, dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Post('email/verify')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerificationService.verify(
      dto.tenantSlug,
      dto.email,
      dto.code,
    );
  }

  @Post('email/resend')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.emailVerificationService.resend(dto.tenantSlug, dto.email);
  }

  @Post('email/manual-code')
  manualVerificationCode(
    @Body() dto: ManualVerificationCodeDto,
    @Req() req: Request,
  ) {
    const configuredKey = process.env.MANUAL_VERIFICATION_KEY;
    const providedKey = req.headers['x-manual-verification-key'];
    if (
      !configuredKey ||
      typeof providedKey !== 'string' ||
      providedKey !== configuredKey
    ) {
      throw new ForbiddenException('Acceso no autorizado');
    }
    return this.emailVerificationService.issueManualCode(
      dto.tenantSlug,
      dto.email,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.authService.logout(req.user.sub);
  }

  // Deliberadamente SIN JwtAuthGuard (Fase 1, correccion #3): el
  // Access Token puede estar (y tipicamente esta) expirado cuando
  // se llama a este endpoint. El propio refresh token resuelve el
  // Tenant y el usuario -- ver AuthService.refresh().
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('password/recovery')
  async requestReset(@Body() dto: RequestPasswordResetDto) {
    const result = await this.userService.requestPasswordReset(
      dto.tenantSlug,
      dto.email,
    );
    if (!shouldExposeDevelopmentSecrets()) {
      return { requested: true };
    }
    return result;
  }

  @Post('password/reset')
  reset(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.userService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
