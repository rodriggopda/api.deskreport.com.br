import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

export const ActiveOrg = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest<Request>();

        // Attempt to get the organization ID from headers or cookies
        const orgId =
            request.headers['x-organization-id'] ||
            request.cookies?.['better-auth.active_organization'];

        if (!orgId) {
            throw new UnauthorizedException('Organization context is missing. Please provide x-organization-id header or better-auth.active_organization cookie.');
        }

        return orgId as string;
    },
);
