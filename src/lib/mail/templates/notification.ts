import { escapeHtml, MAIL_THEME, type MailTemplate } from '../template';

function textToHtml(text: string): string {
	return text
		.trim()
		.split(/\n{2,}/)
		.map((para) => {
			const lines = para
				.split('\n')
				.map((l) => escapeHtml(l))
				.join('<br />');
			return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MAIL_THEME.colorMuted};">${lines}</p>`;
		})
		.join('');
}

/** Plain text rendered as a branded email — blank lines become paragraphs. */
export const notificationEmail =
	({ subject, text }: { subject: string; text: string }): MailTemplate =>
	() => ({
		template: 'notification',
		subject,
		preheader: text.slice(0, 120),
		vars: { heading: subject, paragraphs: textToHtml(text) },
		text,
	});
