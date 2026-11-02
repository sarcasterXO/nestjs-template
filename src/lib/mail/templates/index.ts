import { notificationEmail } from './notification';
import { otpEmail } from './otp';

import type { MailTemplate } from '../template';

/** Every email, keyed by its `.hbs` file name in this folder. */
const builders = {
	notification: notificationEmail,
	otp: otpEmail,
};

export type MailTemplateName = keyof typeof builders;
export type MailTemplateVars<N extends MailTemplateName> = Parameters<(typeof builders)[N]>[0];

export const mailTemplates: { [N in MailTemplateName]: MailTemplate<MailTemplateVars<N>> } = builders;
