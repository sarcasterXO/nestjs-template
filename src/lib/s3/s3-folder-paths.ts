import process from 'node:process';

export const S3FolderPaths = {
	users: 'users',
} as const;

/**
 * Type representing all possible S3 folder paths
 */
export type S3FolderPath = (typeof S3FolderPaths)[keyof typeof S3FolderPaths] | (string & {});

/**
 * Keys live under `app/<env>/`, following NODE_ENV like the database name, so an environment's objects pair with its data.
 */
export function getS3EnvPrefix(): string {
	return process.env.NODE_ENV === 'production' ? 'app/production/' : 'app/development/';
}

/**
 * Utility function to format a folder path
 * Ensures that the path ends with a forward slash, unless it's empty
 */
export function formatFolderPath(folderPath: S3FolderPath): string {
	if (!folderPath) return '';
	return folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
}
