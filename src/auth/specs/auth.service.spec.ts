import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';

// Mock the auth object imported in auth.service
jest.mock('../auth', () => ({
  auth: {
    signUp: {
      email: jest.fn(),
    },
    forgetPassword: jest.fn(),
    verifyEmail: jest.fn(),
  },
}));

import { auth } from '../auth';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call signup email on auth client', async () => {
    const email = 'test@example.com';
    const password = 'pass';
    const name = 'test';
    
    (auth as any).signUp.email.mockResolvedValue({ user: { id: 'u1' } });

    const result = await service.signup(email, password, name);

    expect(auth.signUp.email).toHaveBeenCalledWith({ email, password, name });
    expect(result.user.id).toBe('u1');
  });

  it('should call forgotPassword on auth client', async () => {
    const email = 'test@example.com';
    (auth as any).forgetPassword.mockResolvedValue({ status: true });

    const result = await service.forgotPassword(email);

    expect(auth.forgetPassword).toHaveBeenCalledWith({
      email,
      redirectTo: '/reset-password',
    });
    expect(result.status).toBe(true);
  });
});
