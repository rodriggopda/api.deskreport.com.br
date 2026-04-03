export class PrismaServiceMock {
  notification = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
  integration = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  subscription = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
  project = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
  task = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  };
  taskComment = {
    create: jest.fn(),
  };
  team = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
  teamMember = {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  };
  member = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
  permissionProfile = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  projectTeam = {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  };
  user = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  };
  organization = {
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  };
  company = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
}
