import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hashing de contraseñas con Argon2id (decidido en Libro 04, cap. 03).
 */
@Injectable()
export class PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword);
  }
}
