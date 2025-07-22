
import { Trade, GroupedTrades } from '../types';
import { parseMT4DateToUTC, convertToPineScriptTimestamp } from './tradeProcessor';

/**
 * Generates the final Pine Script v5 string for a specific trading instrument.
 * @param item The trading instrument (e.g., 'eurusd').
 * @param data The trade data for that instrument ({ winners, breakeven, losers }).
 * @returns A string containing the complete Pine Script code.
 */
export function generatePineScript(item: string, data: { winners: Trade[], breakeven: Trade[], losers: Trade[] }): string {
  const { winners, breakeven, losers } = data;

  const toTimestamp = (dateStr: string) => {
    const utcDate = parseMT4DateToUTC(dateStr);
    return convertToPineScriptTimestamp(utcDate);
  };

  const generateLabels = (trades: Trade[], type: 'winner' | 'breakeven' | 'loser') => {
    return trades.map(trade => {
      const openTimestamp = toTimestamp(trade.openTimeRaw);
      let script = '';

      if (type === 'winner') {
        const closeTimestamp = toTimestamp(trade.closeTimeRaw);
        const tooltipOpen = `Ticket: ${trade.ticket}\\nOpen: ${trade.openTimeRaw} @ ${trade.openPrice}\\nProfit: ${trade.profit.toFixed(2)}`;
        const tooltipClose = `Ticket: ${trade.ticket}\\nClose: ${trade.closeTimeRaw} @ ${trade.closePrice}\\nProfit: ${trade.profit.toFixed(2)}`;
        
        script += `    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=label.style_diamond, color=color.new(color.green, 20), textcolor=color.green, size=iconSize, tooltip='${tooltipOpen}', xloc=xloc.bar_time, yloc=yloc.price)\n`;
        script += `    label.new(timestamp(${closeTimestamp.year}, ${closeTimestamp.month}, ${closeTimestamp.day}, ${closeTimestamp.hours}, ${closeTimestamp.minutes}), ${trade.closePrice}, style=label.style_diamond, color=color.new(color.green, 20), textcolor=color.green, size=iconSize, tooltip='${tooltipClose}', xloc=xloc.bar_time, yloc=yloc.price)\n`;
        script += `    line.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, timestamp(${closeTimestamp.year}, ${closeTimestamp.month}, ${closeTimestamp.day}, ${closeTimestamp.hours}, ${closeTimestamp.minutes}), ${trade.closePrice}, color=color.new(color.white, 20), style=line.style_dotted, width=1, xloc=xloc.bar_time)\n`;
      
      } else if (type === 'breakeven') {
        const tooltip = `Ticket: ${trade.ticket}\\nTime: ${trade.openTimeRaw} @ ${trade.openPrice}\\nProfit: ${trade.profit.toFixed(2)}`;
        script += `    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=label.style_circle, color=color.new(color.blue, 20), textcolor=color.blue, size=iconSize, tooltip='${tooltip}', xloc=xloc.bar_time, yloc=yloc.price)\n`;
      
      } else if (type === 'loser') {
        const tooltip = `Ticket: ${trade.ticket}\\nTime: ${trade.openTimeRaw} @ ${trade.openPrice}\\nProfit: ${trade.profit.toFixed(2)}`;
        // As per instructions: triangle up for buy, triangle down for sell.
        const style = trade.type === 'buy' ? 'label.style_triangleup' : 'label.style_triangledown';
        script += `    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=${style}, color=color.new(color.red, 20), textcolor=color.red, size=iconSize, tooltip='${tooltip}', xloc=xloc.bar_time, yloc=yloc.price)\n`;
      }
      return script;
    }).join('');
  };

  return `//@version=5
indicator("MT4 Trades: ${item.toUpperCase()}", overlay=true, scale = scale.right)

// --- Inputs ---
var tamanoIconosStr = input.string("normal", title="Tamano de Iconos", options=["tiny", "small", "normal", "large", "huge"])

// --- Functions ---
getIconSize(sizeStr) =>
    sizeResult = size.normal
    if sizeStr == "tiny"
        sizeResult := size.tiny
    else if sizeStr == "small"
        sizeResult := size.small
    else if sizeStr == "normal"
        sizeResult := size.normal
    else if sizeStr == "large"
        sizeResult := size.large
    else if sizeStr == "huge"
        sizeResult := size.huge
    sizeResult

var iconSize = getIconSize(tamanoIconosStr)
var drawn = false

// --- Drawing Logic ---
if barstate.islast and not drawn
    drawn := true
    // Winners
${generateLabels(winners, 'winner')}
    // Break Even
${generateLabels(breakeven, 'breakeven')}
    // Losers
${generateLabels(losers, 'loser')}
`;
}