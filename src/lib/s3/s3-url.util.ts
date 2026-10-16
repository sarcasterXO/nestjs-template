const isCacheVersionParam = (part: string) => {
	const key = part.split('=')[0] ?? '';
	if (key === 'v') return true;
	try {
		return decodeURIComponent(key) === 'v';
	} catch {
		return false;
	}
};

export const canonicalAttachmentUrl = (url: string): string => {
	const withoutHash = url.trim().split('#')[0] ?? '';
	const questionIndex = withoutHash.indexOf('?');
	if (questionIndex === -1) return withoutHash;

	const base = withoutHash.slice(0, questionIndex);
	const rest = withoutHash
		.slice(questionIndex + 1)
		.split('&')
		.filter((part) => part.length > 0 && !isCacheVersionParam(part));

	return rest.length > 0 ? `${base}?${rest.join('&')}` : base;
};

export const withAttachmentUrlVersion = (url: string, version: string | number): string =>
	`${canonicalAttachmentUrl(url)}?v=${encodeURIComponent(String(version))}`;

export const s3UrlToKey = (url: string): string => {
	const path = (canonicalAttachmentUrl(url).split('?')[0] ?? '').split('/').slice(3).join('/');
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
};

export const s3KeyToPublicPath = (key: string): string => {
	const nameStart = key.lastIndexOf('/') + 1;
	return `${key.slice(0, nameStart)}${encodeURIComponent(key.slice(nameStart))}`;
};
