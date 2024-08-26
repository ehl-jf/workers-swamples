import { PlatformContext, BeforePropertyCreateRequest, BeforePropertyCreateResponse, BeforePropertyCreateStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforePropertyCreateRequest): Promise<BeforePropertyCreateResponse> => {
    if (isAdmin(data)) {
        return {
            message: "Permission granted to admin",
            status: BeforePropertyCreateStatus.BEFORE_PROPERTY_CREATE_PROCEED
        };
    }

    return {
        message: "Only admins are allowed to create properties",
        status: BeforePropertyCreateStatus.BEFORE_PROPERTY_CREATE_STOP
    }
};

function isAdmin(data: BeforePropertyCreateRequest): boolean {
    return data.userContext.id.endsWith("/users/admin");
}