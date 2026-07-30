import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthContextService } from '../common/auth/auth-context.service';
import { MeController } from './me.controller';

@Global()
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtStrategy, AuthContextService],
  exports: [AuthService, AuthContextService],
})
export class AuthModule {}
