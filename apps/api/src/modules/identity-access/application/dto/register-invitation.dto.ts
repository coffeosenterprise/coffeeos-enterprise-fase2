import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;
}

export class ActivateInvitationDto {
  @IsString()
  token!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
