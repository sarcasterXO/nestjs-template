export const escapeRegex = (str: string) => str.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&').replaceAll('-', '\\x2d');

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const;
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'xlsx', 'xls'] as const;
const IMAGE_EXT_PATTERN = IMAGE_EXTENSIONS.join('|');
const DOCUMENT_EXT_PATTERN = DOCUMENT_EXTENSIONS.join('|');
export const S3ImageUploadRegex = new RegExp(`\\.(?<ext>${IMAGE_EXT_PATTERN})$`, 'i');
export const S3DocumentUploadRegex = new RegExp(`\\.(?<ext>${DOCUMENT_EXT_PATTERN})$`, 'i');
export const S3CommonUploadRegex = new RegExp(`\\.(?<ext>${IMAGE_EXT_PATTERN}|${DOCUMENT_EXT_PATTERN})$`, 'i');
