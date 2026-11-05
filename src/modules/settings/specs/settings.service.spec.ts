import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from '../settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsappManagerAdapter } from '../../../adapters/whatsapp-manager-adapter';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

const mockWhatsappManagerApi = {
  createInstance: jest.fn(),
  getInstanceInfo: jest.fn(),
  scanQrcode: jest.fn(),
  connectInstance: jest.fn(),
  restartInstance: jest.fn(),
};

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;
  let whatsappApi: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WhatsappManagerAdapter,
          useValue: mockWhatsappManagerApi,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService);
    whatsappApi = module.get(WhatsappManagerAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('linkManualMember', () => {
    it('should link a member if not already linked', async () => {
      const orgId = 'org-1';
      const userId = 'user-1';
      const role = 'admin';

      prisma.member.findUnique.mockResolvedValue(null);
      prisma.member.create.mockResolvedValue({ organizationId: orgId, userId, role });

      const result = await service.linkManualMember(orgId, userId, role);

      expect(prisma.member.findUnique).toHaveBeenCalled();
      expect(prisma.member.create).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.member.userId).toBe(userId);
    });

    it('should return existing member if already linked', async () => {
      const orgId = 'org-1';
      const userId = 'user-1';
      const role = 'admin';
      const existingMember = { organizationId: orgId, userId, role };

      prisma.member.findUnique.mockResolvedValue(existingMember);

      const result = await service.linkManualMember(orgId, userId, role);

      expect(prisma.member.findUnique).toHaveBeenCalled();
      expect(prisma.member.create).not.toHaveBeenCalled();
      expect(result.message).toBe("Membro já vinculado");
    });
  });

  describe('Permission Profiles', () => {
    it('should create a permission profile', async () => {
      const orgId = 'org-1';
      const name = 'Manager';
      const permissions = ['read', 'write'];

      prisma.permissionProfile.create.mockResolvedValue({ id: 'p1', name, permissions });

      const result = await service.createPermissionProfile(orgId, name, permissions);

      expect(prisma.permissionProfile.create).toHaveBeenCalledWith({
        data: { organizationId: orgId, name, permissions }
      });
      expect(result.id).toBe('p1');
    });
  });
});
