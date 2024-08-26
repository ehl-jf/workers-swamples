import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

const MANDATORY_PROPERTIES = ['company.prop1', 'company.prop2'];


export default async (context: PlatformContext, data: BeforeUploadRequest): Promise<BeforeUploadResponse> => {
    let status: UploadStatus = UploadStatus.UPLOAD_PROCEED;
    let message: string = 'Proceed';

    try {

        // We should only intercept the docker image's manifest, as for the same image there are multiple layers.
        // And only the manifest contains annotations and labels
        if (data.metadata.repoPath.path.match(/^.*manifest.json$/g)) {

            // We check if the manifest contains all the required properties
            const missingProperties = lookForMissingMandatoryProperties(data);
            if (missingProperties.length > 0) {
                // We stop the upload with an error message if mandatory properties are missing
                status = UploadStatus.UPLOAD_STOP;
                message = `The following properties are missing: ${missingProperties.join(', ')}`;

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

function lookForMissingMandatoryProperties(data: BeforeUploadRequest): Array<string> {
    const missingProperties = [];
    for (const prop of MANDATORY_PROPERTIES) {
        if (!getArtifactProperty(data, `docker.label.${prop}`)) {
            missingProperties.push(prop);
        }
    }
    return missingProperties;
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