import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

const PROJECT_KEY_LABEL = 'org.jfrog.artifactory.projectKey';

export default async (context: PlatformContext, data: BeforeUploadRequest): Promise<BeforeUploadResponse> => {
    let status: UploadStatus = UploadStatus.UPLOAD_PROCEED;
    let message: string = 'Proceed';

    try {

        // We should only intercept the docker image's manifest, as for the same image there are multiple layers.
        // And only the manifest contains annotations and labels
        if (isDockerManifest(data)) {
            const projectKey = getProjectKeyFromManifest(data);

            if (!projectKey) {
                status = UploadStatus.UPLOAD_STOP;
                message = `The project key is missing. Please add the label ${PROJECT_KEY_LABEL} to the manifest.`;
            } else if (!isProjectRepository(data, projectKey)) {
                // We stop the upload which to be targeting a project repository
                status = UploadStatus.UPLOAD_STOP;
                message = `Not targetting a project '${projectKey}' repository`;

                // We do a cleanup of the previously uploaded layers
                await removePreviouslyUploadedLayers(context, data);
            }
        }
    } catch (x) {
        status = UploadStatus.UPLOAD_WARN;
        message = `Error: ${x.message}`;
    }

    return { status, message, modifiedRepoPath: data.metadata.repoPath };
}

function isDockerManifest(data: BeforeUploadRequest): boolean {
    return data.metadata.repoPath.path.match(/^.*manifest.json$/g) !== null;
}

function getProjectKeyFromManifest(data: BeforeUploadRequest): string {
    return getArtifactProperty(data, `docker.label.${PROJECT_KEY_LABEL}`);
}

function isProjectRepository(data: BeforeUploadRequest, projectKey: string): boolean {
    return new RegExp(`${projectKey}-.+`).test(data.metadata.repoPath.key);
}

async function removePreviouslyUploadedLayers(context: PlatformContext, data: BeforeUploadRequest): Promise<void> {
    const repoName = getArtifactProperty(data, 'docker.repoName');
    const repoKey = data.metadata.repoPath.key;

    // As layers can be shared by several manifests, we should only cleanup if there are no other manifests using the same layers
    const deployedVersions = await findDeployedVersions(context, repoKey, repoName);

    if (!deployedVersions.length) {
        await deleteArtifact(context, repoKey, repoName);
    }
}

async function findDeployedVersions(context: PlatformContext, repoKey: string, repoName: string, limit = 2): Promise<Array<any>> {
    // Name filter
    const nameFilter = `"name":{"$match":"*manifest.json"}`;
    // Path filter
    const pathFilter = `"path":{"$match":"${repoName}/*"}`;
    // Items repos
    const reposFilter = `"repo":{"$eq":"${repoKey}"}`;

    let query = `items.find({${nameFilter},${reposFilter},${pathFilter}})`
    query = `${query}.include("path")`;
    query = `${query}.limit(${limit})`;

    const versions = await runAql(context, query);

    console.log(`Found ${versions.length} versions for ${repoKey}/${repoName}`);

    return versions;
}

function getArtifactProperty(data: BeforeUploadRequest, property: string): any {
    const [value] = data.artifactProperties[property]?.value || [];
    return value;
}

async function runAql(context: PlatformContext, query: string) {
    console.log(`Running AQL: ${query}`)
    try {
        const queryResponse = await context.clients.platformHttp.post(
            '/artifactory/api/search/aql',
            query,
            {
                'Content-Type': 'text/plain'
            });
        return (queryResponse.data.results || []) as Array<any>;
    } catch (x) {
        console.log(`AQL query failed: ${x.message}`);
    }
    return [];
}

async function deleteArtifact(context: PlatformContext, repoKey: string, repoName: string): Promise<void> {
    console.log(`Deleting ${repoKey}/${repoName}`);
    await context.clients.platformHttp.delete(`/artifactory/${repoKey}/${repoName}`);
}