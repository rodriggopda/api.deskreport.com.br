import { Injectable } from '@nestjs/common';
import { auth } from './auth';

@Injectable()
export class AuthService {
  async signup(email: string, password: string, name: string) {
    // This would typically call the better-auth client
    // For now we simulate/wrap it
    return (auth as any).signUp.email({
      email,
      password,
      name,
    });
  }

  async forgotPassword(email: string) {
    return (auth as any).forgetPassword({
      email,
      redirectTo: '/reset-password',
    });
  }

  async verifyEmail(token: string) {
    return (auth as any).verifyEmail({
      query: { token }
    });
  }
}
