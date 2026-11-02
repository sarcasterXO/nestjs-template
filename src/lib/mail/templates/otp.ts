import type { MailTemplate } from '../template';

export const otpEmail: MailTemplate<{ otp: string; validMinutes?: number }> = ({ otp, validMinutes = 10 }, brand) => ({
	subject: 'Your verification code',
	preheader: `Your ${brand.name} verification code is ${otp}. Valid for ${validMinutes} minutes.`,
	vars: { otp, validMinutes },
	text: [
		`${brand.name} — Verification code`,
		'',
		'Use the following code to complete your verification:',
		'',
		`    ${otp}`,
		'',
		`This code is valid for ${validMinutes} minutes. For your security, do not share it with anyone.`,
		'',
		"If you didn't request this code, you can safely ignore this email.",
		'',
		`Need help? Contact ${brand.supportEmail}`,
		'',
		`— ${brand.company}`,
	].join('\n'),
});
