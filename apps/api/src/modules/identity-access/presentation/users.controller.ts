import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from '../application/user.service';
import {
  InviteUserDto,
  ActivateInvitationDto,
} from '../application/dto/register-invitation.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { isSensitiveEnvironment } from '../../../common/config/environment';
import type { AccessTokenPayload } from '../../../common/auth/jwt.types';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Post('invite')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  async invite(
    @Body() dto: InviteUserDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    const result = await this.userService.invite(
      dto.email,
      dto.roleId,
      req.user.sub,
    );

    // Fase 1, correccion #11: el token de invitacion NUNCA se expone
    // en la respuesta HTTP en Staging/Production -- ahi su entrega
    // real es responsabilidad de Notifications (fuera de alcance de
    // esta fase). En Local/Development/Testing se expone para poder
    // probar el flujo de extremo a extremo sin ese modulo todavia.
    if (isSensitiveEnvironment()) {
      return { invited: true };
    }
    return result;
  }

  @Post('activate')
  activate(@Body() dto: ActivateInvitationDto) {
    return this.userService.activate(dto.token, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
    });
  }

  @Post(':id/block')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  block(
    @Param('id') id: string,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.userService.block(id, req.user.sub);
  }
}
