import { Conflux } from 'js-conflux-sdk';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const CONFIG = require('./config.json');
const { coreV1abi } = require('./abi/v1.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'poolStats.json');

function waitMilliseconds(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function readExistingData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading existing data:', err.message);
  }
  return [];
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('Data written to', DATA_FILE);
}

function upsertRecord(existingData, newRecord, keyCols) {
  const index = existingData.findIndex(item =>
    keyCols.every(key => item[key] === newRecord[key])
  );
  if (index >= 0) {
    existingData[index] = newRecord;
    console.log('Updated existing record for', keyCols.map(k => newRecord[k]).join(', '));
  } else {
    existingData.push(newRecord);
    console.log('Added new record for', keyCols.map(k => newRecord[k]).join(', '));
  }
  return existingData;
}

const conflux = new Conflux({
  url: CONFIG.coreUrl,
  networkId: CONFIG.networkId,
});

const coreV1contract = conflux.Contract({ abi: coreV1abi, address: CONFIG.ABCV1CorePoolContractAddr });

function splitHex(concatenatedHex) {
  const hexWithoutPrefix = concatenatedHex.slice(2);
  const valueLength = 64;
  const values = [];
  for (let i = 0; i < hexWithoutPrefix.length; i += valueLength) {
    values.push("0x" + hexWithoutPrefix.slice(i, i + valueLength));
  }
  return values;
}

async function findBlockByTimestamp(targetTimestamp) {
  let latestBlock = await conflux.getBlockByEpochNumber('latest_mined');
  let latestBlockNumber = latestBlock.epochNumber;
  let low = 0;
  let high = latestBlockNumber;
  let closestBlock = latestBlock;

  while (low <= high) {
    await waitMilliseconds(200);
    const mid = Math.floor((low + high) / 2);
    const block = await conflux.getBlockByEpochNumber(mid);

    if (!block) break;

    const blockTimestamp = block.timestamp;

    if (Math.abs(blockTimestamp - targetTimestamp) < Math.abs(closestBlock.timestamp - targetTimestamp)) {
      closestBlock = block;
    }

    if (blockTimestamp < targetTimestamp) {
      low = mid + 1;
    } else if (blockTimestamp > targetTimestamp) {
      high = mid - 1;
    } else {
      return block.epochNumber;
    }
  }

  return closestBlock.epochNumber;
}

async function abcCorePoolStats(d) {
  const ts = Math.floor(d.getTime() / 1000);
  const epochNumber = await findBlockByTimestamp(ts);

  const stakerNumberData = coreV1contract.stakerNumber().data;
  const poolSummaryData = coreV1contract.poolSummary().data;

  const stakerNumber = await conflux.call({
    to: CONFIG.ABCV1CorePoolContractAddr,
    data: stakerNumberData,
  }, epochNumber);

  const poolSummary = await conflux.call({
    to: CONFIG.ABCV1CorePoolContractAddr,
    data: poolSummaryData,
  }, epochNumber);

  const poolStats = splitHex(poolSummary);

  console.log('Done one date', d);
  return {
    snapshotDate: formatDate(d),
    epochNumber: Number(epochNumber),
    chain: 'core',
    version: 'v1',
    stakerNumber: Number(parseInt(stakerNumber, 16)),
    totalPOS: Number(parseInt(poolStats[0], 16))
  };
}

async function main() {
  const args = process.argv.slice(2);
  let targetDate;

  if (args[0]) {
    const dateStr = args[0];
    if (dateStr.length === 8) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      targetDate = new Date(year, month, day);
    } else {
      targetDate = new Date(args[0]);
    }
  } else {
    targetDate = new Date();
  }

  targetDate.setHours(0, 0, 0, 0);

  // Only run on 1st, 11th, 21st of each month
  const day = targetDate.getDate();
  if (day !== 1 && day !== 11 && day !== 21) {
    console.log('Skipping', formatDate(targetDate), '- not 1st, 11th, or 21st');
    return;
  }

  const dateStr = formatDate(targetDate);
  console.log('Fetching core v1 data for', dateStr);

  let existingData = readExistingData();

  try {
    const record = await abcCorePoolStats(targetDate);
    console.log('Record:', record);

    if (!Number.isNaN(record.stakerNumber)) {
      existingData = upsertRecord(existingData, record, ['snapshotDate', 'version', 'chain']);
      writeData(existingData);
    } else {
      console.log('Skipping write - stakerNumber is NaN');
    }
  } catch (err) {
    console.error('Error fetching data for', dateStr, ':', err.message);
  }

  console.log('Core chain data collection complete');
}

main().catch(console.error);
