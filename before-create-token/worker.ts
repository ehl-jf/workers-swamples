import { PlatformContext, BeforeCreateTokenRequest, BeforeCreateTokenResponse, CreateTokenStatus } from 'jfrog-workers';

// The maximum number of tokens a user can have
const MAX_TOKENS_PER_USERS = 10;

export default async (context: PlatformContext, data: BeforeCreateTokenRequest): Promise<BeforeCreateTokenResponse> => {

    let status: CreateTokenStatus = CreateTokenStatus.CREATE_TOKEN_PROCEED;
    let message: string = 'Proceed';

    try {
        const subjectNumberOfTokens = await countUserTokens(context, data.tokenSpec.subject);
        if (subjectNumberOfTokens >= MAX_TOKENS_PER_USERS) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `The user already has ${subjectNumberOfTokens} tokens. The maximum number of tokens allowed per user is ${MAX_TOKENS_PER_USERS}.`;
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