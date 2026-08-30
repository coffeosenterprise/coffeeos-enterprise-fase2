import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class RequestPasswordResetDto {
  @IsString()
  tenantSlug!: string;

  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResendVerificationDto {
  @IsString()
  tenantSlug!: string;

  @IsEmail()
  email!: string;
}
