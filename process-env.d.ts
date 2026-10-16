declare namespace NodeJS {
	interface ProcessEnv {
		// Core
		readonly NODE_ENV: 'development' | 'production' | 'test';
		readonly PORT: string;
		readonly DISABLE_SWAGGER: 'false' | 'true';

		// MongoDB
		readonly DB_URI: string;

		// Auth
		readonly JWT_ACCESS_SECRET: string;
		readonly JWT_REFRESH_SECRET: string;

		// S3 / attachments
		readonly ACCESS_KEY_ID: string;
		readonly SECRET_ACCESS_KEY: string;
		readonly AWS_REGION: string;
		readonly S3_NAME: string;
		readonly DEPLOYED_ENVIRONMENT?: string;

		// Web push notifications
		readonly VAPID_PUBLIC_KEY: string;
		readonly VAPID_PRIVATE_KEY: string;
		readonly VAPID_SUBJECT: string;

		// RabbitMQ (delayed notifications)
		readonly RMQ_URI: string;
		readonly RMQ_QUEUE_NAME: string;

		// SMS (Unifonic)
		readonly UNIFONIC_APP_SID?: string;
		readonly UNIFONIC_SENDER_ID?: string;
		readonly UNIFONIC_API_URL?: string;

		// Mail (SMTP)
		readonly SMTP_HOST?: string;
		readonly SMTP_PORT?: string;
		readonly SMTP_SECURE?: 'false' | 'true';
		readonly SMTP_USER?: string;
		readonly SMTP_PASSWORD?: string;
		readonly MAIL_FROM?: string;
		readonly MAIL_BRAND_NAME?: string;
		readonly MAIL_COMPANY_NAME?: string;
		readonly MAIL_SUPPORT_EMAIL?: string;
	}
}
