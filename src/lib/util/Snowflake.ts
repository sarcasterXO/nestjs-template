import { Snowflake } from '@sapphire/snowflake';

const epoch = new Date('2001-12-25T00:00:00.000Z');

const snowflake = new Snowflake(epoch);

export const generateFlake = () => snowflake.generate().toString();
