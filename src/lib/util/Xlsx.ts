import { Buffer } from 'node:buffer';

import ExcelJS from 'exceljs';

const TEXT_NUM_FMT = '@';

export interface XlsxColumn<T> {
	header: string;
	value: (row: T) => unknown;
	/** Force Excel text format so large numeric IDs are not truncated. */
	asText?: boolean;
}

/** Snowflake IDs are long digit strings; Excel corrupts them when stored as numbers. */
export function isLikelySnowflakeId(value: string): boolean {
	return /^\d{15,20}$/.test(value);
}

/** Detect IDs that were rounded after Excel/JS parsed them as numbers. */
export function isIdCorruptedByExcel(value: string): boolean {
	if (!/^\d{16,}$/.test(value)) return false;
	return String(Number(value)) !== value;
}

function formatCell(value: unknown): string | number | boolean | Date | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) {
		return value
			.map((entry) => {
				const formatted = formatCell(entry);
				return formatted === null ? '' : String(formatted);
			})
			.filter(Boolean)
			.join('; ');
	}
	if (typeof value === 'object') {
		const named = value as { name?: unknown; id?: unknown };
		if (typeof named.name === 'string') return named.name;
		if (typeof named.id === 'string') return named.id;
		return JSON.stringify(value);
	}
	return null;
}

function shouldFormatCellAsText(value: unknown, asText?: boolean): boolean {
	if (asText) return value !== null && value !== undefined && value !== '';
	if (typeof value === 'string') return isLikelySnowflakeId(value);
	if (typeof value === 'number' && Number.isFinite(value)) {
		return isLikelySnowflakeId(String(value));
	}
	return false;
}

export async function toXlsxBuffer<T>(rows: T[], columns: XlsxColumn<T>[], sheetName = 'Sheet1'): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'App';
	workbook.created = new Date();
	const sheet = workbook.addWorksheet(sheetName);

	sheet.columns = columns.map((column) => ({
		header: column.header,
		key: column.header,
		width: Math.max(12, Math.min(40, column.header.length + 4)),
	}));

	sheet.getRow(1).font = { bold: true };

	for (const [colIndex, column] of columns.entries()) {
		if (column.asText) {
			sheet.getColumn(colIndex + 1).numFmt = TEXT_NUM_FMT;
		}
	}

	for (const rowData of rows) {
		const values = columns.map((column) => formatCell(column.value(rowData)));
		const row = sheet.addRow(values);

		for (const [colIndex, column] of columns.entries()) {
			const formatted = values[colIndex];
			if (formatted === null) continue;
			if (!shouldFormatCellAsText(formatted, column.asText)) continue;

			const cell = row.getCell(colIndex + 1);
			cell.value = String(formatted);
			cell.numFmt = TEXT_NUM_FMT;
		}
	}

	const arrayBuffer = await workbook.xlsx.writeBuffer();
	return Buffer.from(arrayBuffer);
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export function xlsxFilename(prefix: string): string {
	const now = new Date();
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `${prefix}-${stamp}.xlsx`;
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cellToString(value: ExcelJS.CellValue): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (typeof value === 'object') {
		const rich = value as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string };
		if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join('');
		if (rich.text !== undefined) return cellToString(rich.text as ExcelJS.CellValue);
		if (rich.result !== undefined) return cellToString(rich.result as ExcelJS.CellValue);
		if (typeof rich.hyperlink === 'string') return rich.hyperlink;
		return JSON.stringify(value);
	}
	return '';
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
	const sheet = workbook.worksheets[0];
	// oxlint-disable-next-line typescript/no-unnecessary-condition
	if (!sheet) return { headers: [], rows: [] };

	const headerRow = sheet.getRow(1);
	const headers: string[] = [];
	headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
		headers[col - 1] = cellToString(cell.value).trim();
	});
	// oxlint-disable-next-line typescript/no-unnecessary-condition
	const cleanHeaders = headers.filter((h) => h !== undefined && h !== null);
	if (cleanHeaders.length === 0) return { headers: [], rows: [] };

	const rows: Record<string, string>[] = [];
	for (let r = 2; r <= sheet.rowCount; r++) {
		const row = sheet.getRow(r);
		const record: Record<string, string> = {};
		let hasValue = false;
		for (const [i, header] of cleanHeaders.entries()) {
			if (!header) continue;
			const cell = row.getCell(i + 1);
			const text = cellToString(cell.value).trim();
			if (text !== '') hasValue = true;
			record[header] = text;
		}
		if (hasValue) rows.push(record);
	}
	return { headers: cleanHeaders, rows };
}

export const XLSX_TEXT_NUM_FMT = TEXT_NUM_FMT;
