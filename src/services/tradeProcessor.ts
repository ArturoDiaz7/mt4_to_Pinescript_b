
import { Trade, GroupedTrades, PineScriptTimestamp } from '../types';

// --- Constants for Timezone and Offset Configuration ---

// MT4 server time is assumed to be UTC+3.
const MT4_UTC_OFFSET = 3;

// TradingView chart time is set to UTC-6.
const TV_UTC_OFFSET = -6;

// A specific +2 hour correction for observed TradingView label placement discrepancies.
const TV_DISPLAY_CORRECTION_HOURS = 2;

/**
 * Parses an MT4 date string (e.g., "2025.06.25 16:09:01") into a true UTC Date object.
 * @param dateStr The date string from the MT4 report.
 * @returns A Date object representing the exact moment in UTC.
 */
export function parseMT4DateToUTC(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(' ');
  const [year, month, day] = datePart.split('.').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  // Create a Date object in UTC, then subtract the MT4 server's offset to get the true UTC time.
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  date.setUTCHours(date.getUTCHours() - MT4_UTC_OFFSET);
  return date;
}

/**
 * Converts a true UTC Date object into a format suitable for Pine Script's timestamp() function,
 * applying necessary offsets for TradingView display.
 * @param trueUtcDate The true UTC Date object for the trade event.
 * @returns An object with { year, month, day, hours, minutes } adjusted for TV.
 */
export function convertToPineScriptTimestamp(trueUtcDate: Date): PineScriptTimestamp {
  // Create a new Date object to avoid mutating the original.
  const adjustedDate = new Date(trueUtcDate.getTime());

  // Apply the target timezone offset (TV_UTC_OFFSET) and the display correction.
  const totalOffset = TV_UTC_OFFSET + TV_DISPLAY_CORRECTION_HOURS;
  adjustedDate.setUTCHours(adjustedDate.getUTCHours() + totalOffset);

  return {
    year: adjustedDate.getUTCFullYear(),
    month: adjustedDate.getUTCMonth() + 1, // Pine Script month is 1-based
    day: adjustedDate.getUTCDate(),
    hours: adjustedDate.getUTCHours(),
    minutes: adjustedDate.getUTCMinutes(),
  };
}


/**
 * Processes the raw HTML content of an MT4 report.
 * @param htmContent The string content of the .htm file.
 * @param beTolerance The tolerance for classifying a trade as "break even".
 * @returns A promise that resolves to the grouped trades object.
 */
export function processReport(htmContent: string, beTolerance: number): Promise<GroupedTrades> {
    return new Promise((resolve, reject) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmContent, "text/html");

            const allTrades: Trade[] = [];
            const tables = doc.getElementsByTagName('table');
            let closedTransactionsTable: HTMLTableElement | null = null;

            for (let i = 0; i < tables.length; i++) {
                const tableText = tables[i].textContent || '';
                if (tableText.includes('Closed Transactions:')) {
                    closedTransactionsTable = tables[i];
                    break;
                }
            }
            
            if (!closedTransactionsTable) {
                return reject(new Error("Could not find the 'Closed Transactions' table in the report."));
            }

            const rows = closedTransactionsTable.getElementsByTagName('tr');
            let isProcessing = false;

            for (const row of Array.from(rows)) {
                const cells = row.getElementsByTagName('td');

                if (cells.length > 0 && cells[0].textContent?.trim() === 'Closed Transactions:') {
                    isProcessing = true;
                    continue; // Skip the header row itself
                }

                if (!isProcessing) continue;

                if (cells.length > 0 && (cells[0].textContent?.includes('Open Trades:') || cells[0].textContent?.includes('Closed P/L:'))) {
                    break; // Stop processing when we hit the next section
                }

                if (cells.length === 14 && !isNaN(parseFloat(cells[0].textContent || ''))) {
                    const profit = parseFloat((cells[13].textContent || "0").replace(/ /g, ''));
                    const trade: Trade = {
                        ticket: cells[0].textContent?.trim() || '',
                        openTimeRaw: cells[1].textContent?.trim() || '',
                        type: cells[2].textContent?.trim() || 'unknown',
                        size: parseFloat(cells[3].textContent?.trim() || '0'),
                        item: (cells[4].textContent?.trim() || 'unknown').toLowerCase(),
                        openPrice: parseFloat(cells[5].textContent?.trim() || '0'),
                        closeTimeRaw: cells[8].textContent?.trim() || '',
                        closePrice: parseFloat(cells[9].textContent?.trim() || '0'),
                        profit: profit,
                    };
                    allTrades.push(trade);
                }
            }

            if (allTrades.length === 0) {
                 return reject(new Error("No closed trades found in the report. Please check the file content."));
            }

            const groupedTrades = classifyAndGroupTrades(allTrades, beTolerance);
            resolve(groupedTrades);
        } catch (error) {
            reject(new Error("Failed to parse the HTML file. It might be corrupted or in an unexpected format."));
        }
    });
}

/**
 * Classifies trades into winners, break-evens, and losers, groups them by item, and handles deduplication.
 * @param allTrades An array of all parsed trades.
 * @param beTolerance The tolerance for break-even classification.
 * @returns A GroupedTrades object.
 */
function classifyAndGroupTrades(allTrades: Trade[], beTolerance: number): GroupedTrades {
    const grouped: GroupedTrades = {};
    const winnersMap: Map<string, Trade> = new Map(); // For deduplication

    // First pass: group losers and breakeven, and populate winnersMap for deduplication
    for (const trade of allTrades) {
        if (!grouped[trade.item]) {
            grouped[trade.item] = { winners: [], breakeven: [], losers: [] };
        }

        if (trade.profit > beTolerance) {
            const key = `${trade.openTimeRaw}_${trade.openPrice}`;
            const existingWinner = winnersMap.get(key);
            if (!existingWinner || trade.profit > existingWinner.profit) {
                winnersMap.set(key, trade); // Keep only the one with the highest profit
            }
        } else if (trade.profit >= -beTolerance && trade.profit <= beTolerance) {
            grouped[trade.item].breakeven.push(trade);
        } else { // profit < -beTolerance
            grouped[trade.item].losers.push(trade);
        }
    }

    // Second pass: add deduplicated winners to the final structure
    for (const winner of winnersMap.values()) {
        grouped[winner.item].winners.push(winner);
    }

    // Sort all categories by open time
    for (const item in grouped) {
        grouped[item].winners.sort((a, b) => parseMT4DateToUTC(a.openTimeRaw).getTime() - parseMT4DateToUTC(b.openTimeRaw).getTime());
        grouped[item].breakeven.sort((a, b) => parseMT4DateToUTC(a.openTimeRaw).getTime() - parseMT4DateToUTC(b.openTimeRaw).getTime());
        grouped[item].losers.sort((a, b) => parseMT4DateToUTC(a.openTimeRaw).getTime() - parseMT4DateToUTC(b.openTimeRaw).getTime());
    }

    return grouped;
}
