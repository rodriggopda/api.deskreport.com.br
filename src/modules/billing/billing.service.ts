import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async getSubscriptionForOrg(organizationId: string) {
    return (this.prisma as any).subscription.findFirst({
      where: { organizationId },
    });
  }

  async updateSubscription(organizationId: string, data: any) {
    return (this.prisma as any).subscription.update({
      where: { organizationId },
      data,
    });
  }

  async proRataCalculation(currentUsers: number, newUsers: number, billingCycleDays: number, remainingDays: number) {
    const diff = newUsers - currentUsers;
    const pricePerUser = 20; // Example price
    return (diff * pricePerUser * remainingDays) / billingCycleDays;
  }
}
