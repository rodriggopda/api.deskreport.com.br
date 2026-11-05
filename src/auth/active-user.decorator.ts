import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth';

export const ActiveUser = createParamDecorator(
    async (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();

        const session = await auth.api.getSession({
            headers: request.headers
        });

        if (!session) {
            throw new UnauthorizedException('User session is missing or invalid.');
        }

        return session.user.id;
    },
);
