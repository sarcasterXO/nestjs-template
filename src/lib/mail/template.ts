import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { MailTemplateEngine } from '@nestjs/mail';

export type TemplateVars = Record<string, number | string>;

export interface MailBrand {
	name: string;
	company: string;
	supportEmail: string;
}

export interface MailContent {
	subject: string;
	/** Values for the `.hbs` placeholders. Rendered into `layout.hbs` as `{{{body}}}`. */
	vars?: TemplateVars;
	/** Plain-text alternative for clients that don't render HTML. */
	text?: string;
	/** Inbox preview line shown next to the subject. */
	preheader?: string;
}

/** A template builder: takes the caller's variables and the brand, returns what to render. */
export type MailTemplate<TVars> = (vars: TVars, brand: MailBrand) => MailContent;

/** Available to every template as `{{colorX}}`. */
export const MAIL_THEME = {
	colorBg: '#f5f6f8',
	colorSurface: '#ffffff',
	colorBrandDark: '#1e293b',
	colorBrandCore: '#4f46e5',
	colorBrandLight: '#e0e7ff',
	colorText: '#1f2937',
	colorMuted: '#4b5563',
	colorSubtle: '#9ca3af',
	colorBorder: '#e5e7eb',
	colorWarningBg: '#fff8e1',
	colorWarningBorder: '#f0b400',
	colorWarningText: '#7a5a00',
} as const;

const PLACEHOLDER = /{{{\s*(?<raw>\w+)\s*}}}|{{\s*(?<escaped>\w+)\s*}}/g;
const templateCache = new Map<string, Promise<string>>();

export function escapeHtml(str: string): string {
	const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	return str.replaceAll(/["&'<>]/g, (c) => map[c] ?? c);
}

/**
 * `{{name}}` is HTML-escaped, `{{{name}}}` is inserted as-is. A missing variable throws so a typo in a
 * template fails loudly instead of sending a half-rendered email.
 */
export function renderTemplate(source: string, vars: TemplateVars): string {
	return source.replaceAll(PLACEHOLDER, (_match, raw: string | undefined, escaped: string | undefined) => {
		const key = (raw ?? escaped)!;
		if (!Object.hasOwn(vars, key)) throw new Error(`Missing mail template variable "${key}"`);
		const value = String(vars[key]);
		return raw ? value : escapeHtml(value);
	});
}

async function loadTemplate(name: string): Promise<string> {
	let source = templateCache.get(name);
	if (!source) {
		source = readFile(join(import.meta.dirname, 'templates', `${name}.hbs`), 'utf8');
		templateCache.set(name, source);
	}
	return source;
}

/** Renders `templates/<name>.hbs` into `layout.hbs`; a missing variable throws instead of rendering empty. */
@Injectable()
export class StrictTemplateEngine extends MailTemplateEngine {
	public async render(name: string, context: TemplateVars): Promise<string> {
		const body = renderTemplate(await loadTemplate(name), context);
		return renderTemplate(await loadTemplate('layout'), { ...context, body });
	}
}
