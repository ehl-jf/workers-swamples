import { PlatformContext, BeforeCreateTokenRequest, BeforeCreateTokenResponse, CreateTokenStatus } from 'jfrog-workers';

// The maximum number of tokens a user can have
const MAX_TOKENS_PER_USERS = 10;
const MAX_USER_TOKEN_EXPIRY = 31 * 24 * 60 * 60; // 1 month
const MAX_SERVICE_TOKEN_EXPIRY = 365 * 24 * 60 * 60; // 1 year

export default async (context: PlatformContext, data: BeforeCreateTokenRequest): Promise<BeforeCreateTokenResponse> => {

    let status: CreateTokenStatus = CreateTokenStatus.CREATE_TOKEN_PROCEED;
    let message: string = 'Proceed';

    try {
        if (await subjectTokensCountExceedsMaximum(context, data.tokenSpec.subject)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `The maximum number of tokens per user (${MAX_TOKENS_PER_USERS}) has been reached.`;
        }

        else if (isUserToken(data) && tokenExpiryExceeds(data, MAX_USER_TOKEN_EXPIRY)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `Users tokens cannot exceed ${MAX_USER_TOKEN_EXPIRY} seconds.`;
        }

        else if (isServiceToken(data) && tokenExpiryExceeds(data, MAX_SERVICE_TOKEN_EXPIRY)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `Service tokens cannot exceed ${MAX_SERVICE_TOKEN_EXPIRY} seconds.`;
        }
    } catch (error) {
        // The platformHttp client throws PlatformHttpClientError if the HTTP request status is 400 or higher
        status = CreateTokenStatus.CREATE_TOKEN_WARN;
        message = 'Cannot verify the number of tokens.';
        console.error(`Request failed with status code ${error.status || '<none>'} caused by : ${error.message}`);
    }

    return { status, message };
};

async function countUserTokens(context: PlatformContext, subject: string): Promise<number> {
    // We retrieve the list of tokens managed by the user that's triggering the token creation
    const res = await context.clients.platformHttp.get('/access/api/v1/tokens');

    if (res.status !== 200) {
        console.warn(`Cannot fetch tokens. The request is successful but returned status other than 200. Status code : ${res.status}`);
        return 0;
    }

    const { tokens } = res.data;
    return tokens?.filter((token) => token.subject === subject).length || 0;
}

async function subjectTokensCountExceedsMaximum(context: PlatformContext, subject: string): Promise<boolean> {
    return await countUserTokens(context, subject) + 1 >= MAX_TOKENS_PER_USERS;
}

function isUserToken(data: BeforeCreateTokenRequest) {
    const [scope] = data.tokenSpec.scope;
    return scope && scope === 'applied-permissions/user';
}

function isServiceToken(data: BeforeCreateTokenRequest) {
    if (isUserToken(data)) {
        return false;
    }
    const subject = data.tokenSpec.subject;
    return subject && (/^[^/]+\/nodes\/[^/]+$/.test(subject) || !subject.include('/'));
}

function tokenExpiryExceeds(data: BeforeCreateTokenRequest, maxExpiry: number) {
    return data.tokenSpec.expiry > maxExpiry;
}